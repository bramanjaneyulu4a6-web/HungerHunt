import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { formatINR } from "../utils/format";
import { Button } from "../components/ui";
import { useSessionTimers } from "../hooks/useSessionTimers";
import hungerLogo from "../assets/Logo.png";

const PLACEHOLDER = "https://placehold.co/400x300?text=No+Image";

// How long the ending is held before the screen returns to the gate. Long
// enough to read twice, short enough that the next person in the queue is not
// waiting on somebody else's receipt — and a touch skips it anyway.
const RESULT_SECONDS = 5;

// Matches PURCHASE_CODE_LENGTH in backend/utils/validation.js, which is what
// actually enforces it. Here it only shapes the field.
const PURCHASE_CODE_LENGTH = 4;

// Stock group names arrive however they were typed into the admin console
// ("CHIPS", "biscuits"), so they are title-cased for display only. Filtering
// still compares against the stored value.
const titleCase = (s) =>
  String(s)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// Nutrition is optional: the product schema has no field for it yet, so every
// item renders without a strip until one is added. Anything incomplete counts
// as absent rather than showing as a row of zeroes.
const readNutrition = (product) => {
  const n = product?.nutrition;
  if (!n) return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const calories = num(n.calories);
  const protein = num(n.protein);
  const carbs = num(n.carbs);
  const fat = num(n.fat);

  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }

  return { calories, protein, carbs, fat, serving: n.serving || "" };
};

// Share of an item's energy from each macro — protein and carbohydrate at
// 4 kcal per gram, fat at 9.
const energySplit = ({ protein, carbs, fat }) => {
  const kcal = { protein: protein * 4, carbs: carbs * 4, fat: fat * 9 };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return {
    protein: { kcal: Math.round(kcal.protein), pct: pct(kcal.protein) },
    carbs: { kcal: Math.round(kcal.carbs), pct: pct(kcal.carbs) },
    fat: { kcal: Math.round(kcal.fat), pct: pct(kcal.fat) },
  };
};

const toProduct = (item) => ({
  _id: item.productId?._id,
  name: item.productId?.name,
  price: item.productId?.price,
  image: item.productId?.image,
  stock: item.stock,
  stockGroup: item.productId?.stockGroup,
  nutrition: readNutrition(item.productId),
});

