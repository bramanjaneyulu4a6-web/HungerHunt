import { useEffect } from "react";

/* Delivered means the student has ended the package with their own code
   (COLLECTED). The warehouse handing it to the room (DELIVERED) is still
   out for delivery, so that status holds the third step. */
const ORDER_STEPS = [
  ["PENDING", "Order confirmed"],
  ["PACKED", "Packed"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
  ["COLLECTED", "Delivered"],
];

const ORDER_STATUS_LABELS = Object.fromEntries(ORDER_STEPS);
ORDER_STATUS_LABELS.DELIVERED = "Out for delivery";

const progressIndex = (status) => {
  if (status === "DELIVERED") {
    return ORDER_STEPS.findIndex(([value]) => value === "OUT_FOR_DELIVERY");
  }
  return ORDER_STEPS.findIndex(([value]) => value === status);
};

const formatDeliveryDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

/* One visual language for every way a kiosk session ends or is refused. The
   student sees the same calm, full-screen card after placing an order and
   when their account cannot start one, rather than a small form error that
   looks like it can be retried indefinitely. */
const KioskResultScreen = ({
  variant,
  mark,
  kicker,
  title,
  body,
  onDone,
  seconds = 5,
  tapLabel = "Tap anywhere for next student",
  orderStatus,
  estimatedDeliveryDate,
}) => {
  const statusLabel = ORDER_STATUS_LABELS[orderStatus] || orderStatus;
  const activeStep = progressIndex(orderStatus);
  const deliveryDate = formatDeliveryDate(estimatedDeliveryDate);
  useEffect(() => {
    const exit = window.setTimeout(onDone, seconds * 1000);
    return () => window.clearTimeout(exit);
  }, [onDone, seconds]);

  return (
    <div
      className={`kiosk-result kiosk-result--${variant}`}
      onClick={onDone}
      role="status"
    >
      <div className="kiosk-result-burst" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} style={{ "--particle": index }} />
        ))}
      </div>
      <div className="kiosk-result-card">
        <div
          className={`kiosk-result-mark kiosk-result-mark--${variant}`}
          aria-hidden="true"
        >
          {mark}
        </div>
        <p className="kiosk-result-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {(statusLabel || deliveryDate) && (
          <dl className="kiosk-result-order" aria-label="Current order details">
            {statusLabel && (
              <div className="kiosk-result-order__status">
                <dt>Status</dt>
                <dd><i aria-hidden="true" />{statusLabel}</dd>
              </div>
            )}
            {deliveryDate && (
              <div>
                <dt>Estimated delivery</dt>
                <dd><time dateTime={String(estimatedDeliveryDate).slice(0, 10)}>{deliveryDate}</time></dd>
              </div>
            )}
          </dl>
        )}
        {activeStep >= 0 && (
          <ol className="kiosk-result-progress" aria-label="Order status">
            {ORDER_STEPS.map(([value, label], stepIndex) => (
              <li
                key={value}
                className={stepIndex <= activeStep ? "reached" : ""}
                aria-current={stepIndex === activeStep ? "step" : undefined}
              >
                <span aria-hidden="true">{stepIndex < activeStep ? "✓" : stepIndex + 1}</span>
                <small>{label}</small>
              </li>
            ))}
          </ol>
        )}
        <span className="kiosk-result-skip">{tapLabel}</span>
      </div>
      <div
        className="kiosk-result-timer"
        style={{ animationDuration: `${seconds}s` }}
        aria-hidden="true"
      />
    </div>
  );
};

export default KioskResultScreen;
