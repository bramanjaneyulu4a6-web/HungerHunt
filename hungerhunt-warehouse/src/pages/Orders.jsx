import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import Icon from "../components/Icon";
import { Banner, EmptyState, Skeleton } from "../components/ui";
import api from "../utils/api";
import { groupOrdersByBlock } from "../utils/orderGroups";

const VIEWS = [
  ["PENDING", "New orders"],
  ["PACKED", "Packed"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
];

const REPORT_CATEGORIES = [
  ["MISSING_ITEM", "Stock is missing"],
  ["DAMAGED", "Items are damaged"],
  ["WRONG_ITEM", "Wrong item or details"],
  ["OTHER", "Something else"],
];

const itemLabel = (count) => `${count} item${count === 1 ? "" : "s"}`;

const ItemList = ({ items }) => (
  <div className="wh-unit-items">
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
        <strong className="wh-num">×{item.quantity}</strong>
      </div>
    ))}
  </div>
);

/* A unit is the rooms one caretaker holds, and they travel as one delivery, so
   the board gives them one tile and one button rather than a row each. */
const UnitTile = ({ unit, status, busy, onAdvance, onReport }) => (
  <article className="wh-unit-tile">
    <div className="wh-unit-tile-head">
      <div>
        <span className="wh-unit-kicker">{unit.roomNumbers.length === 1 ? "Room" : "Rooms"}</span>
        <h3>{unit.label}</h3>
      </div>
      <span className="wh-unit-count">
        <strong className="wh-num">{unit.itemCount}</strong>
        <small>items</small>
      </span>
    </div>

    <p className="wh-remaining">
      {unit.items.length} product type{unit.items.length === 1 ? "" : "s"} to handle
      {unit.overdue && <span className="wh-overdue-copy"> · overdue</span>}
    </p>
    <ItemList items={unit.items} />

    <div className="wh-unit-actions">
      <button type="button" className="wh-cta" disabled={busy} onClick={() => onAdvance(unit)}>
        {busy
          ? "Updating…"
          : status === "PENDING"
            ? "Mark as packed"
            : status === "PACKED"
              ? "Deliver"
              : "Record handover"}
      </button>
      {status === "PENDING" && (
        <button type="button" className="wh-report-tile" disabled={busy} onClick={() => onReport(unit)}>
          Report
        </button>
      )}
    </div>
  </article>
);

