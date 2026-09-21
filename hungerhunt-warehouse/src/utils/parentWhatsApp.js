// Extension on the import so this module runs under `node --test` as well as Vite.
import { formatINR } from './format.js';

/* The WhatsApp a caretaker sends a parent about an order still waiting for an
 * answer — word for word the kiosk's two messages
 * (hungerhunt-kiosk/src/utils/parentWhatsApp.js): the accept-or-decline one
 * while the parent answers, and the caretaker-review one once the parent has
 * let the caretaker accept orders. Kept as a copy because the two apps share
 * no code; keep them in step.
 *
 * Pure: an order in, a message and a wa.me link out. Opening WhatsApp is
 * openWhatsApp.js's job, so this file stays testable under node. */

// Where the parent views the order. Baked in at build time; the default is the
// live parent web app, so an unset variable still sends a link that works.
export const PARENT_APP_URL =
  String(import.meta.env?.VITE_PARENT_APP_URL || '').trim() ||
  'https://hunger-hunt-parent.vercel.app';

// Parent phones are stored as the ten-digit Indian mobile number. A leading
// 0 or the country code already on it are both accepted; anything else is not
// a number WhatsApp can address, and no link is made rather than a wrong one.
export const whatsAppNumber = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return '';
};

const answerBy = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
};

const itemLine = (item, index) => {
  const quantity = Number(item.quantity) || 1;
  const price = Number(item.price) || 0;
  const amount = formatINR(price * quantity);
  const cost = quantity > 1 ? `${quantity} × ${formatINR(price)} = ${amount}` : amount;
  return `${index + 1}. ${item.name} — ${cost}`;
};

const appLink = `Open the Hunger Hunt parent app:\n${PARENT_APP_URL}`;

// The parent answers this one: accept or decline it in their app.
export const composeParentApprovalMessage = ({ studentName, order }) => {
  const items = order?.items || [];
  const deadline = answerBy(order?.expiresAt);
  const child = String(studentName ?? '').trim();

  return [
    '*Hunger Hunt — order waiting for your approval*',
    `Hello! Your child${child ? ` *${child}*` : ''} has just placed an order at the school store.`,
    ['*Order*', ...items.map(itemLine)].join('\n'),
    `*Total: ${formatINR(order?.totalAmount)}*`,
    'Nothing has been charged yet. Please open the Hunger Hunt app to review this order and *accept* or *decline* it' +
      (deadline ? ` before ${deadline}.` : '.'),
    appLink,
  ].join('\n\n');
};

// The caretaker answers this one; the parent can view it.
export const composeCaretakerReviewMessage = ({ studentName, order }) => {
  const items = order?.items || [];
  const deadline = answerBy(order?.expiresAt);
  const child = String(studentName ?? '').trim();

  return [
    '*Hunger Hunt — order sent to the room caretaker*',
    `Hello! Your child${child ? ` *${child}*` : ''} has just placed an order at the school store.`,
    ['*Order*', ...items.map(itemLine)].join('\n'),
    `*Total: ${formatINR(order?.totalAmount)}*`,
    'Nothing has been charged yet. The room caretaker will review this order' +
      (deadline ? ` before ${deadline}` : '') +
      '. You can view it in the Hunger Hunt app. Contact the caretaker for any changes, ' +
      'or turn off *Let the caretaker accept orders* in the app to review and edit it yourself.',
    appLink,
  ].join('\n\n');
};

// The parent's number arrives on the order (GET /pending-orders/caretaker
// populates parentId with the phone alone), and so does who answers it
// (caretakerMayAnswer), which picks the message. '' when there is no usable
// number.
export const notifyParentWhatsAppLink = (order) => {
  const number = whatsAppNumber(order?.parentId?.phone);
  if (!number || !order?.items?.length) return '';
  const compose = order.caretakerMayAnswer ? composeCaretakerReviewMessage : composeParentApprovalMessage;
  const text = compose({ studentName: order.studentId?.name, order });
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};
