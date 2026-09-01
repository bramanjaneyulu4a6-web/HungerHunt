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

const unitLabel = (count) => `${count} item${count === 1 ? "" : "s"}`;

const ItemList = ({ items }) => (
  <div className="wh-hostel-items">
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
        <strong className="wh-num">×{item.quantity}</strong>
      </div>
    ))}
  </div>
);

const HostelTile = ({ hostel, status, busy, onAdvance, onReport }) => (
  <article className="wh-hostel-tile">
    <div className="wh-hostel-tile-head">
      <div>
        <span className="wh-hostel-kicker">Hostel</span>
        <h3>{hostel.hostelNumber}</h3>
      </div>
      <span className="wh-hostel-count">
        <strong className="wh-num">{hostel.itemCount}</strong>
        <small>items</small>
      </span>
    </div>

    <p className="wh-remaining">
      {hostel.items.length} product type{hostel.items.length === 1 ? "" : "s"} to handle
      {hostel.overdue && <span className="wh-overdue-copy"> · overdue</span>}
    </p>
    <ItemList items={hostel.items} />

    <div className="wh-hostel-actions">
      <button type="button" className="wh-cta" disabled={busy} onClick={() => onAdvance(hostel)}>
        {busy
          ? "Updating…"
          : status === "PENDING"
            ? "Mark as packed"
            : status === "PACKED"
              ? "Deliver"
              : "Mark as delivered"}
      </button>
      {status === "PENDING" && (
        <button type="button" className="wh-report-tile" disabled={busy} onClick={() => onReport(hostel)}>
          Report
        </button>
      )}
    </div>
  </article>
);

