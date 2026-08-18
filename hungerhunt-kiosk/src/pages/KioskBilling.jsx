import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { formatINR } from "../utils/format";
import { sellable } from "../utils/availability";
import { Button } from "../components/ui";
import { useSessionTimers } from "../hooks/useSessionTimers";
import hungerLogo from "../assets/Logo.png";
import KioskResultScreen from "../components/KioskResultScreen";
import { TECHNICAL_DIFFICULTIES_SCREEN } from "../constants/kioskScreens";
import { BalanceMeter, ErrorFeedback, LimitMeter, StockMeter } from "../components/error/ErrorFeedback";
import { presentError } from "../utils/errorPresentation";

const PLACEHOLDER = "https://placehold.co/400x300?text=No+Image";

const formatSessionTime = (seconds) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

// Matches PURCHASE_CODE_LENGTH in backend/utils/validation.js, which is what
// actually enforces it. Here it only shapes the field.
const PURCHASE_CODE_LENGTH = 4;

// Category names arrive however they were typed into the admin console
// ("CHIPS", "biscuits"), so they are title-cased for display only. Filtering
// still compares against the stored value.
const titleCase = (s) =>
  String(s)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const productNameCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

const sortProductsByName = (items) => [...items].sort((a, b) =>
  productNameCollator.compare(a.name || '', b.name || '') ||
  String(a._id).localeCompare(String(b._id))
);

const stockGroupNames = (products) => {
  const groups = new Map();

  products.forEach((product) => {
    const group = product.stockGroup;
    if (group?.name && !groups.has(group.name)) groups.set(group.name, group);
  });

  return [...groups.values()]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
    .map((group) => group.name);
};

// Nutrition is transcribed off a packet by hand, so it is routinely partial.
// Whatever the office entered is shown and the rest reads as a dash; only a
// product with nothing at all goes without the strip entirely.
//
// Nothing here is derived — no macro energy share, no totals checked against
// the calorie figure. The till repeats what the wrapper says and stops, so
// every number on this screen traces back to one a person read off a packet.
const readNutrition = (product) => {
  const n = product?.nutrition;
  if (!n) return null;

  // null and "" mean never entered; 0 is a fact and survives. Plain Number()
  // flattens the first two to 0 and would print a claim nobody made.
  const num = (v) =>
    v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
      ? null
      : Number(v);

  const macros = {
    calories: num(n.calories),
    protein: num(n.protein),
    carbs: num(n.carbs),
    fat: num(n.fat),
  };

  const serving = n.serving || "";

  if (Object.values(macros).every((v) => v === null) && !serving) return null;

  return { ...macros, serving };
};

// What a figure nobody entered looks like. An em dash, never a 0.
const BLANK = "\u2014";

const grams = (v) => (v === null ? BLANK : `${v} g`);

const toProduct = (item) => ({
  _id: item.productId?._id,
  name: item.productId?.name,
  price: item.productId?.price,
  image: item.productId?.image,
  stock: item.stock,
  stockGroup: item.productId?.stockGroup,
  subCategory: item.productId?.subCategory || "Others",
  nutrition: readNutrition(item.productId),
  purchaseAllowance: item.purchaseAllowance || null,
});

const allowanceCeiling = (product) => {
  const allowance = product?.purchaseAllowance;
  if (!allowance?.enabled) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(allowance.remaining) || 0);
};

const allowancePeriod = (period) => ({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
}[period] || "purchase");

const limitMessage = (product) => {
  const allowance = product.purchaseAllowance;
  if (!allowance?.enabled) return "This item cannot be added.";
  if (allowance.pending > 0) {
    return `${product.name}'s ${allowancePeriod(allowance.period)} limit includes ${allowance.pending} awaiting parent approval.`;
  }
  return `${product.name}'s ${allowancePeriod(allowance.period)} limit has been reached.`;
};