const KioskBilling = ({ student, onLogout }) => {
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);

  /* How the sale ended: null while it is still going, then 'paid' or
     'pending'. Once set the session is over — the wall is gone, the timers
     stop, and the only thing left running is the few seconds this screen is
     held for. */
  const [result, setResult] = useState(null);

  // Starts true: the catalogue is fetched on mount, and seeding the flag here
  // keeps that effect free of a synchronous setState.
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [inventoryError, setInventoryError] = useState("");

  const [ticketFolded, setTicketFolded] = useState(false);
  const [nutritionFor, setNutritionFor] = useState(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [purchasePassword, setPurchasePassword] = useState("");
  const [paying, setPaying] = useState(false);

  // `paying` drives the disabled state and the label, but it cannot be the
  // lock: setPaying does not apply until the next render, so taps landing in
  // the same tick all read false and every one of them posts. A ref flips
  // synchronously, so the second tap bails no matter how fast it arrives.
  const payingRef = useRef(false);

  // Fetching and applying are kept apart so the mount effect can await before
  // it touches state — no synchronous setState, no cascading render.
  const loadInventory = async () => {
    try {
      const res = await api.get("/inventory");

      if (!Array.isArray(res.data)) {
        return {
          products: [],
          error: "Inventory data could not be loaded. Please try refreshing.",
        };
      }

      return {
        products: res.data
          .filter((item) => item.stock > 0 && item.productId)
          .map(toProduct)
          .filter((item) => item._id),
        error: "",
      };
    } catch (err) {
      console.error(err);
      return {
        products: [],
        error: "Failed to load inventory. Please try refreshing.",
      };
    }
  };

  const applyInventory = useCallback(({ products: next, error }) => {
    // A failed load keeps whatever is already on screen rather than blanking
    // the wall mid-service; the banner says what happened.
    if (!error) setProducts(next);
    setInventoryError(error);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await loadInventory();
      if (!cancelled) applyInventory(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [applyInventory]);

  // A cleared quantity box prices as 1, which is what checkout posts and what
  // the steppers clamp to. Treating it as 0 here understated the bill.
  const invoiceTotal = cart.reduce(
    (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 1),
    0
  );

  const refreshPage = async () => {
    setLoadingProducts(true);
    // Named for what it is rather than `result`, which now means how the sale
    // ended and is in scope here.
    const refreshed = await loadInventory();
    applyInventory(refreshed);

    // A failed refresh must leave the ticket alone. Reconciling against the
    // empty list an error returns would silently clear every line the moment
    // the network hiccuped, mid-sale.
    if (refreshed.error) return;

    // Reconcile the ticket against fresh stock rather than dropping it.
    setCart((prevCart) =>
      prevCart
        .map((cartItem) => {
          const latest = refreshed.products.find((p) => p._id === cartItem._id);
          if (!latest) return null;

          return {
            ...cartItem,
            price: latest.price,
            stock: latest.stock,
            quantity: Math.min(
              parseInt(cartItem.quantity, 10) || 1,
              latest.stock
            ),
          };
        })
        .filter((item) => item && item.stock > 0)
    );
  };

  const addToCart = (product) => {
    if (product.stock < 1) return;

    setCart((prev) =>
      prev.some((item) => item._id === product._id)
        ? prev
        : [...prev, { ...product, quantity: 1 }]
    );
  };

  const stepQuantity = (productId, amount) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item._id !== productId) return item;

          const maxStock =
            products.find((p) => p._id === productId)?.stock ?? item.stock;
          const next = (parseInt(item.quantity, 10) || 0) + amount;

          if (next > maxStock) {
            toast.error(`Only ${maxStock} in stock.`);
            return item;
          }

          // Stepping below one takes the line off the ticket.
          if (next < 1) return null;

          return { ...item, quantity: next };
        })
        .filter(Boolean)
    );
  };

  const setQuantity = (productId, value) => {
    if (value === "") {
      setCart((prev) =>
        prev.map((item) =>
          item._id === productId ? { ...item, quantity: "" } : item
        )
      );
      return;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;

    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item._id !== productId) return item;

        const maxStock =
          products.find((p) => p._id === productId)?.stock ?? item.stock;

        if (parsed < 1) return { ...item, quantity: 1 };
        if (parsed > maxStock) {
          toast.error(`Only ${maxStock} in stock.`);
          return { ...item, quantity: maxStock };
        }

        return { ...item, quantity: parsed };
      })
    );
  };

  const removeFromCart = (productId) =>
    setCart((prev) => prev.filter((item) => item._id !== productId));

  // Empties the ticket without ending the session. Starting the basket again
  // is not the same as being finished — that is what Done is for.
  const voidTicket = () => {
    setCart([]);
    setProductSearchQuery("");
    setConfirmVoid(false);
  };

  // The ticket priced as lines the server can charge. A cleared quantity box
  // bills as 1, the same way it prices.
  const billedItems = () =>
    cart.map((item) => ({
      productId: item._id,
      quantity: parseInt(item.quantity, 10) || 1,
    }));

  // The token comes from verify-payment and is bound to exactly the lines that
  // were sent with it, so those same lines are passed in here rather than read
  // off the cart again — anything re-derived in between would not match, and
  // the server would refuse the charge.
  const handleCheckout = async (items, purchaseToken) => {
    // The balance is the one the session was opened with. The server re-reads
    // it before charging, so this only saves a round trip to be told no.
    if (invoiceTotal > student.pocketMoney) {
      toast.error("Not enough in your wallet for this.");
      return;
    }

    try {
      // No studentId: the session's token says whose wallet this is, and the
      // server reads it from there rather than from anything sent here.
      await api.post("/transactions/bill", {
        items,
        totalAmount: invoiceTotal,
        purchaseToken,
      });

      setResult("paid");
    } catch (err) {
      console.error("Checkout Error:", err);
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Checkout failed"
      );
    }
  };

  /* The other ending. When a parent has asked to approve their child's
     purchases, the same code buys a request rather than the food: nothing is
     charged and no stock moves until they say yes in the app. So the screen
     that follows has to be unambiguous that nothing has been paid for yet. */
  const requestApproval = async (items, purchaseToken) => {
    try {
      await api.post("/pending-orders", { items, purchaseToken });

      setResult("pending");
    } catch (err) {
      console.error("Approval request error:", err);
      toast.error(
        err.response?.data?.message || "Could not send the order for approval",
        { duration: 8000 }
      );
    }
  };

  const handleVerifyAndPay = async () => {
    // Without this guard a second tap during the verify round-trip re-enters
    // from the same closure and bills the student twice.
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);

    try {
      const items = billedItems();

      // Only the code and the lines. Who is paying comes from the session's
      // token, and the parent's mobile number is no longer a second factor —
      // there is nobody at the counter to ask for it.
      const { data } = await api.post("/transactions/verify-payment", {
        password: purchasePassword,
        items,
      });

      setShowVerifyModal(false);
      setPurchasePassword("");

      // The code was right either way. Which of the two endings follows is the
      // parent's standing choice, reported by verify-payment so the till does
      // not have to look the student up a second time to find out.
      if (data?.requiresApproval) {
        await requestApproval(items, data?.purchaseToken);
      } else {
        await handleCheckout(items, data?.purchaseToken);
      }
    } catch (err) {
      /* Locked out. Five wrong codes closes checkout for fifteen minutes, and
         there is nothing to be done at this terminal in the meantime — so the
         session ends rather than leaving a child tapping at a cart they cannot
         pay for, with a queue behind them. */
      if (err.response?.status === 423) {
        toast.error(
          err.response.data?.message || "Too many wrong codes.",
          { duration: 7000 }
        );
        onLogout();
        return;
      }

      toast.error(err.response?.data?.message || "Verification Failed");
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  // Inert while the charge is in flight — including the backdrop, which used to
  // stay clickable and could dismiss the modal mid-request.
  const closeVerify = () => {
    if (payingRef.current) return;
    setShowVerifyModal(false);
    setPurchasePassword("");
  };

  const categories = [
    "All",
    ...new Set(products.map((p) => p.stockGroup?.name).filter(Boolean)),
  ];

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "All" || p.stockGroup?.name === selectedCategory;

    const matchesSearch = p.name
      ?.toLowerCase()
      .includes(productSearchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // The segmented lens is measured from the live segment rather than hardcoded,
  // so it stays correct whatever the stock groups turn out to be called.
  const segRef = useRef(null);
  const [lens, setLens] = useState({ x: 0, w: 0 });
  const categoryKey = categories.join("|");

  useLayoutEffect(() => {
    const seat = () => {
      const active = segRef.current?.querySelector('[data-on="true"]');
      if (!active) return;
      setLens({ x: active.offsetLeft, w: active.offsetWidth });
    };

    seat();
    window.addEventListener("resize", seat);
    return () => window.removeEventListener("resize", seat);
  }, [selectedCategory, categoryKey]);

  /* The session's clocks. They stop once the sale has ended — the result
     screen is not part of the session, and asking "still there?" over
     somebody's receipt would be asking about something already finished.

     isBusy is read through the ref rather than the state so the cap sees the
     charge that is in flight right now, not the one the last render knew
     about. */
  const { capRemaining, capWarning, idlePrompt, idleRemaining, dismissIdle } =
    useSessionTimers({
      active: !result,
      onExpire: onLogout,
      isBusy: () => payingRef.current,
    });

  /* The result screen's own clock. Declared up here with the other hooks
     rather than beside the screen it belongs to, because that screen is an
     early return and a hook after it would not run on every render. */
  useEffect(() => {
    if (!result) return undefined;

    const exit = setTimeout(onLogout, RESULT_SECONDS * 1000);
    return () => clearTimeout(exit);
  }, [result, onLogout]);

  // A session always has its student, so none of this is conditional any more.
  const itemCount = cart.length;
  const remaining = student.pocketMoney - invoiceTotal;
  const short = remaining < 0;
  const canPay = cart.length > 0 && !short;

  /* How the session ends. Held long enough to be read over a shoulder in a
     queue, and skippable by touching it — the next student should not have to
     wait out somebody else's receipt. The timers do not run here; the session
     is already over, and this is only the telling. */
  if (result) {
    return (
      <div className="kiosk-result" onClick={onLogout} role="status">
        <div
          className={`kiosk-result-mark kiosk-result-mark--${result}`}
          aria-hidden="true"
        >
          {result === "paid" ? "✓" : "⏳"}
        </div>

        <h1>
          {result === "paid" ? "Order confirmed" : "Sent to your parent"}
        </h1>

        <p>
          {result === "paid"
            ? "Collect your items at the counter. Enjoy!"
            : "Nothing has been charged yet — your parent has been asked to approve it."}
        </p>
      </div>
    );
  }

  const ticketVisible = cart.length > 0 && !ticketFolded;
  const stubVisible = cart.length > 0 && ticketFolded;

  return (
    <>
      <div
        className={`till${cart.length === 0 ? " till--bare" : ""}${
          stubVisible ? " till--folded" : ""
        }`}
      >
        {ticketVisible && (
          <aside className="ticket-col">
            <div className="ticket-brand">
              <img src={hungerLogo} alt="" />
              <span>Counter 1</span>
            </div>

            <div className="ticket">
              <div className="ticket-slip">
                <h2>Order Ticket</h2>
                <p>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>

              {/* The hostel and the father's name were here for a cashier
                  making sure they had the right child. The child is holding
                  the terminal now, so what is left is what they came to check:
                  that this is them, and what they have to spend. */}
              <div className="ticket-who">
                <div className="ticket-who-row">
                  <span>Student</span>
                  <b>{student.name}</b>
                </div>
                <div className="ticket-who-row">
                  <span>Admission</span>
                  <b>{student.admissionNumber}</b>
                </div>
                <div className="ticket-wallet">
                  <span>Wallet</span>
                  <b className="money">{formatINR(student.pocketMoney)}</b>
                </div>
              </div>

              <div className="ticket-lines">
                <div className="ticket-lhead">
                  <span />
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Amount</span>
                  <span />
                </div>

                {cart.map((item) => (
                  <div className="ticket-line" key={item._id}>
                    <img src={item.image || PLACEHOLDER} alt="" />

                    <div className="ticket-line-name">
                      {item.name}
                      <em className="money">{formatINR(item.price)} each</em>
                    </div>

                    <div className="ticket-line-qty money">{item.quantity}</div>

                    <div className="ticket-line-amt money">
                      {formatINR(
                        item.price * (parseInt(item.quantity, 10) || 1)
                      )}
                    </div>

                    <button
                      type="button"
                      className="ticket-line-drop"
                      onClick={() => removeFromCart(item._id)}
                      aria-label={`Remove ${item.name} from the ticket`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="ticket-tot">
                <div className="ticket-tot-row">
                  <span>Items</span>
                  <b className="money">{itemCount}</b>
                </div>

                <div
                  className={`ticket-tot-row${
                    short ? " ticket-tot-row--short" : ""
                  }`}
                >
                  <span>{short ? "Short by" : "Balance after"}</span>
                  <b className="money">{formatINR(Math.abs(remaining))}</b>
                </div>

                <div className="ticket-grand">
                  <span>Total</span>
                  <b className="money" key={invoiceTotal}>
                    {formatINR(invoiceTotal)}
                  </b>
                </div>

                <Button
                  className="btn--place"
                  disabled={!canPay}
                  onClick={() => setShowVerifyModal(true)}
                >
                  Place Order
                </Button>

                <Button
                  className="btn--void"
                  onClick={() => setConfirmVoid(true)}
                >
                  Void ticket
                </Button>
              </div>
            </div>

            <button
              type="button"
              className="ticket-handle"
              onClick={() => setTicketFolded(true)}
              aria-label="Hide the order ticket"
            >
              &lsaquo;
            </button>
          </aside>
        )}

        {stubVisible && (
          <aside className="ticket-stub">
            <div
              className="ticket-stub-paper"
              role="button"
              tabIndex={0}
              onClick={() => setTicketFolded(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setTicketFolded(false);
              }}
              aria-label="Show the order ticket"
            >
              <span className="ticket-stub-n money">{itemCount}</span>
              <span className="ticket-stub-rot">Order ticket</span>
              <span className="ticket-stub-tot">
                <span>Total</span>
                <b className="money">{formatINR(invoiceTotal)}</b>
              </span>
            </div>

            <button
              type="button"
              className="ticket-handle"
              onClick={() => setTicketFolded(false)}
              aria-label="Show the order ticket"
            >
              &rsaquo;
            </button>
          </aside>
        )}

        <section className="wall">
          <div className="wall-top">
            {cart.length === 0 && (
              <img className="wall-logo" src={hungerLogo} alt="Hunger Hunt" />
            )}

            {/* Where the student search used to be. Nobody is looked up here
                any more — the session already knows who this is, so the bar
                reports it instead of asking. */}
            <div className="serving glass">
              <span className="serving-avatar" aria-hidden="true">
                {student.name?.charAt(0).toUpperCase()}
              </span>

              <div className="serving-who">
                <div className="serving-name">{student.name}</div>
                <div className="serving-meta">№ {student.admissionNumber}</div>
              </div>

              <span className="serving-wallet money">
                {formatINR(student.pocketMoney)}
              </span>

              {/* The way out that is not a timer. A student who has finished,
                  or who changed their mind, should not have to wait to be
                  thrown out before the next one can start. */}
              <Button className="btn--switch" onClick={onLogout}>
                Done
              </Button>
            </div>
          </div>

          {inventoryError && (
            <div className="banner banner--alert" role="status">
              <span aria-hidden="true">⚠️</span>
              <span>{inventoryError}</span>
            </div>
          )}

          <div className="wall-scroll">
            <div className="filterbar">
              <div className="seg" ref={segRef} role="tablist">
                <span
                  className="seg-lens"
                  aria-hidden="true"
                  style={{ "--x": `${lens.x}px`, "--w": `${lens.w}px` }}
                />

                {categories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    role="tab"
                    className="seg-item"
                    data-on={selectedCategory === category}
                    aria-selected={selectedCategory === category}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category === "All" ? "All" : titleCase(category)}
                  </button>
                ))}
              </div>

              <div className="wall-filter glass">
                <span aria-hidden="true">⌕</span>
                <input
                  className="wall-filter-input"
                  placeholder="Find an item…"
                  aria-label="Find an item by name"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loadingProducts ? (
              <div className="wall-state">
                <b>Loading products…</b>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="wall-state">
                <b>Nothing matches</b>
                <span>No items in stock match that category or search.</span>
              </div>
            ) : (
              <div className="wall-grid">
                {filteredProducts.map((p, i) => {
                  const line = cart.find((item) => item._id === p._id);
                  const atCeiling =
                    (parseInt(line?.quantity, 10) || 0) >= p.stock;

                  return (
                    <article className="tile" key={p._id} style={{ "--i": i }}>
                      <figure>
                        <img src={p.image || PLACEHOLDER} alt="" />
                      </figure>

                      {p.nutrition && (
                        <Button
                          className="tile-info"
                          onClick={() => setNutritionFor(p)}
                          aria-label={`Nutrition information for ${p.name}`}
                        >
                          i
                        </Button>
                      )}

                      <span className="tile-price money">
                        {formatINR(p.price)}
                      </span>

                      <div className="tile-body">
                        <h3 className="tile-name">{p.name}</h3>

                        <p className="tile-meta">
                          {p.stockGroup?.name
                            ? `${titleCase(p.stockGroup.name)} · `
                            : ""}
                          {p.stock} left
                        </p>

                        {p.nutrition && (
                          <div className="tile-macros">
                            <div className="tile-macro">
                              <b className="money">{p.nutrition.calories}</b>
                              <span>kcal</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">{p.nutrition.protein}g</b>
                              <span>Prot</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">{p.nutrition.carbs}g</b>
                              <span>Carb</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">{p.nutrition.fat}g</b>
                              <span>Fat</span>
                            </div>
                          </div>
                        )}

                        {line ? (
                          <div className="tile-step">
                            <button
                              type="button"
                              className="tile-step-btn"
                              onClick={() => stepQuantity(p._id, -1)}
                              aria-label={`One fewer ${p.name}`}
                            >
                              &minus;
                            </button>

                            <input
                              className="tile-step-input money"
                              inputMode="numeric"
                              value={line.quantity}
                              aria-label={`Quantity of ${p.name}`}
                              onChange={(e) => setQuantity(p._id, e.target.value)}
                            />

                            <button
                              type="button"
                              className="tile-step-btn"
                              disabled={atCeiling}
                              onClick={() => stepQuantity(p._id, 1)}
                              aria-label={`One more ${p.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <Button
                            className="btn--add"
                            onClick={() => addToCart(p)}
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {nutritionFor && (
        <div
          className="modal-backdrop till-modal-backdrop"
          onClick={() => setNutritionFor(null)}
        >
          <div
            className="modal till-modal nutrition"
            role="dialog"
            aria-modal="true"
            aria-label={`Nutrition information for ${nutritionFor.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nutrition-head">
              <img src={nutritionFor.image || PLACEHOLDER} alt="" />

              <div className="nutrition-head-t">
                <div className="nutrition-kicker">Nutrition</div>
                <h3>{nutritionFor.name}</h3>
                <p className="nutrition-serving">
                  {nutritionFor.nutrition.serving || "Per unit as sold"}
                  {nutritionFor.stockGroup?.name
                    ? ` · ${titleCase(nutritionFor.stockGroup.name)}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                className="btn nutrition-close"
                onClick={() => setNutritionFor(null)}
                aria-label="Close nutrition information"
              >
                ×
              </button>
            </div>

            <div className="nutrition-energy">
              <span>Energy</span>
              <b className="money">
                {nutritionFor.nutrition.calories}
                <i>kcal</i>
              </b>
            </div>

            <div className="nutrition-body">
              {(() => {
                const split = energySplit(nutritionFor.nutrition);

                return [
                  {
                    key: "protein",
                    label: "Protein",
                    grams: nutritionFor.nutrition.protein,
                    modifier: "",
                  },
                  {
                    key: "carbs",
                    label: "Carbohydrate",
                    grams: nutritionFor.nutrition.carbs,
                    modifier: " nutrition-bar--carb",
                  },
                  {
                    key: "fat",
                    label: "Fat",
                    grams: nutritionFor.nutrition.fat,
                    modifier: " nutrition-bar--fat",
                  },
                ].map((row) => (
                  <div className="nutrition-row" key={row.key}>
                    <div className="nutrition-row-t">
                      <span>
                        {row.label}
                        <em className="money">
                          {split[row.key].kcal} kcal · {split[row.key].pct}%
                        </em>
                      </span>
                      <b className="money">{row.grams} g</b>
                    </div>

                    <div className={`nutrition-bar${row.modifier}`}>
                      <i style={{ width: `${split[row.key].pct}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>

            <p className="nutrition-foot">
              Bars show the share of this item&rsquo;s energy from each macro —
              protein and carbohydrate at 4&nbsp;kcal per gram, fat at 9.
            </p>
          </div>
        </div>
      )}

      {confirmVoid && (
        <div
          className="modal-backdrop till-modal-backdrop"
          onClick={() => setConfirmVoid(false)}
        >
          <div
            className="modal till-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title" id="void-title">
              Void this ticket?
            </h2>

            <p className="verify-line">
              The {itemCount} {itemCount === 1 ? "item" : "items"} on the ticket
              and the selected student will be cleared. Nothing is charged.
            </p>

            <div className="modal-actions">
              <Button
                className="btn--quiet"
                onClick={() => setConfirmVoid(false)}
              >
                Keep ticket
              </Button>
              <Button className="btn--confirm btn--destroy" onClick={voidTicket}>
                Void ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* The last thirty seconds. Not a prompt — there is nothing to answer,
          the session is ending either way — so it states it and stays out of
          the way of a student trying to finish. Hidden while the idle prompt
          is up, which is the more urgent of the two. */}
      {capWarning && !idlePrompt && (
        <div className="kiosk-cap-banner" role="status">
          Session ending in {capRemaining}s
        </div>
      )}

      {/* Thirty quiet seconds. Almost always a terminal somebody walked away
          from; occasionally a child deciding. Ten seconds and a visible count
          is enough for the second case and quick enough for the first. Any
          touch anywhere dismisses it, including on this backdrop. */}
      {idlePrompt && (
        <div
          className="kiosk-idle-veil"
          role="alertdialog"
          aria-label="Are you still there?"
        >
          <div className="kiosk-idle-card">
            <h2>Still there?</h2>
            <p>Your session ends in {idleRemaining}s.</p>
            <button type="button" className="kiosk-start" onClick={dismissIdle}>
              I&rsquo;m here
            </button>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div
          className="modal-backdrop till-modal-backdrop"
          onClick={closeVerify}
        >
          <div
            className="modal till-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
            aria-busy={paying}
            onClick={(e) => e.stopPropagation()}
          >
            {/* It was "Parent verification" when a cashier read a phone
                number off the screen and rang the parent. The student is
                standing here now, and what they are being asked for is their
                own code. */}
            <h2 className="modal-title" id="verify-title">
              Enter your purchase code
            </h2>

            <p className="verify-line">
              Your 4-digit code confirms this order and pays from your wallet.
            </p>

            <div className="verify-amount">
              <span>To charge</span>
              <b>{formatINR(invoiceTotal)}</b>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyAndPay();
              }}
            >
              <label className="field-label" htmlFor="purchase-password">
                Purchase code
              </label>

              {/* A student has one secret and it is four digits, so this is a
                  number pad and nothing else: non-digits are dropped as typed
                  and a fifth character is refused. A code from before that rule
                  cannot be entered here on purpose — the parent sets a new one
                  in the app, which needs only their own account password. */}
              <input
                id="purchase-password"
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={PURCHASE_CODE_LENGTH}
                placeholder="4-digit code"
                value={purchasePassword}
                onChange={(e) =>
                  setPurchasePassword(
                    e.target.value.replace(/\D/g, "").slice(0, PURCHASE_CODE_LENGTH)
                  )
                }
                disabled={paying}
              />

              <div className="modal-actions">
                <Button
                  className="btn--quiet"
                  disabled={paying}
                  onClick={closeVerify}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="btn--confirm"
                  disabled={paying || purchasePassword.length < PURCHASE_CODE_LENGTH}
                >
                  {paying ? "Processing…" : "Verify & Pay"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RefreshButton onRefresh={refreshPage} loading={loadingProducts} />
    </>
  );
};

export default KioskBilling;
