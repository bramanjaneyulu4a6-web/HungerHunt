const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const caretakerProductTotals = (orders = []) => {
  const products = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      const id = String(item.productId || item.name || 'Unknown product');
      const current = products.get(id);
      products.set(id, {
        id,
        name: item.name || current?.name || 'Unknown product',
        quantity: (current?.quantity || 0) + (Number(item.quantity) || 0),
      });
    }
  }

  return [...products.values()].sort((a, b) => natural.compare(a.name, b.name));
};

export const filterCaretakerOrders = (orders = [], query = '') => {
  const term = String(query).trim().toLocaleLowerCase('en-IN');
  if (!term) return orders;

  return orders.filter((order) => {
    const name = String(order.student?.name || '').toLocaleLowerCase('en-IN');
    const admissionNumber = String(order.student?.admissionNumber || '').toLocaleLowerCase('en-IN');
    return name.includes(term) || admissionNumber.includes(term);
  });
};