const KioskBilling = ({ student, onLogout }) => {
  const [walletBalance, setWalletBalance] = useState(
    Number(student.wallet?.balance ?? student.pocketMoney ?? 0)
  );
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [productWallScrolled, setProductWallScrolled] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showCategoryWelcome, setShowCategoryWelcome] = useState(true);
  const [openingCategory, setOpeningCategory] = useState("");
  const [cart, setCart] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState(null);
  const [removingIds, setRemovingIds] = useState([]);
  const feedbackTimerRef = useRef(null);
  const categoryTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const removeTimersRef = useRef(new Map());

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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [purchasePassword, setPurchasePassword] = useState("");
  const [paying, setPaying] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [pinIssue, setPinIssue] = useState(null);
  const [lockoutIssue, setLockoutIssue] = useState(null);

  const showFeedback = (error, details = {}) => {
    setFeedback((current) => ({ ...presentError(error, details), ...details, key: (current?.key || 0) + 1 }));
  };

  const refreshWallet = useCallback(async () => {
    const { data } = await api.get('/students/me/wallet');
    setWalletBalance(Number(data.wallet.balance));
    return Number(data.wallet.balance);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/students/me/wallet');
        if (active) setWalletBalance(Number(data.wallet.balance));
      } catch (error) {
        console.error('Could not refresh wallet balance', error);
      }
    };

    load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
    };
  }, []);

  // `paying` drives the disabled state and the label, but it cannot be the
  // lock: setPaying does not apply until the next render, so taps landing in
  // the same tick all read false and every one of them posts. A ref flips
  // synchronously, so the second tap bails no matter how fast it arrives.
  const payingRef = useRef(false);

  // Fetching and applying are kept apart so the mount effect can await before
  // it touches state — no synchronous setState, no cascading render.
  const loadInventory = useCallback(async () => {
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
          .filter(sellable)
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
  }, []);

  const applyInventory = useCallback(({ products: next, error }) => {
    // Preserve the last good catalogue until a successful refresh replaces it;
    // the availability guard below keeps stale products off screen meanwhile.
    if (!error) {
      setProducts(next);
      const nextCategories = stockGroupNames(next);
      setSelectedCategory((current) =>
        nextCategories.includes(current) ? current : (nextCategories[0] || "")
      );
    }
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
  }, [applyInventory, loadInventory]);

  useEffect(
    () => () => {
      window.clearTimeout(feedbackTimerRef.current);
      window.clearTimeout(categoryTimerRef.current);
      removeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      removeTimersRef.current.clear();
    },
    []
  );

  // A cleared quantity box prices as 1, which is what checkout posts and what
  // the steppers clamp to. Treating it as 0 here understated the bill.
  const invoiceTotal = cart.reduce(
    (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 1),
    0
  );

  const refreshPage = useCallback(async () => {
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
              latest.stock,
              allowanceCeiling(latest)
            ),
            purchaseAllowance: latest.purchaseAllowance,
          };
        })
        .filter((item) => item && item.stock > 0 && item.quantity > 0)
    );
  }, [applyInventory, loadInventory]);

  const addToCart = (product) => {
    if (product.stock < 1) return;
    if (allowanceCeiling(product) < 1) {
      showFeedback({ message: limitMessage(product), code: 'PRODUCT_LIMIT' }, {
        product,
      });
      return;
    }

    setCart((prev) =>
      prev.some((item) => item._id === product._id)
        ? prev
        : [...prev, { ...product, quantity: 1 }]
    );

    // A counter display has room to reveal the receipt immediately. On a
    // phone/tablet it would cover the catalogue after every tap, so the new
    // item lands in the animated bottom cart bar instead and the student opens
    // the sheet when they are ready to review it.
    setTicketFolded(
      window.matchMedia?.("(max-width: 900px)").matches ?? false
    );
    setRecentlyAdded(product._id);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(
      () => setRecentlyAdded(null),
      1050
    );
  };

  const stepQuantity = (productId, amount) => {
    const currentLine = cart.find((item) => item._id === productId);
    const currentQuantity = parseInt(currentLine?.quantity, 10) || 1;

    if (amount < 0 && currentLine && currentQuantity <= 1) {
      removeFromCart(productId);
      return;
    }

    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item._id !== productId) return item;

          const latest = products.find((p) => p._id === productId) || item;
          const maxStock = latest.stock ?? item.stock;
          const maxAllowed = Math.min(maxStock, allowanceCeiling(latest));
          const next = (parseInt(item.quantity, 10) || 0) + amount;

          if (next > maxAllowed) {
            if (maxAllowed < maxStock) {
              showFeedback({ message: limitMessage(latest), code: 'PRODUCT_LIMIT' }, { product: latest });
              return item;
            }
            showFeedback({ message: `Only ${maxStock} in stock.` }, { available: maxStock, requested: next });
            return item;
          }

          return { ...item, quantity: next };
        })
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

        const latest = products.find((p) => p._id === productId) || item;
        const maxStock = latest.stock ?? item.stock;
        const maxAllowed = Math.min(maxStock, allowanceCeiling(latest));

        if (parsed < 1) return { ...item, quantity: 1 };
        if (parsed > maxAllowed) {
          if (maxAllowed < maxStock) {
            showFeedback({ message: limitMessage(latest), code: 'PRODUCT_LIMIT' }, { product: latest });
            return { ...item, quantity: maxAllowed };
          }
          showFeedback({ message: `Only ${maxStock} in stock.` }, { available: maxStock, requested: parsed });
          return { ...item, quantity: maxStock };
        }

        return { ...item, quantity: parsed };
      })
    );
  };

  const removeFromCart = (productId) => {
    // The map is the synchronous lock. State does not update until the next
    // render, so relying on removingIds alone would let rapid taps schedule
    // several removals for the same receipt line.
    if (removeTimersRef.current.has(productId)) return;

    setRemovingIds((prev) => [...prev, productId]);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const timer = window.setTimeout(
      () => {
        setCart((prev) => prev.filter((item) => item._id !== productId));
        setRemovingIds((prev) => prev.filter((id) => id !== productId));
        removeTimersRef.current.delete(productId);
      },
      reducedMotion ? 0 : 640
    );
    removeTimersRef.current.set(productId, timer);
  };

  // Empties the order without ending the session. Starting the basket again
  // is not the same as being finished — that is what Done is for.
  const cancelOrder = () => {
    removeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    removeTimersRef.current.clear();
    setRemovingIds([]);
    setCart([]);
    setProductSearchQuery("");
    setConfirmCancel(false);
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
      const issue = presentError(err, { message: err.response?.data?.message || err.response?.data?.error || "Checkout failed" });
      showFeedback(err, issue);
      if (['staleData', 'insufficientStock'].includes(issue.presentation)) refreshPage();
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
      showFeedback(err, { message: err.response?.data?.message || "Could not send the order for approval" });
    }
  };

  const handleVerifyAndPay = async () => {
    // Without this guard a second tap during the verify round-trip re-enters
    // from the same closure and bills the student twice.
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setPinIssue(null);

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
        const liveBalance = await refreshWallet();
        if (invoiceTotal > liveBalance) {
          showFeedback({ message: "Not enough in your wallet for this." }, { available: liveBalance, required: invoiceTotal });
          return;
        }
        await handleCheckout(items, data?.purchaseToken);
      }
    } catch (err) {
      /* Locked out. Five wrong codes closes checkout for fifteen minutes, and
         there is nothing to be done at this terminal in the meantime — so the
         session ends rather than leaving a child tapping at a cart they cannot
         pay for, with a queue behind them. */
      if (err.response?.status === 423) {
        setShowVerifyModal(false);
        setLockoutIssue(presentError(err));
        return;
      }
      const issue = presentError(err);
      setPinIssue((current) => ({ ...issue, key: (current?.key || 0) + 1 }));
      setPurchasePassword("");
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
    setPinIssue(null);
  };

  const categories = stockGroupNames(products);
  const categoryCards = categories.map((category) => {
    const items = sortProductsByName(products.filter(
      (product) => product.stockGroup?.name === category
    ));
    return {
      name: category,
      count: items.length,
      image: items.find((item) => item.image)?.image || "",
    };
  });

  const openCategory = (category) => {
    if (openingCategory) return;
    setOpeningCategory(category);
    setSelectedCategory(category);
    setSearchOpen(false);
    setProductSearchQuery("");
    window.clearTimeout(categoryTimerRef.current);
    categoryTimerRef.current = window.setTimeout(() => {
      setShowCategoryWelcome(false);
      setOpeningCategory("");
    }, 440);
  };

  const categoryProducts = sortProductsByName(products.filter(
    (product) => product.stockGroup?.name === selectedCategory
  ));
  const categorySubCategoryOrder = categoryProducts[0]?.stockGroup?.subCategories || [];
  const normalizedSearch = productSearchQuery.trim().toLocaleLowerCase();
  const filteredProducts = categoryProducts.filter((product) =>
    product.name?.toLocaleLowerCase().includes(normalizedSearch)
  );
  const subCategoryNames = [...new Set(filteredProducts.map((product) => product.subCategory || "Others"))]
    .sort((a, b) => {
      const aIndex = categorySubCategoryOrder.indexOf(a);
      const bIndex = categorySubCategoryOrder.indexOf(b);
      if (aIndex >= 0 || bIndex >= 0) {
        if (aIndex < 0) return 1;
        if (bIndex < 0) return -1;
        return aIndex - bIndex;
      }
      return (a === "Others") - (b === "Others") || a.localeCompare(b);
    });
  const subCategorySections = subCategoryNames.map((name) => ({
    name,
    products: filteredProducts.filter((product) => (product.subCategory || "Others") === name),
  }));

  // The segmented lens is measured from the live segment rather than hardcoded,
  // so it stays correct whatever the categories turn out to be called.
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
    const observer = new ResizeObserver(seat);
    if (segRef.current) observer.observe(segRef.current);
    window.addEventListener("resize", seat);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", seat);
    };
  }, [selectedCategory, categoryKey, showCategoryWelcome]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const focus = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(focus);
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setProductSearchQuery("");
  };

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

  // A session always has its student, so none of this is conditional any more.
  const itemCount = cart.length;
  const remaining = walletBalance - invoiceTotal;
  const short = remaining < 0;
  const canPay = cart.length > 0 && !short;

  /* How the session ends. Held long enough to be read over a shoulder in a
     queue, and skippable by touching it — the next student should not have to
     wait out somebody else's receipt. The timers do not run here; the session
     is already over, and this is only the telling. */
  if (result) {
    return (
      <KioskResultScreen
        variant={result}
        mark={result === "paid" ? "✓" : "⏳"}
        kicker={result === "paid" ? "All done" : "Request sent"}
        title={result === "paid" ? "Order confirmed" : "Sent to your parent"}
        body={result === "paid"
          ? "Collect your items at the counter. Enjoy!"
          : "Nothing has been charged yet — your parent has been asked to approve it."}
        onDone={onLogout}
        tapLabel="Tap anywhere for next order"
      />
    );
  }

  if (lockoutIssue) {
    return (
      <KioskResultScreen
        variant="locked"
        mark="🔒"
        kicker="Purchase code paused"
        title={lockoutIssue.title}
        body="Try again when the lock ends, or ask your parent to set a new purchase code in the app."
        onDone={onLogout}
        seconds={12}
      />
    );
  }

  // The catalogue is the store's front door. A failed inventory request means
  // the backend/store cannot safely take an order, while a successful empty
  // response means there is nothing available to sell. In either case, stop
  // here instead of opening an empty or stale product wall.
  if (inventoryError || (!loadingProducts && categoryCards.length === 0)) {
    return (
      <KioskResultScreen
        {...TECHNICAL_DIFFICULTIES_SCREEN}
        onDone={onLogout}
      />
    );
  }

  if (showCategoryWelcome) {
    return (
      <>
        <main
          className={`kiosk-category-welcome${openingCategory ? " kiosk-category-welcome--opening" : ""}`}
          aria-busy={loadingProducts}
        >
          <div className="kiosk-category-ambient kiosk-category-ambient--one" aria-hidden="true" />
          <div className="kiosk-category-ambient kiosk-category-ambient--two" aria-hidden="true" />

          <header className="kiosk-category-topbar">
            <div className="kiosk-wordmark kiosk-wordmark--category">Hunger Hunt</div>
            <div className="kiosk-category-student">
              <span aria-hidden="true">{student.name?.charAt(0).toUpperCase()}</span>
              <div><small>Ordering for</small><strong>{student.name}</strong></div>
            </div>
            <div className="kiosk-category-wallet">
              <small>Wallet balance</small>
              <strong className="money">{formatINR(walletBalance)}</strong>
            </div>
            <button type="button" className="kiosk-category-exit" onClick={onLogout}>
              End session
            </button>
            <div
              className="kiosk-session-clock kiosk-session-clock--category"
              role="timer"
              aria-label={`${formatSessionTime(capRemaining)} remaining in this session`}
            >
              <small>Session</small>
              <strong>{formatSessionTime(capRemaining)}</strong>
            </div>
          </header>

          <section className="kiosk-category-hero">
            <p>Welcome, {student.name?.split(" ")[0]}</p>
            <h1>What would you like to buy?</h1>
            <span>Choose a category to start your order.</span>
          </section>

          {loadingProducts ? (
            <div className="kiosk-category-grid kiosk-category-grid--loading" aria-label="Loading categories">
              {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
            </div>
          ) : (
            <div className="kiosk-category-grid" role="tablist" aria-label="Product categories">
              {categoryCards.map((category, index) => (
                <button
                  type="button"
                  role="tab"
                  className={`kiosk-category-card${openingCategory === category.name ? " kiosk-category-card--opening" : ""}`}
                  key={category.name}
                  style={{ "--category-index": index }}
                  aria-selected={openingCategory === category.name}
                  onClick={() => openCategory(category.name)}
                >
                  <span className="kiosk-category-card__image">
                    {category.image ? (
                      <img src={category.image} alt="" />
                    ) : (
                      <b aria-hidden="true">{titleCase(category.name).charAt(0)}</b>
                    )}
                  </span>
                  <span className="kiosk-category-card__copy">
                    <strong>{titleCase(category.name)}</strong>
                    <small>{category.count} {category.count === 1 ? "item" : "items"}</small>
                  </span>
                  <span className="kiosk-category-card__arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <button
              type="button"
              className="kiosk-category-resume"
              onClick={() => setShowCategoryWelcome(false)}
            >
              Resume order · {itemCount} {itemCount === 1 ? "item" : "items"} · {formatINR(invoiceTotal)}
            </button>
          )}
        </main>

        {capWarning && !idlePrompt && (
          <div className="kiosk-cap-banner" role="status">
            Session ending in {capRemaining}s
          </div>
        )}
        {idlePrompt && (
          <div className="kiosk-idle-veil" role="alertdialog" aria-label="Are you still there?">
            <div className="kiosk-idle-card">
              <h2>Still there?</h2>
              <p>Your session ends in {idleRemaining}s.</p>
              <button type="button" className="kiosk-start" onClick={dismissIdle}>I&rsquo;m here</button>
            </div>
          </div>
        )}
      </>
    );
  }

  const ticketVisible = cart.length > 0 && !ticketFolded;
  const stubVisible = cart.length > 0 && ticketFolded;

  return (
    <>
      <div
        className={`till till--category-enter${cart.length === 0 ? " till--bare" : ""}${
          stubVisible ? " till--folded" : ""
        }${ticketVisible ? " till--cart-open" : ""}`}
      >
        {ticketVisible && (
          <button
            type="button"
            className="mobile-ticket-backdrop"
            onClick={() => setTicketFolded(true)}
            aria-label="Close order ticket"
          />
        )}

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
                  <b className="money">{formatINR(walletBalance)}</b>
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
                  <div
                    className={`ticket-line${
                      recentlyAdded === item._id
                        ? " ticket-line--paint-born"
                        : ""
                    }${
                      removingIds.includes(item._id)
                        ? " ticket-line--paint-delete"
                        : ""
                    }`}
                    key={item._id}
                  >
                    {(recentlyAdded === item._id ||
                      removingIds.includes(item._id)) && (
                      <span
                        className={`ticket-paint${
                          removingIds.includes(item._id)
                            ? " ticket-paint--erase"
                            : ""
                        }`}
                        aria-hidden="true"
                      >
                        <i /><i /><i /><i /><i /><i /><i /><i />
                      </span>
                    )}
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
                      disabled={removingIds.includes(item._id)}
                      aria-label={`Remove ${item.name} from the order`}
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

                {short && (
                  <BalanceMeter available={walletBalance} required={invoiceTotal} />
                )}

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
                  className="btn--cancel"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel order
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
          <aside
            className={`ticket-stub${recentlyAdded ? " ticket-stub--just-added" : ""}`}
          >
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

        <section className={`wall${productWallScrolled ? " wall--scrolled" : ""}`}>
          <div
            className="wall-scroll"
            onScroll={(event) => setProductWallScrolled(event.currentTarget.scrollTop > 1)}
          >
            <div className="wall-fixed">
              <div className="wall-top">
            <div className="kiosk-wordmark kiosk-wordmark--wall">Hunger Hunt</div>

            {/* Where the student search used to be. Nobody is looked up here
                any more — the session already knows who this is, so the bar
                reports it instead of asking. */}
            <div className="serving glass">
              <span className="serving-avatar" aria-hidden="true">
                {student.name?.charAt(0).toUpperCase()}
              </span>

              <div className="serving-who">
                <div className="serving-label">Ordering for</div>
                <div className="serving-name">{student.name}</div>
                <div className="serving-meta">Admission no. {student.admissionNumber}</div>
              </div>

            </div>

            <button
              type="button"
              className="kiosk-exit"
              onClick={() => setConfirmExit(true)}
              aria-label="Cancel order and end session"
            >
              <span aria-hidden="true">×</span>
            </button>
            <div
              className="kiosk-session-clock"
              role="timer"
              aria-label={`${formatSessionTime(capRemaining)} remaining in this session`}
            >
              <small>Session</small>
              <strong>{formatSessionTime(capRemaining)}</strong>
            </div>
              </div>

              {inventoryError && (
                <ErrorFeedback
                  issue={presentError({ request: true, message: inventoryError })}
                  level="inline"
                  action={{ label: 'Try again', onClick: refreshPage }}
                />
              )}

            <div className={`filterbar${searchOpen ? " filterbar--searching" : ""}`}>
              <div className="filterbar-groups">
                <div
                  className="seg"
                  ref={segRef}
                  role="tablist"
                  aria-hidden={searchOpen}
                >
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
                      tabIndex={searchOpen ? -1 : 0}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {titleCase(category)}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="filterbar-group-logo"
                  aria-label="Close search and show categories"
                  tabIndex={searchOpen ? 0 : -1}
                  onClick={closeSearch}
                >
                  <img src={hungerLogo} alt="" />
                </button>
              </div>

              <div className="wall-search glass">
                <input
                  ref={searchInputRef}
                  className="wall-filter-input"
                  placeholder="Find an item…"
                  aria-label="Find an item by name"
                  tabIndex={searchOpen ? 0 : -1}
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeSearch();
                  }}
                />
                <button
                  type="button"
                  className="wall-search-toggle"
                  aria-label={searchOpen ? "Close product search" : "Search products"}
                  aria-expanded={searchOpen}
                  onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
                >
                  <span aria-hidden="true">{searchOpen ? "×" : "⌕"}</span>
                </button>
              </div>
            </div>
            </div>

            {!loadingProducts && selectedCategory && (
              <header className="wall-group-heading">
                <div>
                  <span>Category</span>
                  <h2>{titleCase(selectedCategory)}</h2>
                </div>
                <p>
                  {productSearchQuery.trim()
                    ? `${filteredProducts.length} matching ${filteredProducts.length === 1 ? 'item' : 'items'}`
                    : `${categoryProducts.length} ${categoryProducts.length === 1 ? 'item' : 'items'} · A–Z`}
                </p>
              </header>
            )}

            {loadingProducts ? (
              <div className="wall-state">
                <b>Loading products…</b>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="wall-state wall-state--empty">
                <span className="wall-state__icon" aria-hidden="true">{productSearchQuery.trim() ? '⌕' : '↻'}</span>
                <b>{productSearchQuery.trim() ? 'No items found' : 'This category is being restocked'}</b>
                <span>
                  {productSearchQuery.trim()
                    ? 'Try another product name or choose a different category.'
                    : 'Choose another category or ask a staff member for help.'}
                </span>
              </div>
            ) : (
              <div className="kiosk-subcategory-shelves">
                {subCategorySections.map((subCategory, sectionIndex) => (
                  <section className="kiosk-subcategory" key={subCategory.name} aria-labelledby={`subcategory-${sectionIndex}`}>
                    <header className="kiosk-subcategory__heading">
                      <div>
                        <h3 id={`subcategory-${sectionIndex}`}>{subCategory.name}</h3>
                      </div>
                      <p>{subCategory.products.length} {subCategory.products.length === 1 ? 'item' : 'items'} <b aria-hidden="true">→</b></p>
                    </header>
                    <div className="wall-grid wall-grid--rail" role="list">
                {subCategory.products.map((p, i) => {
                  const line = cart.find((item) => item._id === p._id);
                  const maxAllowed = Math.min(p.stock, allowanceCeiling(p));
                  const limitReached = maxAllowed < 1;
                  const atCeiling =
                    (parseInt(line?.quantity, 10) || 0) >= maxAllowed;

                  return (
                    <article
                      className={`tile${
                        recentlyAdded === p._id ? " tile--just-added" : ""
                      }`}
                      key={p._id}
                      style={{ "--i": i + sectionIndex }}
                      role="listitem"
                    >
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

                        {p.stockGroup?.name && (
                          <p className="tile-meta">
                            {titleCase(p.stockGroup.name)}
                          </p>
                        )}

                        {p.purchaseAllowance?.enabled && (
                          <p className={`tile-limit${limitReached ? " tile-limit--reached" : ""}`}>
                            {limitReached
                              ? `${allowancePeriod(p.purchaseAllowance.period)} limit reached`
                              : `${p.purchaseAllowance.remaining} left in your ${allowancePeriod(p.purchaseAllowance.period)} limit`}
                          </p>
                        )}

                        {p.nutrition && (
                          <div className="tile-macros">
                            <div className="tile-macro">
                              <b className="money">
                                {p.nutrition.calories === null
                                  ? BLANK
                                  : p.nutrition.calories}
                              </b>
                              <span>kcal</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">
                                {p.nutrition.protein === null
                                  ? BLANK
                                  : `${p.nutrition.protein}g`}
                              </b>
                              <span>Prot</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">
                                {p.nutrition.carbs === null
                                  ? BLANK
                                  : `${p.nutrition.carbs}g`}
                              </b>
                              <span>Carb</span>
                            </div>
                            <div className="tile-macro">
                              <b className="money">
                                {p.nutrition.fat === null
                                  ? BLANK
                                  : `${p.nutrition.fat}g`}
                              </b>
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
                              aria-disabled={atCeiling}
                              onClick={() => stepQuantity(p._id, 1)}
                              aria-label={`One more ${p.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <Button
                            className="btn--add"
                            aria-disabled={limitReached}
                            onClick={() => addToCart(p)}
                          >
                            {limitReached ? "Limit reached" : "Add"}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="kiosk-cart-announcer" aria-live="polite">
        {recentlyAdded
          ? `${products.find((p) => p._id === recentlyAdded)?.name || "Item"} added to order`
          : ""}
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
                {nutritionFor.nutrition.calories === null
                  ? BLANK
                  : nutritionFor.nutrition.calories}
                <i>kcal</i>
              </b>
            </div>

            <div className="nutrition-body">
              {[
                { key: "protein", label: "Protein" },
                { key: "carbs", label: "Carbohydrate" },
                { key: "fat", label: "Fat" },
              ].map((row) => (
                <div className="nutrition-row" key={row.key}>
                  <div className="nutrition-row-t">
                    <span>{row.label}</span>
                    <b className="money">
                      {grams(nutritionFor.nutrition[row.key])}
                    </b>
                  </div>
                </div>
              ))}
            </div>

            <p className="nutrition-foot">
              As printed on the pack. A dash means the figure was not supplied.
            </p>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div
          className="modal-backdrop till-modal-backdrop"
          onClick={() => setConfirmCancel(false)}
        >
          <div
            className="modal till-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title" id="cancel-title">
              Cancel this order?
            </h2>

            <p className="verify-line">
              The {itemCount} {itemCount === 1 ? "item" : "items"} in your cart
              will be removed. Nothing will be charged, and you can keep shopping.
            </p>

            <div className="modal-actions">
              <Button
                className="btn--quiet"
                onClick={() => setConfirmCancel(false)}
              >
                Keep order
              </Button>
              <Button className="btn--confirm btn--destroy" onClick={cancelOrder}>
                Cancel order
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmExit && (
        <div
          className="modal-backdrop till-modal-backdrop"
          onClick={() => setConfirmExit(false)}
        >
          <div
            className="modal till-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="exit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="exit-warning-mark" aria-hidden="true">×</div>

            <h2 className="modal-title" id="exit-title">
              Cancel and exit?
            </h2>

            <p className="verify-line">
              {itemCount > 0
                ? `Your ${itemCount} ${
                    itemCount === 1 ? "item" : "items"
                  } will be removed and your session will end. Nothing will be charged.`
                : "Your session will end and return to the sign-in screen. Nothing will be charged."}
            </p>

            <div className="modal-actions">
              <Button
                className="btn--quiet"
                onClick={() => setConfirmExit(false)}
              >
                Keep ordering
              </Button>
              <Button
                className="btn--confirm btn--destroy"
                onClick={onLogout}
              >
                Cancel &amp; exit
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

      {/* One quiet minute. Almost always a terminal somebody walked away
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
                className={`input${pinIssue ? " field-has-error" : ""}`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={PURCHASE_CODE_LENGTH}
                placeholder="4-digit code"
                value={purchasePassword}
                aria-invalid={Boolean(pinIssue)}
                aria-describedby={pinIssue ? 'purchase-code-error' : undefined}
                onChange={(e) => {
                  setPinIssue(null);
                  setPurchasePassword(e.target.value.replace(/\D/g, "").slice(0, PURCHASE_CODE_LENGTH));
                }}
                disabled={paying}
              />

              <div className={`kiosk-pin-dots${pinIssue ? ' pin-error-shake' : ''}`} aria-hidden="true">
                {Array.from({ length: PURCHASE_CODE_LENGTH }, (_, index) => (
                  <i key={index} className={index < purchasePassword.length ? 'is-filled' : ''} />
                ))}
              </div>

              {pinIssue && (
                <ErrorFeedback id="purchase-code-error" key={pinIssue.key} issue={pinIssue} level="inline" className="kiosk-pin-feedback" />
              )}

              <div className="modal-actions">
                <Button
                  type="submit"
                  className="btn--confirm"
                  disabled={paying || purchasePassword.length < PURCHASE_CODE_LENGTH}
                >
                  {paying ? "Processing…" : "Verify & Pay"}
                </Button>
                <Button
                  className="btn--quiet"
                  disabled={paying}
                  onClick={closeVerify}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feedback && (
        <ErrorFeedback
          key={feedback.key}
          issue={feedback}
          className="error-feedback--kiosk-popover"
          available={feedback.available}
          required={feedback.required}
          action={{ label: 'Got it', onClick: () => setFeedback(null) }}
        >
          {feedback.product && (
            <LimitMeter
              used={feedback.product.purchaseAllowance?.purchased}
              pending={feedback.product.purchaseAllowance?.pending}
              limit={feedback.product.purchaseAllowance?.quantity}
              period={allowancePeriod(feedback.product.purchaseAllowance?.period)}
            />
          )}
          {feedback.available !== undefined && feedback.required === undefined && (
            <StockMeter available={feedback.available} requested={feedback.requested} />
          )}
        </ErrorFeedback>
      )}

      <RefreshButton onRefresh={refreshPage} loading={loadingProducts} />
    </>
  );
};

export default KioskBilling;
