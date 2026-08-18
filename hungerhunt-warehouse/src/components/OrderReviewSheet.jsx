import { useEffect, useRef } from "react";
import Icon from "./Icon";
import ProductThumb from "./ProductThumb";
import { EmptyState } from "./ui";
import { formatINR } from "../utils/format";

/* The last look before the order leaves the storeroom.
   It covers the shelf entirely rather than sitting in a corner of it: at this
   point the counts are decided and the only questions left are "is this the
   list?" and "who is it going to?". Everything else on the Inventory screen
   would only be noise to read past. */
const OrderReviewSheet = ({
  lines,
  suppliers,
  supplierId,
  onSupplier,
  onQuantity,
  onRemove,
  onClose,
  onSubmit,
  onClear,
  submitting,
  draft,
}) => {
  const closeRef = useRef(null);

  // Opening a full-screen layer that the shelf is still scrolled behind would
  // otherwise leave the thumb scrolling the wrong list.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const priced = lines.filter((line) => Number.isFinite(line.estimatedUnitCost));
  const estimate = priced.reduce(
    (sum, line) => sum + line.quantity * line.estimatedUnitCost,
    0
  );

  return (
    <div className="wh-sheet" role="dialog" aria-modal="true" aria-label="Review this order">
      <header className="wh-sheet-head">
        <button
          type="button"
          className="wh-icon-btn"
          ref={closeRef}
          onClick={onClose}
          aria-label="Back to the shelf"
        >
          <Icon name="arrowLeft" size={22} />
        </button>
        <div>
          <h2 className="wh-sheet-title">Review this order</h2>
          <p className="wh-sheet-sub">
            <span className="wh-num">{lines.length}</span> product
            {lines.length === 1 ? "" : "s"} ·{" "}
            <span className="wh-num">{units}</span> unit{units === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="wh-sheet-body">
        {lines.length === 0 ? (
          <EmptyState icon="🛒" title="The cart is empty">
            Everything has been taken off this order. Go back to the shelf and add
            what you need.
          </EmptyState>
        ) : (
        <>
        {draft && (
          <p className="wh-sheet-note">
            Suggested from stock movement up to{" "}
            {new Date(draft.analyticsAsOf).toLocaleString()}. Orders already open
            have been subtracted.
            {priced.length > 0 && (
              <> Estimated value <strong>{formatINR(estimate)}</strong>.</>
            )}
          </p>
        )}

        <div className="wh-card">
          {lines.map((line) => (
            <div key={line.id} className="wh-tile">
              <ProductThumb src={line.image} name={line.name} size={52} />
              <div className="wh-tile-main">
                <div className="wh-product">{line.name}</div>
                <div className="wh-remaining">
                  on the shelf now <span className="wh-num">{line.stock}</span>
                  {line.unit ? ` ${line.unit}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="wh-icon-btn wh-icon-btn--danger"
                onClick={() => onRemove(line.id)}
                aria-label={`Take ${line.name} off this order`}
              >
                <Icon name="trash" size={20} />
              </button>
              <div className="wh-tile-order">
                <div className="wh-stepper" aria-label={`Order ${line.name}`}>
                  <button
                    type="button"
                    disabled={line.quantity <= 1}
                    onClick={() => onQuantity(line.id, line.quantity - 1)}
                    aria-label={`One less ${line.name}`}
                  >
                    <Icon name="minus" size={22} />
                  </button>
                  <input
                    inputMode="numeric"
                    value={line.quantity}
                    aria-label={`How many ${line.name}`}
                    onChange={(event) =>
                      onQuantity(line.id, Number(event.target.value.replace(/\D/g, "")) || 0)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => onQuantity(line.id, line.quantity + 1)}
                    aria-label={`One more ${line.name}`}
                  >
                    <Icon name="plus" size={22} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <label className="wh-field-label" htmlFor="review-supplier">Supplier</label>
        <select
          id="review-supplier"
          className="wh-input"
          value={supplierId}
          onChange={(event) => onSupplier(event.target.value)}
        >
          <option value="">— not chosen yet —</option>
          {suppliers.map((supplier) => (
            <option key={supplier._id} value={supplier._id}>{supplier.name}</option>
          ))}
        </select>
        <p className="wh-sheet-note wh-sheet-note--quiet">
          Accounts checks and approves this before any money moves. You will see
          it under Purchases once it is sent.
        </p>
        </>
        )}
      </div>

      <footer className="wh-sheet-foot">
        <button
          type="button"
          className="wh-cta"
          disabled={submitting || lines.length === 0}
          onClick={onSubmit}
        >
          {submitting ? "Sending…" : "Send to Accounts"}
        </button>
        {lines.length > 0 && (
          <button
            type="button"
            className="wh-cancel"
            disabled={submitting}
            onClick={onClear}
          >
            Empty the cart
          </button>
        )}
      </footer>
    </div>
  );
};

export default OrderReviewSheet;
