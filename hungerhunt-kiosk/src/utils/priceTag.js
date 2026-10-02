const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/* A sale label is earned by the prices, not merely by a non-zero percentage.
 * Small discounts can round back up to the old price; showing those as a sale
 * would promise a saving the student does not receive. */
export const priceTag = ({ price, oldPrice } = {}) => {
  const sellingPrice = finitePositive(price) ?? 0;
  const listPrice = finitePositive(oldPrice) ?? sellingPrice;
  const discounted = listPrice > sellingPrice;

  if (!discounted) {
    return { discounted: false, sellingPrice, oldPrice: listPrice };
  }

  return { discounted: true, sellingPrice, oldPrice: listPrice };
};

export default priceTag;
