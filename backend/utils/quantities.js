/* What counts as a count, and what counts as money, in one place.

   The order side and the receiving side have to agree on this or the invariant
   between them breaks: an order raised in units the receipts cannot express is
   an order that can never be closed. Each controller used to carry its own
   predicate and they had already drifted — the order side accepted any finite
   number, the receiving side only whole ones, so a half-kilo line could be
   ordered and then never received.

   Numbers and numeric strings only. Left to plain coercion, null and a blank
   field both read as 0, an empty array reads as 0 and a stray `true` reads as
   1, so a garbled payload would be quietly reinterpreted as a figure rather
   than refused. */

const numericish = (v) =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "");

// Money: fractional is the point of it. Zero is allowed — "not priced".
export const isNonNegativeNumber = (v) =>
  numericish(v) && Number.isFinite(Number(v)) && Number(v) >= 0;

// Things on a shelf: you cannot receive half a tin, so you cannot order one.
// Zero is allowed — it records a line that was asked for and never arrived.
export const isWholeNonNegative = (v) =>
  isNonNegativeNumber(v) && Number.isInteger(Number(v));