const Orders = () => {
  const [view, setView] = useState("PENDING");
  const [orders, setOrders] = useState([]);
  // Which rooms travel together is the server's answer, not this screen's.
  const [roomUnits, setRoomUnits] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [reporting, setReporting] = useState(null);
  const [delivery, setDelivery] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get("/v1/fulfillment-orders");
      setOrders(response.data.data || []);
      setRoomUnits(response.data.meta?.roomUnits || []);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([status]) => {
    const statusBlocks = groupOrdersByBlock(orders.filter((order) => order.status === status), roomUnits);
    return [status, statusBlocks.reduce((sum, block) => sum + block.unitCount, 0)];
  })), [orders, roomUnits]);
  const blocks = useMemo(
    () => groupOrdersByBlock(orders.filter((order) => order.status === view), roomUnits),
    [orders, roomUnits, view]
  );
  const activeBlock = blocks.find((block) => block.key === selectedBlock) || null;

  /* Unit keys are compared whole. "unit:1" is a prefix of "unit:10", so a
     substring test would grey out a tile nobody is waiting on. */
  const busyUnits = busyKey ? busyKey.split("|") : [];

  const transitionUnits = async (units, status, proofByUnit = {}) => {
    const key = [status, ...units.map((unit) => unit.key)].join("|");
    setBusyKey(key);
    const work = units.flatMap((unit) =>
      unit.orders.map((order) => api.post(`/v1/fulfillment-orders/${order.id}/transition`, {
        status,
        ...(proofByUnit[unit.key] || {}),
      }))
    );
    const results = await Promise.allSettled(work);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      console.error(failed.map((result) => result.reason));
      toast.error(failed.length === results.length
        ? "Nothing was updated. Check the latest order state and try again."
        : `${results.length - failed.length} updated; ${failed.length} need another try.`);
    } else {
      toast.success(status === "PACKED"
        ? "Moved to Packed"
        : status === "OUT_FOR_DELIVERY"
          ? "Moved to Out for delivery"
          : "Handover recorded — delivered once the student collects it");
    }
    setBusyKey("");
    await load();
  };

  const openDelivery = (units, { wholeBlock = false, blockLabel = "" } = {}) => setDelivery({
    units,
    wholeBlock,
    blockLabel,
    receivers: wholeBlock
      ? { block: { receivedBy: "", receiverPhone: "" } }
      : { [units[0].key]: { receivedBy: "", receiverPhone: "" } },
    error: "",
  });

  // One row per receiver: a whole-block handover records one person for the
  // block, a unit handover records one person for the rooms that unit holds.
  const receiverRows = (state) => state.wholeBlock
    ? [{
        key: "block",
        label: state.blockLabel,
        rooms: state.units.length,
        itemCount: state.units.reduce((sum, unit) => sum + unit.itemCount, 0),
      }]
    : state.units.map((unit) => ({
        key: unit.key,
        label: unit.label,
        rooms: unit.roomNumbers.length,
        itemCount: unit.itemCount,
      }));

  const submitDelivery = async (event) => {
    event.preventDefault();
    const rows = receiverRows(delivery);
    const incomplete = rows.find((row) => {
      const receiver = delivery.receivers[row.key];
      return receiver.receivedBy.trim().length < 2 ||
        receiver.receiverPhone.replace(/\D/g, "").length !== 10;
    });
    if (incomplete) {
      setDelivery((current) => ({
        ...current,
        error: delivery.wholeBlock
          ? `Enter the receiver name and 10-digit phone number for ${delivery.blockLabel}.`
          : `Enter the receiver name and 10-digit phone number for room${incomplete.rooms === 1 ? "" : "s"} ${incomplete.label}.`,
      }));
      return;
    }
    const sharedReceiver = delivery.wholeBlock ? delivery.receivers.block : null;
    const proof = Object.fromEntries(delivery.units.map((unit) => {
      const receiver = sharedReceiver || delivery.receivers[unit.key];
      return [unit.key, {
        receivedBy: receiver.receivedBy.trim(),
        receiverPhone: receiver.receiverPhone.replace(/\D/g, ""),
      }];
    }));
    const units = delivery.units;
    setDelivery(null);
    await transitionUnits(units, "DELIVERED", proof);
  };

  const submitReport = async (event) => {
    event.preventDefault();
    const note = reporting.note.trim();
    if (!reporting.category || note.length < 10) return;
    setBusyKey(`report:${reporting.unit.key}`);
    try {
      // One unit's orders, never a mix: the office reads a grouped report as
      // one caretaker's delivery, and the server refuses anything wider.
      await api.post("/v1/fulfillment-orders/warehouse-reports", {
        orderIds: reporting.unit.orders.map((order) => order.id),
        category: reporting.category,
        note,
      });
      toast.success("Report sent to the office");
      setReporting(null);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not send this report");
    } finally {
      setBusyKey("");
    }
  };

  const advanceUnit = (unit) => {
    if (view === "PENDING") return transitionUnits([unit], "PACKED");
    if (view === "PACKED") return transitionUnits([unit], "OUT_FOR_DELIVERY");
    return openDelivery([unit]);
  };

  return (
    <div className="wh-page wh-active-orders">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Active orders</h1>
          <p className="wh-subtitle">Pack and deliver by block and room</p>
        </div>
      </div>

      <div className="wh-view-tabs wh-order-tabs" role="tablist" aria-label="Active order stages">
        {VIEWS.map(([status, label]) => (
          <button key={status} type="button" role="tab" aria-selected={view === status}
            className={view === status ? "active" : ""}
            onClick={() => { setView(status); setSelectedBlock(null); }}>
            <span>{label}</span><small className="wh-num">{counts[status] || 0}</small>
          </button>
        ))}
      </div>

      {loadError && <Banner variant="alert" icon="⚠️">Could not load active orders.</Banner>}
      {loading ? (
        <Skeleton height={320} radius={14} />
      ) : blocks.length === 0 && !loadError ? (
        <EmptyState icon="✓" title={`No ${VIEWS.find(([status]) => status === view)?.[1].toLowerCase()}`} variant="success">
          Orders will appear here automatically when they reach this stage.
        </EmptyState>
      ) : view === "PENDING" && !activeBlock ? (
        <div className="wh-block-grid" aria-label="Blocks with new orders">
          {blocks.map((block) => (
            <button key={block.key} type="button" className="wh-block-select" onClick={() => setSelectedBlock(block.key)}>
              <span className="wh-block-mark">{block.key.slice(0, 2)}</span>
              <span className="wh-block-select-main">
                <strong>{block.label}</strong>
                <small>{block.unitCount} unit{block.unitCount === 1 ? "" : "s"} waiting</small>
              </span>
              <span className="wh-block-total"><strong className="wh-num">{block.itemCount}</strong><small>items to pack</small></span>
              <Icon name="chevronRight" size={20} />
            </button>
          ))}
        </div>
      ) : view === "PENDING" ? (
        <section>
          <button type="button" className="wh-back-block" onClick={() => setSelectedBlock(null)}>
            <Icon name="arrowLeft" size={18} /> All blocks
          </button>
          <div className="wh-block-heading">
            <div><span>Selected block</span><h2>{activeBlock.label}</h2></div>
            <strong>{itemLabel(activeBlock.itemCount)} to pack</strong>
          </div>
          <div className="wh-unit-grid">
            {activeBlock.units.map((unit) => (
              <UnitTile key={unit.key} unit={unit} status={view}
                busy={busyUnits.includes(unit.key)} onAdvance={advanceUnit}
                onReport={(selected) => setReporting({ unit: selected, category: "", note: "" })} />
            ))}
          </div>
        </section>
      ) : (
        <div className="wh-block-stacks">
          {blocks.map((block) => (
            <section key={block.key} className="wh-block-stack">
              <header className="wh-block-stack-head">
                <div><span>{block.unitCount} unit{block.unitCount === 1 ? "" : "s"}</span><h2>{block.label}</h2><small>{itemLabel(block.itemCount)}</small></div>
                <button type="button" className="wh-block-action" disabled={Boolean(busyKey)}
                  onClick={() => view === "PACKED"
                    ? transitionUnits(block.units, "OUT_FOR_DELIVERY")
                    : openDelivery(block.units, { wholeBlock: true, blockLabel: block.label })}>
                  {view === "PACKED" ? "Send whole block" : "Hand over whole block"}
                </button>
              </header>
              <div className="wh-unit-scroll">
                {block.units.map((unit) => (
                  <UnitTile key={unit.key} unit={unit} status={view}
                    busy={busyUnits.includes(unit.key)} onAdvance={advanceUnit} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {reporting && (
        <div className="wh-dialog-backdrop">
          <form className="wh-work-dialog" role="dialog" aria-modal="true" onSubmit={submitReport}>
            <span className="wh-dialog-kicker">
              {reporting.unit.roomNumbers.length === 1 ? "Room" : "Rooms"} {reporting.unit.label}
            </span><h2>Report a packing issue</h2>
            <div className="wh-report-choices">
              {REPORT_CATEGORIES.map(([value, label]) => (
                <button key={value} type="button" className={reporting.category === value ? "active" : ""}
                  onClick={() => setReporting((current) => ({ ...current, category: value }))}>{label}</button>
              ))}
            </div>
            <label className="wh-field-label" htmlFor="warehouse-report-note">What happened?</label>
            <textarea id="warehouse-report-note" className="wh-input" rows="4" value={reporting.note}
              placeholder="Give the office enough detail to act on this."
              onChange={(event) => setReporting((current) => ({ ...current, note: event.target.value.slice(0, 1000) }))} />
            <div className="wh-dialog-actions">
              <button type="button" className="wh-cancel" onClick={() => setReporting(null)}>Cancel</button>
              <button type="submit" className="wh-cta" disabled={!reporting.category || reporting.note.trim().length < 10 || Boolean(busyKey)}>Send report</button>
            </div>
          </form>
        </div>
      )}

      {delivery && (
        <div className="wh-dialog-backdrop">
          <form className="wh-work-dialog wh-delivery-dialog" role="dialog" aria-modal="true" onSubmit={submitDelivery}>
            <span className="wh-dialog-kicker">Delivery handoff</span>
            <h2>{delivery.wholeBlock
              ? `Receiver for ${delivery.blockLabel}`
              : `Receiver at ${delivery.units[0].roomNumbers.length === 1 ? "room" : "rooms"} ${delivery.units[0].label}`}</h2>
            <p className="wh-remaining">
              {delivery.wholeBlock
                ? `This receiver will be recorded for all ${delivery.units.length} unit${delivery.units.length === 1 ? "" : "s"} in the block.`
                : delivery.units[0].roomNumbers.length === 1
                  ? "Record who accepted the items at this room."
                  : "Record who accepted the items for these rooms."}
            </p>
            {delivery.error && <div className="wh-handoff-error">{delivery.error}</div>}
            <div className="wh-receiver-list">
              {receiverRows(delivery).map((row) => {
                const receiver = delivery.receivers[row.key];
                return (
                  <fieldset key={row.key}>
                    <legend>{row.label} · {itemLabel(row.itemCount)}</legend>
                    <input className="wh-input" value={receiver.receivedBy} placeholder="Receiver name"
                      aria-label={`Receiver name for ${row.label}`}
                      onChange={(event) => setDelivery((current) => ({ ...current, error: "", receivers: {
                        ...current.receivers, [row.key]: { ...receiver, receivedBy: event.target.value },
                      } }))} />
                    <div className="wh-handoff-phone"><span>+91</span>
                      <input value={receiver.receiverPhone} inputMode="numeric" placeholder="98765 43210"
                        aria-label={`Receiver phone for ${row.label}`}
                        onChange={(event) => setDelivery((current) => ({ ...current, error: "", receivers: {
                          ...current.receivers, [row.key]: { ...receiver, receiverPhone: event.target.value.replace(/\D/g, "").slice(0, 10) },
                        } }))} />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="wh-dialog-actions">
              <button type="button" className="wh-cancel" onClick={() => setDelivery(null)}>Cancel</button>
              <button type="submit" className="wh-cta">Confirm handover</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Orders;
