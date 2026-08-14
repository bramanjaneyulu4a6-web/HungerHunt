import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api from "../utils/api";
import Icon from "../components/Icon";
import ProductThumb from "../components/ProductThumb";
import RefreshButton from "../components/RefreshButton";
import OrderReviewSheet from "../components/OrderReviewSheet";
import { Banner, EmptyState, Skeleton } from "../components/ui";

/* The shelf, and the order raised off it.
   Ordering used to be its own screen, which meant deciding what was short in
   one place and typing it in another. Here the count that prompts the order
   and the box you type it into are the same row, so nothing has to be carried
   across a screen in someone's head.

   Two modes, one list. Looking is the default and shows counts only. Ordering
   adds a quantity box and an Add button to every row, and the cart button
   appears the moment the first thing is added. */

const ALL = "All";
const CART_KEY = "wh-purchase-cart";

// Survives tab switches and reloads: a half-built order is real work, and the
// tab bar is one thumb-slip away at all times.
const readStored = () => {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    if (!raw) return { cart: {}, draft: null, supplierId: "" };
    const parsed = JSON.parse(raw);
    return {
      cart: parsed.cart && typeof parsed.cart === "object" ? parsed.cart : {},
      draft: parsed.draft || null,
      supplierId: typeof parsed.supplierId === "string" ? parsed.supplierId : "",
    };
  } catch {
    return { cart: {}, draft: null, supplierId: "" };
  }
};

