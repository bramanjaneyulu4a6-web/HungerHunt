import { Capacitor } from "@capacitor/core";

import { formatINR } from "./format";

/* The approval request, typed out in WhatsApp to the parent who has to answer
   it. Nothing is sent by the kiosk itself: WhatsApp opens on the parent's chat
   with the message already written, and it goes when the send arrow is tapped.
   The same wa.me link the Tablet Reminder app uses for its invites. */

// Parent phones are stored as the ten-digit Indian mobile number. A leading
// 0 or the country code already on it are both accepted; anything else is not
// a number WhatsApp can address, and no link is made rather than a wrong one.
export const whatsAppNumber = (phone) => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return "";
};

const answerBy = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

// One line per product, priced from the server's copy of the order — the
// numbers the parent will see in the app, not what the till displayed.
const itemLine = (item, index) => {
  const quantity = Number(item.quantity) || 1;
  const price = Number(item.price) || 0;
  const amount = formatINR(price * quantity);
  const cost = quantity > 1 ? `${quantity} × ${formatINR(price)} = ${amount}` : amount;
  return `${index + 1}. ${item.name} — ${cost}`;
};

/* When the parent has let the room caretaker accept orders, the caretaker
   answers this one and the parent can only view it — so the message says who
   is deciding rather than asking the parent to. */
export const composeApprovalMessage = ({ studentName, order, caretakerReviews = false }) => {
  const items = order?.items || [];
  const deadline = answerBy(order?.expiresAt);
  const child = String(studentName ?? "").trim();

  if (caretakerReviews) {
    return [
      "*Hunger Hunt — order sent to the room caretaker*",
      `Hello! Your child${child ? ` *${child}*` : ""} has just placed an order at the school store.`,
      ["🛒 *Order*", ...items.map(itemLine)].join("\n"),
      `*Total: ${formatINR(order?.totalAmount)}*`,
      "Nothing has been charged yet. The room caretaker will review this order" +
        (deadline ? ` before ${deadline}` : "") +
        ". You can view it in the Hunger Hunt app. Contact the caretaker for any changes, " +
        "or turn off *Let the caretaker accept orders* in the app to review and edit it yourself.",
    ].join("\n\n");
  }

  return [
    "*Hunger Hunt — order waiting for your approval*",
    `Hello! Your child${child ? ` *${child}*` : ""} has just placed an order at the school store.`,
    ["🛒 *Order*", ...items.map(itemLine)].join("\n"),
    `*Total: ${formatINR(order?.totalAmount)}*`,
    "Nothing has been charged yet. Please open the Hunger Hunt app to review this order and *accept* or *decline* it" +
      (deadline ? ` before ${deadline}.` : "."),
  ].join("\n\n");
};

export const approvalWhatsAppLink = ({ parentPhone, studentName, order, caretakerReviews = false }) => {
  const number = whatsAppNumber(parentPhone);
  if (!number || !order?.items?.length) return "";
  const text = composeApprovalMessage({ studentName, order, caretakerReviews });
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

/* In the Android APK a navigation off the app's own origin is handed to the
   system rather than loaded in the WebView, so assigning the link opens
   WhatsApp and leaves the till where it was. In a browser the same assignment
   would navigate the kiosk away, so it gets a new tab instead — which the
   browser may refuse this long after the tap; the result screen keeps a
   button for that case. Returns whether anything was opened. */
export const openWhatsApp = (link) => {
  if (!link) return false;
  if (Capacitor.isNativePlatform()) {
    window.location.assign(link);
    return true;
  }
  const opened = window.open(link, "_blank");
  if (opened) opened.opener = null;
  return Boolean(opened);
};
