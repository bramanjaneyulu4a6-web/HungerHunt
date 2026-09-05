import { Link } from 'react-router-dom';

import { Card } from './ui';
import { formatINR } from '../utils/format';

/* The warehouse handing the package to the room (DELIVERED) is not
   delivery: only the student ending the package with their own code
   (COLLECTED) is. So DELIVERED holds the out-for-delivery step, and the
   final step lights up at collection. */
const ORDER_STEPS = [
  ['PENDING', 'Order confirmed'],
  ['PACKED', 'Packed'],
  ['OUT_FOR_DELIVERY', 'Out for delivery'],
  ['COLLECTED', 'Delivered'],
];

const ORDER_STATUS_LABELS = {
  PENDING: 'Order confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Out for delivery',
  COLLECTED: 'Delivered',
  CANCELLED: 'Cancelled and refunded',
};

const progressIndex = (status) => {
  if (status === 'DELIVERED') {
    return ORDER_STEPS.findIndex(([value]) => value === 'OUT_FOR_DELIVERY');
  }
  return ORDER_STEPS.findIndex(([value]) => value === status);
};

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const statusClass = (status) => {
  // A handed-over package still reads — and is coloured — as out for delivery.
  if (status === 'DELIVERED') return 'out-for-delivery';
  return String(status || 'PENDING').toLowerCase().replaceAll('_', '-');
};

/* `showAllOrdersLink` is for the caller that is already the destination. The
   link goes to the child's orders tab, so on the dashboard it is a way through
   to the full list, and on that tab itself it is a link to the page you are
   standing on. Deliberately its own prop rather than reusing showStudent,
   which happens to split the same two callers today but answers a different
   question — whose order this is, not where the link would take you. */
export default function OrderCard({
  order,
  index = 0,
  showStudent = false,
  showAllOrdersLink = true,
}) {
  const status = ORDER_STATUS_LABELS[order.status] || order.status;
  const activeStep = progressIndex(order.status);
  const destination = order.studentId
    ? `/child/${order.studentId}?tab=orders`
    : null;

  return (
    <Card
      className={`order-card order-card--${statusClass(order.status)}`}
      style={{ '--i': index }}
    >
      <div className="order-card__head">
        <div>
          <span className="order-card__status">
            <span className="order-card__status-dot" aria-hidden="true" />
            {status}
          </span>
          {showStudent && order.studentName && (
            <p className="order-card__student">For {order.studentName}</p>
          )}
        </div>
        <div className="order-card__identity">
          <span>#{String(order.id).slice(-6).toUpperCase()}</span>
          <time dateTime={order.orderedAt}>{formatDate(order.orderedAt)}</time>
        </div>
      </div>

      {activeStep >= 0 && (
        <ol className="order-card__progress" aria-label="Order status">
          {ORDER_STEPS.map(([value, label], stepIndex) => {
            const reached = stepIndex <= activeStep;
            const current = stepIndex === activeStep;
            return (
              <li key={value} className={reached ? 'reached' : ''} aria-current={current ? 'step' : undefined}>
                <span aria-hidden="true">{stepIndex < activeStep ? '✓' : stepIndex + 1}</span>
                <small>{label}</small>
              </li>
            );
          })}
        </ol>
      )}

      <ul className="order-card__items">
        {(order.items || []).map((item, itemIndex) => (
          <li key={`${item.name}-${itemIndex}`}>
            <span>{item.name} × {item.quantity}</span>
            <span>{formatINR(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="order-card__meta">
        <div>
          <span>
            {order.collectedAt
              ? 'Delivered'
              : order.overdue ? 'Overdue since' : 'Expected by'}
          </span>
          <strong className={order.overdue ? 'order-card__overdue' : ''}>
            {formatDateTime(order.collectedAt || order.deliverBy)}
          </strong>
        </div>
        <div>
          <span>Dorm room</span>
          <strong>{order.roomNumber || '—'}</strong>
        </div>
      </div>

      <div className="order-card__footer">
        <span>Total</span>
        <strong>{formatINR(order.totalAmount)}</strong>
        {showAllOrdersLink && destination && <Link to={destination}>View all orders</Link>}
      </div>
    </Card>
  );
}