const Orders = () => {
  const [view, setView] = useState("PENDING");
  const [orders, setOrders] = useState([]);
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
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([status]) => {
    const statusBlocks = groupOrdersByBlock(orders.filter((order) => order.status === status));
    return [status, statusBlocks.reduce((sum, block) => sum + block.hostelCount, 0)];
  })), [orders]);
  const blocks = useMemo(
    () => groupOrdersByBlock(orders.filter((order) => order.status === view)),
    [orders, view]
  );
  const activeBlock = blocks.find((block) => block.key === selectedBlock) || null;

  const transitionHostels = async (hostels, status, proofByHostel = {}) => {
    const key = `${status}:${hostels.map((hostel) => hostel.key).join(",")}`;
    setBusyKey(key);
    const work = hostels.flatMap((hostel) =>
      hostel.orders.map((order) => api.post(`/v1/fulfillment-orders/${order.id}/transition`, {
        status,
        ...(proofByHostel[hostel.key] || {}),
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
          : "Delivery recorded");
    }
    setBusyKey("");
    await load();
  };

  const openDelivery = (hostels, { wholeBlock = false, blockLabel = "" } = {}) => setDelivery({
    hostels,
    wholeBlock,
    blockLabel,
    receivers: wholeBlock
      ? { block: { receivedBy: "", receiverPhone: "" } }
      : { [hostels[0].key]: { receivedBy: "", receiverPhone: "" } },
    error: "",
  });

  const submitDelivery = async (event) => {
    event.preventDefault();
    const receiverKeys = delivery.wholeBlock
      ? ["block"]
      : delivery.hostels.map((hostel) => hostel.key);
    const incompleteKey = receiverKeys.find((key) => {
      const receiver = delivery.receivers[key];
      return receiver.receivedBy.trim().length < 2 ||
        receiver.receiverPhone.replace(/\D/g, "").length !== 10;
    });
    if (incompleteKey) {
      setDelivery((current) => ({
        ...current,
        error: delivery.wholeBlock
          ? `Enter the receiver name and 10-digit phone number for ${delivery.blockLabel}.`
          : `Enter the receiver name and 10-digit phone number for hostel ${incompleteKey}.`,
      }));
      return;
    }
    const sharedReceiver = delivery.wholeBlock ? delivery.receivers.block : null;
    const proof = Object.fromEntries(delivery.hostels.map((hostel) => {
      const receiver = sharedReceiver || delivery.receivers[hostel.key];
      return [hostel.key, {
        receivedBy: receiver.receivedBy.trim(),
        receiverPhone: receiver.receiverPhone.replace(/\D/g, ""),
      }];
    }));
    const hostels = delivery.hostels;
    setDelivery(null);
    await transitionHostels(hostels, "DELIVERED", proof);
  };

  const submitReport = async (event) => {
    event.preventDefault();
    const note = reporting.note.trim();
    if (!reporting.category || note.length < 10) return;
    setBusyKey(`report:${reporting.hostel.key}`);
    try {
      await api.post("/v1/fulfillment-orders/warehouse-reports", {
        orderIds: reporting.hostel.orders.map((order) => order.id),
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

  const advanceHostel = (hostel) => {
    if (view === "PENDING") return transitionHostels([hostel], "PACKED");
    if (view === "PACKED") return transitionHostels([hostel], "OUT_FOR_DELIVERY");
    return openDelivery([hostel]);
  };

  return (
    <div className="wh-page wh-active-orders">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Active orders</h1>
          <p className="wh-subtitle">Pack and deliver by block and hostel</p>
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
                <small>{block.hostelCount} hostel{block.hostelCount === 1 ? "" : "s"} waiting</small>
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
            <strong>{unitLabel(activeBlock.itemCount)} to pack</strong>
          </div>
          <div className="wh-hostel-grid">
            {activeBlock.hostels.map((hostel) => (
              <HostelTile key={hostel.key} hostel={hostel} status={view}
                busy={busyKey.includes(hostel.key)} onAdvance={advanceHostel}
                onReport={(selected) => setReporting({ hostel: selected, category: "", note: "" })} />
            ))}
          </div>
        </section>
      ) : (
        <div className="wh-block-stacks">
          {blocks.map((block) => (
            <section key={block.key} className="wh-block-stack">
              <header className="wh-block-stack-head">
                <div><span>{block.hostelCount} hostel{block.hostelCount === 1 ? "" : "s"}</span><h2>{block.label}</h2><small>{unitLabel(block.itemCount)}</small></div>
                <button type="button" className="wh-block-action" disabled={Boolean(busyKey)}
                  onClick={() => view === "PACKED"
                    ? transitionHostels(block.hostels, "OUT_FOR_DELIVERY")
                    : openDelivery(block.hostels, { wholeBlock: true, blockLabel: block.label })}>
                  {view === "PACKED" ? "Send whole block" : "Deliver whole block"}
                </button>
              </header>
              <div className="wh-hostel-scroll">
                {block.hostels.map((hostel) => (
                  <HostelTile key={hostel.key} hostel={hostel} status={view}
                    busy={busyKey.includes(hostel.key)} onAdvance={advanceHostel} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {reporting && (
        <div className="wh-dialog-backdrop">
          <form className="wh-work-dialog" role="dialog" aria-modal="true" onSubmit={submitReport}>
            <span className="wh-dialog-kicker">{reporting.hostel.hostelNumber}</span><h2>Report a packing issue</h2>
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
              : `Receiver at ${delivery.hostels[0].hostelNumber}`}</h2>
            <p className="wh-remaining">
              {delivery.wholeBlock
                ? `This receiver will be recorded for all ${delivery.hostels.length} hostels in the block.`
                : "Record who accepted the items at this hostel."}
            </p>
            {delivery.error && <div className="wh-handoff-error">{delivery.error}</div>}
            <div className="wh-receiver-list">
              {(delivery.wholeBlock
                ? [{ key: "block", hostelNumber: delivery.blockLabel, itemCount: delivery.hostels.reduce((sum, hostel) => sum + hostel.itemCount, 0) }]
                : delivery.hostels
              ).map((hostel) => {
                const receiver = delivery.receivers[hostel.key];
                return (
                  <fieldset key={hostel.key}>
                    <legend>{hostel.hostelNumber} · {unitLabel(hostel.itemCount)}</legend>
                    <input className="wh-input" value={receiver.receivedBy} placeholder="Receiver name"
                      aria-label={`Receiver name for ${hostel.hostelNumber}`}
                      onChange={(event) => setDelivery((current) => ({ ...current, error: "", receivers: {
                        ...current.receivers, [hostel.key]: { ...receiver, receivedBy: event.target.value },
                      } }))} />
                    <div className="wh-handoff-phone"><span>+91</span>
                      <input value={receiver.receiverPhone} inputMode="numeric" placeholder="98765 43210"
                        aria-label={`Receiver phone for ${hostel.hostelNumber}`}
                        onChange={(event) => setDelivery((current) => ({ ...current, error: "", receivers: {
                          ...current.receivers, [hostel.key]: { ...receiver, receiverPhone: event.target.value.replace(/\D/g, "").slice(0, 10) },
                        } }))} />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="wh-dialog-actions">
              <button type="button" className="wh-cancel" onClick={() => setDelivery(null)}>Cancel</button>
              <button type="submit" className="wh-cta">Confirm delivery</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Orders;
