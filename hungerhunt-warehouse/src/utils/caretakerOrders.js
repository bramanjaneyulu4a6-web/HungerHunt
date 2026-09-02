export const caretakerItemCount = (orders = []) =>
  orders.reduce(
    (total, order) => total + (order.items || []).reduce(
      (orderTotal, item) => orderTotal + (Number(item.quantity) || 0),
      0
    ),
    0
  );

export const filterCaretakerOrders = (orders = [], query = '') => {
  const term = String(query).trim().toLocaleLowerCase('en-IN');
  if (!term) return orders;

  return orders.filter((order) => {
    const name = String(order.student?.name || '').toLocaleLowerCase('en-IN');
    const admissionNumber = String(order.student?.admissionNumber || '').toLocaleLowerCase('en-IN');
    return name.includes(term) || admissionNumber.includes(term);
  });
};