const Inventory = () => {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState(ALL);

  // Coming back to a half-built order lands in the mode it was being built in.
  const [orderMode, setOrderMode] = useState(() => Object.keys(readStored().cart).length > 0);
  const [typed, setTyped] = useState({});
  const [cart, setCart] = useState(() => readStored().cart);
  const [draft, setDraft] = useState(() => readStored().draft);
  const [supplierId, setSupplierId] = useState(() => readStored().supplierId);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify({ cart, draft, supplierId }));
    } catch {
      // A full or blocked session store costs the user nothing today; the cart
      // simply stops surviving a reload.
    }
  }, [cart, draft, supplierId]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [productsRes, inventoryRes, suppliersRes] = await Promise.all([
        api.get("/products"),
        api.get("/inventory"),
        api.get("/suppliers"),
      ]);

      // The catalogue is the spine, not the inventory: a product that has
      // never been received has no shelf row yet and must still be orderable.
      const stock = new Map();
      for (const row of inventoryRes.data) {
        if (row.productId?._id) stock.set(String(row.productId._id), row.stock);
      }

      setRows(
        productsRes.data.map((product) => {
          const id = String(product._id);
          const onShelf = stock.get(id) ?? 0;
          const reorderLevel = Number(product.reorderLevel) || 0;
          return {
            id,
            name: product.name,
            image: product.image || "",
            unit: product.unit?.name || "",
            group: product.stockGroup?.name || "",
            stock: onShelf,
            low: reorderLevel > 0 && onShelf <= reorderLevel && onShelf > 0,
            empty: onShelf === 0,
          };
        })
      );
      setSuppliers(suppliersRes.data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // Empty shelves, then low ones, then the rest. Within a rank the catalogue's
  // own alphabetical order survives, because Array.sort is stable.
  const ranked = useMemo(
    () => [...rows].sort((a, b) => (a.empty ? 0 : a.low ? 1 : 2) - (b.empty ? 0 : b.low ? 1 : 2)),
    [rows]
  );

  const groups = useMemo(() => {
    const named = [...new Set(rows.map((row) => row.group).filter(Boolean))].sort();
    return [ALL, ...named];
  }, [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ranked.filter(
      (row) =>
        (group === ALL || row.group === group) &&
        (!query || row.name.toLowerCase().includes(query))
    );
  }, [ranked, group, search]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const cartIds = Object.keys(cart);

  const lines = useMemo(
    () =>
      Object.keys(cart).map((id) => {
        const row = byId.get(id);
        const suggestion = draft?.items?.find((item) => String(item.productId) === id);
        return {
          id,
          name: row?.name || "Product",
          image: row?.image || "",
          unit: row?.unit || "",
          stock: row?.stock ?? 0,
          quantity: cart[id],
          estimatedUnitCost: suggestion?.estimatedUnitCost,
        };
      }),
    [byId, cart, draft]
  );

  const fieldValue = (row) =>
    typed[row.id] !== undefined
      ? typed[row.id]
      : cart[row.id] != null
        ? String(cart[row.id])
        : "";

  const setField = (id, value) =>
    setTyped((current) => ({ ...current, [id]: String(value).replace(/\D/g, "") }));

  const commit = (row) => {
    const wanted = Number(fieldValue(row) || 0);
    if (wanted > 0) {
      setCart((current) => ({ ...current, [row.id]: wanted }));
      setJustAdded(row.id);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setJustAdded(null), 1200);
      return;
    }
    setCart((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    setTyped((current) => ({ ...current, [row.id]: "" }));
  };

  // Four states, one button, and never a guess about what pressing it does.
  const action = (row) => {
    const wanted = Number(fieldValue(row) || 0);
    const inCart = cart[row.id];
    if (inCart == null) return { label: "Add", disabled: wanted <= 0, tone: "add" };
    if (wanted === inCart) return { label: "Added", disabled: true, tone: "done" };
    if (wanted > 0) return { label: "Update", disabled: false, tone: "add" };
    return { label: "Remove", disabled: false, tone: "remove" };
  };

  const suggest = async () => {
    if (
      cartIds.length > 0 &&
      !window.confirm("Replace what is already in the cart with the suggested order?")
    ) {
      return;
    }

    setDrafting(true);
    try {
      const response = await api.post("/v1/replenishment-drafts");
      const suggestion = response.data.data;
      if (!suggestion.items.length) {
        toast.success("Nothing needs reordering once open orders are counted");
        return;
      }
      const next = {};
      for (const item of suggestion.items) {
        next[String(item.productId)] = item.suggestedQuantity;
      }
      setDraft(suggestion);
      setCart(next);
      setTyped({});
      setOrderMode(true);
      setReviewOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not work out what is low");
    } finally {
      setDrafting(false);
    }
  };

  const clearCart = () => {
    if (!window.confirm("Empty the cart and start this order again?")) return;
    setCart({});
    setTyped({});
    setDraft(null);
    setReviewOpen(false);
  };

  const submit = async () => {
    const items = cartIds
      .map((id) => ({ productId: id, quantity: Number(cart[id]) }))
      .filter((item) => item.quantity > 0);

    if (!items.length) {
      toast.error("Add a quantity to at least one product");
      return;
    }

    // A draft only pays for itself while the order stays inside it — the
    // server refuses products it never suggested. Straying outside is normal
    // and quietly becomes an ordinary purchase order rather than an error.
    const withinDraft =
      draft && items.every((item) =>
        draft.items.some((line) => String(line.productId) === item.productId)
      );

    setSubmitting(true);
    try {
      if (withinDraft) {
        await api.post(`/v1/replenishment-drafts/${draft.id}/submit`, {
          items,
          ...(supplierId ? { supplierId } : {}),
        });
      } else {
        await api.post("/v1/purchase-orders", {
          items,
          ...(supplierId ? { supplierId } : {}),
          reason: "Warehouse replenishment request",
        });
      }
      setCart({});
      setTyped({});
      setDraft(null);
      setSupplierId("");
      setReviewOpen(false);
      setOrderMode(false);
      toast.success("Request sent to Accounts for review");
      navigate("/purchases");
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not raise the order");
      setSubmitting(false);
    }
  };

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Inventory</h1>
          <p className="wh-subtitle">
            {orderMode
              ? "Type how many you need, then press Add"
              : "What is on the shelf right now"}
          </p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      <div className="wh-modebar">
        <button
          type="button"
          className={`wh-mode-btn${orderMode ? " active" : ""}`}
          aria-pressed={orderMode}
          onClick={() => setOrderMode((current) => !current)}
        >
          <Icon name={orderMode ? "eye" : "cart"} size={20} />
          {orderMode ? "Just look" : "Order stock"}
        </button>
        <button
          type="button"
          className="wh-mode-btn"
          disabled={drafting || loading}
          onClick={suggest}
        >
          <Icon name="trendDown" size={20} />
          {drafting ? "Checking…" : "Suggest what is low"}
        </button>
      </div>

      <div className="wh-search">
        <Icon name="search" size={20} />
        <input
          className="wh-search-input"
          placeholder="Find a product"
          aria-label="Find a product by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {groups.length > 2 && (
        <div className="wh-chipbar" role="tablist" aria-label="Product categories">
          {groups.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={group === name}
              className={`wh-chip${group === name ? " active" : ""}`}
              onClick={() => setGroup(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <Banner variant="alert" icon="⚠️">Could not load the shelf. Refresh to try again.</Banner>
      )}

      {loading ? (
        <Skeleton height={300} radius={14} style={{ marginTop: 12 }} />
      ) : visible.length === 0 && !loadError ? (
        <EmptyState icon="📦" title="Nothing found">
          No product here matches that search.
        </EmptyState>
      ) : (
        <div className="wh-card wh-card--list">
          {visible.map((row) => {
            const state = action(row);
            return (
              <div
                key={row.id}
                className={`wh-tile${justAdded === row.id ? " wh-tile--added" : ""}`}
              >
                <ProductThumb src={row.image} name={row.name} />

                <div className="wh-tile-main">
                  <div className="wh-product">{row.name}</div>
                  <div className="wh-remaining">
                    {row.empty
                      ? "none on the shelf"
                      : row.low
                        ? "running low"
                        : row.group || "in stock"}
                    {cart[row.id] != null && (
                      <span className="wh-in-cart">
                        · <span className="wh-num">{cart[row.id]}</span> in the cart
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`wh-count${row.empty ? " wh-count--zero" : row.low ? " wh-count--low" : ""}`}
                >
                  <span className="wh-num">{row.stock}</span>
                  <small>{row.unit || "on shelf"}</small>
                </div>

                {orderMode && (
                  <div className="wh-tile-order">
                    <div className="wh-stepper" aria-label={`Order ${row.name}`}>
                      <button
                        type="button"
                        disabled={Number(fieldValue(row) || 0) <= 0}
                        onClick={() => setField(row.id, Number(fieldValue(row) || 0) - 1)}
                        aria-label={`One less ${row.name}`}
                      >
                        <Icon name="minus" size={22} />
                      </button>
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        value={fieldValue(row)}
                        aria-label={`How many ${row.name} to order`}
                        onChange={(event) => setField(row.id, event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setField(row.id, Number(fieldValue(row) || 0) + 1)}
                        aria-label={`One more ${row.name}`}
                      >
                        <Icon name="plus" size={22} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`wh-add wh-add--${state.tone}`}
                      disabled={state.disabled}
                      onClick={() => commit(row)}
                    >
                      {state.tone === "done" && <Icon name="check" size={18} />}
                      {state.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cartIds.length > 0 && !reviewOpen && (
        <button
          type="button"
          className="wh-fab"
          onClick={() => setReviewOpen(true)}
          aria-label={`Review the order · ${cartIds.length} product${cartIds.length === 1 ? "" : "s"}`}
        >
          <Icon name="cart" size={28} />
          <span className="wh-fab-badge wh-num">{cartIds.length}</span>
        </button>
      )}

      {reviewOpen && (
        <OrderReviewSheet
          lines={lines}
          suppliers={suppliers}
          supplierId={supplierId}
          onSupplier={setSupplierId}
          onQuantity={(id, quantity) => {
            setTyped((current) => ({ ...current, [id]: String(Math.max(0, quantity)) }));
            setCart((current) => {
              if (quantity <= 0) {
                const next = { ...current };
                delete next[id];
                return next;
              }
              return { ...current, [id]: quantity };
            });
          }}
          onRemove={(id) => {
            setCart((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
            setTyped((current) => ({ ...current, [id]: "" }));
          }}
          onClose={() => setReviewOpen(false)}
          onSubmit={submit}
          onClear={clearCart}
          submitting={submitting}
          draft={draft}
        />
      )}
    </div>
  );
};

export default Inventory;
