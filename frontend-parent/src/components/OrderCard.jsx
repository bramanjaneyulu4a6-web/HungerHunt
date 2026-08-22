import { Link } from 'react-router-dom';

import { Card } from './ui';
import { formatINR } from '../utils/format';

/* Two endings, not one. DELIVERED is the warehouse having handed the package
   to the hostel's caretaker; COLLECTED is the child having taken it from
   them, which only their own purchase code can record. A parent reading
   "Delivered" should understand the package is at the dorm and not yet in
   their child's hands, so it is not the word "Delivered" on its own. */
const ORDER_STATUS_LABELS = {
  PENDING: 'Order received',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'At the hostel',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled and refunded',
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

const statusClass = (status) =>
  String(status || 'PENDING').toLowerCase().replaceAll('_', '-');

export default function OrderCard({ order, index = 0, showStudent = false }) {
  const status = ORDER_STATUS_LABELS[order.status] || order.status;
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
              ? 'Collected'
              : order.deliveredAt
                ? 'At the hostel since'
                : order.overdue ? 'Overdue since' : 'Expected by'}
          </span>
          <strong className={order.overdue ? 'order-card__overdue' : ''}>
            {formatDateTime(order.collectedAt || order.deliveredAt || order.deliverBy)}
          </strong>
        </div>
        <div>
          <span>Dorm room</span>
          <strong>{order.hostelNumber || '—'}</strong>
        </div>
        {order.receivedBy && (
          <div>
            <span>Handed to</span>
            <strong>{order.receivedBy}</strong>
          </div>
        )}
      </div>

      <div className="order-card__footer">
        <span>Total</span>
        <strong>{formatINR(order.totalAmount)}</strong>
        {destination && <Link to={destination}>View all orders</Link>}
      </div>
    </Card>
  );
}
