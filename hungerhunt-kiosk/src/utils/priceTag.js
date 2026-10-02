const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/* A sale label is earned by the prices, not merely by a non-zero percentage.
 * Small percentage discounts can round back up to the MRP; showing those as a
 * sale would promise a saving the student does not receive. */
export const priceTag = ({ price, mrp, discountRate } = {}) => {
  const sellingPrice = finitePositive(price) ?? 0;
  const listPrice = finitePositive(mrp) ?? sellingPrice;
  const discounted = listPrice > sellingPrice;

  if (!discounted) {
    return { discounted: false, sellingPrice, mrp: listPrice, percentOff: null };
  }

  const storedRate = finitePositive(discountRate);
  const calculatedRate = ((listPrice - sellingPrice) / listPrice) * 100;
  const percentOff = Math.round((storedRate ?? calculatedRate) * 10) / 10;

  return { discounted: true, sellingPrice, mrp: listPrice, percentOff };
};

export const formatPercentOff = (percentOff) =>
  `${Number.isInteger(percentOff) ? percentOff : percentOff.toFixed(1)}% OFF`;

export default priceTag;
