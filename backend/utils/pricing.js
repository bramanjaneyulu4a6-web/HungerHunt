/* What a student actually pays, derived from what the office typed.

   The catalogue records an MRP and a discount rate; `price` on the product is
   the figure the till, the pending orders and every receipt use, and it is
   computed here and nowhere else. Two fields the office edits and one field
   the rest of the system reads — so a discount can never be recorded without
   the price moving with it.

   Rounding is always up, by the office's decision: the till has no paise and
   the school does not lose a fraction of a rupee per sale. The consequence is
   that a small discount on a small MRP can round back to the full price, and
   the admin form shows the resulting figure before saving so nobody is
   surprised by it. */

import { isNonNegativeNumber } from './quantities.js';

/* Below 100, not up to it: a rate of 100 prices the product at nothing, and
   the till reads nothing as free and hands the goods over. A giveaway is a
   decision to make elsewhere, not a discount to type here. */
export const isValidDiscountRate = (v) =>
  isNonNegativeNumber(v) && Number(v) < 100;

/* Written as mrp × (100 − rate) ÷ 100 rather than mrp × (1 − rate/100),
   because the second builds a fraction first and rounding up magnifies the
   error it carries: a price landing a hair above a whole rupee would be
   rounded to the next one, charging a rupee the arithmetic never asked for.

   Capped at the MRP so rounding up cannot raise the price of a product priced
   in paise — a ₹12.50 item at no discount stays ₹12.50 rather than becoming
   ₹13. */
export const finalPrice = (mrp, discountRate) => {
  const price = (Number(mrp) * (100 - Number(discountRate))) / 100;
  return Math.min(Number(mrp), Math.ceil(price));
};
