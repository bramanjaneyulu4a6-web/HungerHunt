import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { Banner, Skeleton } from "../components/ui";

/* One order, one delivery. Each line starts prefilled with everything still
   outstanding — the common case is "it all arrived" and should be one tap.
   Counting down from there records a shortfall without a single extra screen.

   The clientToken is minted per confirm attempt: if the confirm succeeds the
   screen leaves, and if the network eats the response a retry carries the
   same token, which the server answers with the already-booked receipt
   instead of booking the delivery twice. */
const Receive = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [po, setPo] = useState(null);
  const [lines, setLines] = useState({});      // lineKey -> {received, damaged, reason}
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const clientTokenRef = useRef(crypto.randomUUID());
  const savingRef = useRef(false);             // double-tap guard on top of the token

  // Keyed by product where there is one, but a purchase-order line survives
  // even a deleted product (its own subdocument _id never goes away), so that
  // stays the fallback key rather than crashing on a null productId.
  const lineKey = (item) => item.productId?._id || item._id;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.get(`/purchases/${id}`);
      setPo(res.data);
      const initial = {};
      for (const item of res.data.items) {
        const remaining = Math.max(0, item.quantity - (item.received || 0));
        initial[lineKey(item)] = { received: remaining, damaged: 0, reason: "" };
      }
      setLines(initial);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const setLine = (key, field, value) =>
    setLines((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const clamp = (item, line) => {
    const remaining = Math.max(0, item.quantity - (item.received || 0));
    const received = Math.max(0, Math.min(Number(line.received) || 0, remaining));
    const damaged = Math.max(0, Math.min(Number(line.damaged) || 0, remaining - received));
    return { ...line, received, damaged };
  };

  const summary = useMemo(() => {
    if (!po) return null;
    let toShelf = 0, damaged = 0, short = 0;
    for (const item of po.items) {
      const remaining = Math.max(0, item.quantity - (item.received || 0));
      const line = clamp(item, lines[lineKey(item)] || { received: 0, damaged: 0 });
      toShelf += line.received;
      damaged += line.damaged;
      short += remaining - line.received - line.damaged;
    }
    return { toShelf, damaged, short };
  }, [po, lines]);

  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    // Body construction lives inside the try along with the request itself,
    // and the guard comes back down in `finally` regardless of which of the
    // two throws — otherwise a bad line (e.g. a deleted product) would leave
    // the button stuck on "Booking…" until reload.
    try {
      const body = {
        clientToken: clientTokenRef.current,
        invoiceNumber,
        lines: po.items
          .map((item) => {
            const line = clamp(item, lines[lineKey(item)] || { received: 0, damaged: 0 });
            return {
              productId: item.productId?._id,
              received: line.received,
              damaged: line.damaged,
              reason: line.reason || "",
            };
          })
          // A line with no product left to receive against can never be booked.
          .filter((l) => l.productId && (l.received > 0 || l.damaged > 0)),
      };

      const res = await api.post(`/purchases/${id}/receipts`, body);
      const closed = res.data.purchase?.status === "COMPLETED";
      toast.success(closed ? "Delivery booked — order complete" : "Delivery booked — order stays open for the rest");
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Could not book the delivery");
      // A fresh token for the next attempt only if this one is truly dead —
      // a 4xx settled the answer; anything else may have landed, so keep the
      // token and let the server dedupe.
      if (err.response?.status >= 400 && err.response?.status < 500) {
        clientTokenRef.current = crypto.randomUUID();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="wh-page">
        <Banner variant="alert" icon="⚠️">Could not load this order.</Banner>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="wh-page">
        <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
        <Skeleton height={300} radius={14} />
      </div>
    );
  }

  const nothingToBook = summary && summary.toShelf === 0 && summary.damaged === 0;

  return (
    <div className="wh-page">
      <h1 className="wh-title">{po.supplierId?.name || "Delivery"}</h1>
      <p className="wh-subtitle">
        Count what arrived. Anything short stays on the order.
      </p>

      <div className="wh-card">
        {po.items.map((item) => {
          const key = lineKey(item);
          const remaining = Math.max(0, item.quantity - (item.received || 0));
          const line = clamp(item, lines[key] || { received: 0, damaged: 0 });

          return (
            <div key={key} className="wh-line-item">
              <div>
                <div className="wh-product">{item.productId?.name || "Deleted product"}</div>
                <div className="wh-remaining">
                  ordered <span className="wh-num">{item.quantity}</span>
                  {item.received > 0 && (
                    <> · already in <span className="wh-num">{item.received}</span></>
                  )}
                  {" "}· expecting <span className="wh-num">{remaining}</span>
                </div>

                {line.damaged > 0 && (
                  <input
                    className="wh-input"
                    style={{ marginTop: 8 }}
                    placeholder="What was wrong with the damaged units?"
                    value={line.reason}
                    onChange={(e) => setLine(key, "reason", e.target.value)}
                  />
                )}
              </div>

              <div>
                <div className="wh-stepper" aria-label={`Received ${item.productId?.name}`}>
                  <button
                    type="button"
                    disabled={line.received <= 0}
                    onClick={() => setLine(key, "received", line.received - 1)}
                  >−</button>
                  <input
                    inputMode="numeric"
                    value={line.received}
                    onChange={(e) => setLine(key, "received", e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={line.received + line.damaged >= remaining}
                    onClick={() => setLine(key, "received", line.received + 1)}
                  >+</button>
                </div>
                <button
                  type="button"
                  className="wh-remaining"
                  style={{ background: "none", border: "none", padding: "8px 0 0", cursor: "pointer", color: "var(--wh-red)" }}
                  onClick={() => setLine(key, "damaged", line.damaged > 0 ? 0 : 1)}
                >
                  {line.damaged > 0 ? `damaged: ${line.damaged} (tap to clear)` : "+ mark damaged"}
                </button>
                {line.damaged > 0 && (
                  <div className="wh-stepper" aria-label={`Damaged ${item.productId?.name}`}>
                    <button type="button" onClick={() => setLine(key, "damaged", Math.max(0, line.damaged - 1))}>−</button>
                    <input
                      inputMode="numeric"
                      value={line.damaged}
                      onChange={(e) => setLine(key, "damaged", e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={line.received + line.damaged >= remaining}
                      onClick={() => setLine(key, "damaged", line.damaged + 1)}
                    >+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <label className="wh-field-label" htmlFor="invoice">Supplier invoice no.</label>
      <input
        id="invoice"
        className="wh-input"
        placeholder="e.g. INV-2041"
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
      />

      {summary && (
        <div className="wh-summary">
          <strong className="wh-num">{summary.toShelf}</strong> to the shelf
          {summary.damaged > 0 && <> · <strong className="wh-num">{summary.damaged}</strong> damaged</>}
          {summary.short > 0
            ? <> · <strong className="wh-num">{summary.short}</strong> short — the order stays open for them</>
            : <> · order will be complete</>}
        </div>
      )}

      <button type="button" className="wh-cta" disabled={saving || nothingToBook} onClick={confirm}>
        {saving ? "Booking…" : "Book this delivery"}
      </button>
    </div>
  );
};

export default Receive;
