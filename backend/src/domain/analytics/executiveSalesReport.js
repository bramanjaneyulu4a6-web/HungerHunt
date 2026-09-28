const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const percentChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const productKey = (value) => String(value?._id ?? value ?? '');

const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const channelLabel = (sourceType) => ({
  DIRECT_CHECKOUT: 'Point of sale',
  PARENT_APPROVAL: 'Parent-approved',
  UPI_ORDER_PAYMENT: 'UPI order',
}[sourceType] || 'Other');

const dayAt = (date, timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(date));

const costBookFrom = (receipts) => {
  const costs = new Map();

  receipts.forEach((receipt) => {
    const orderPrices = new Map(
      (receipt.purchaseId?.items || []).map((line) => [
        productKey(line.productId),
        optionalNumber(line.purchasePrice),
      ])
    );

    (receipt.lines || []).forEach((line) => {
      const key = productKey(line.productId);
      const units = (Number(line.received) || 0) + (Number(line.damaged) || 0);
      const invoicePrice = optionalNumber(line.purchasePrice);
      const orderPrice = orderPrices.get(key);
      const unitCost = invoicePrice !== null
        ? invoicePrice
        : orderPrice;

      if (!key || units <= 0 || unitCost === null) return;
      const existing = costs.get(key) || { units: 0, value: 0 };
      existing.units += units;
      existing.value += units * unitCost;
      costs.set(key, existing);
    });
  });

  return new Map([...costs].map(([key, value]) => [key, value.value / value.units]));
};

const salesSnapshot = ({ transactions, costBook, timeZone }) => {
  const products = new Map();
  const channels = new Map();
  const days = new Map();
  const customers = new Set();
  let revenue = 0;
  let unitsSold = 0;
  let estimatedCogs = 0;
  let costedRevenue = 0;

  transactions.forEach((transaction) => {
    const amount = Number(transaction.totalAmount) || 0;
    revenue += amount;
    if (transaction.studentId) customers.add(productKey(transaction.studentId));

    const day = dayAt(transaction.createdAt, timeZone);
    const dayRow = days.get(day) || { date: day, revenue: 0, orders: 0 };
    dayRow.revenue += amount;
    dayRow.orders += 1;
    days.set(day, dayRow);

    const channel = channelLabel(transaction.sourceType);
    const channelRow = channels.get(channel) || { name: channel, revenue: 0, orders: 0 };
    channelRow.revenue += amount;
    channelRow.orders += 1;
    channels.set(channel, channelRow);

    (transaction.items || []).forEach((item) => {
      const key = productKey(item.productId) || item.name || 'Unknown product';
      const quantity = Number(item.quantity) || 0;
      const itemRevenue = quantity * (Number(item.price) || 0);
      const averageCost = costBook.get(key);
      const row = products.get(key) || {
        productId: productKey(item.productId) || null,
        name: item.name || 'Unknown product',
        units: 0,
        revenue: 0,
        estimatedCost: 0,
        costKnown: true,
      };

      row.units += quantity;
      row.revenue += itemRevenue;
      unitsSold += quantity;
      if (Number.isFinite(averageCost)) {
        const lineCost = quantity * averageCost;
        row.estimatedCost += lineCost;
        estimatedCogs += lineCost;
        costedRevenue += itemRevenue;
      } else {
        row.costKnown = false;
      }
      products.set(key, row);
    });
  });

  return {
    revenue: money(revenue),
    orders: transactions.length,
    unitsSold,
    customers: customers.size,
    averageOrderValue: money(transactions.length ? revenue / transactions.length : 0),
    estimatedCogs: money(estimatedCogs),
    // Profit is only claimed for sales whose product has a recorded cost.
    // Treating an unknown cost as zero would make incomplete history look
    // extraordinarily profitable to the person this report is for.
    estimatedGrossProfit: money(costedRevenue - estimatedCogs),
    estimatedGrossMargin: costedRevenue
      ? Math.round(((costedRevenue - estimatedCogs) / costedRevenue) * 1000) / 10
      : 0,
    costCoverage: revenue ? Math.round((costedRevenue / revenue) * 1000) / 10 : 100,
    products: [...products.values()]
      .map((row) => ({
        ...row,
        revenue: money(row.revenue),
        estimatedCost: money(row.estimatedCost),
        estimatedProfit: row.costKnown ? money(row.revenue - row.estimatedCost) : null,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    channels: [...channels.values()]
      .map((row) => ({ ...row, revenue: money(row.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    days: [...days.values()]
      .map((row) => ({ ...row, revenue: money(row.revenue) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

const procurementSnapshot = ({ receipts, from, to }) => {
  let spend = 0;
  let damagedLoss = 0;
  let unitsReceived = 0;
  let damagedUnits = 0;
  let invoices = 0;

  receipts.forEach((receipt) => {
    const createdAt = new Date(receipt.createdAt);
    if (createdAt < from || createdAt >= to) return;
    invoices += 1;
    const orderPrices = new Map(
      (receipt.purchaseId?.items || []).map((line) => [productKey(line.productId), optionalNumber(line.purchasePrice)])
    );

    (receipt.lines || []).forEach((line) => {
      const invoicePrice = optionalNumber(line.purchasePrice);
      const orderPrice = orderPrices.get(productKey(line.productId));
      const unitCost = invoicePrice !== null
        ? invoicePrice
        : (orderPrice ?? 0);
      const received = Number(line.received) || 0;
      const damaged = Number(line.damaged) || 0;
      spend += (received + damaged) * unitCost;
      damagedLoss += damaged * unitCost;
      unitsReceived += received;
      damagedUnits += damaged;
    });
  });

  return {
    spend: money(spend),
    damagedLoss: money(damagedLoss),
    unitsReceived,
    damagedUnits,
    invoices,
  };
};

export const buildExecutiveSalesReport = ({
  currentTransactions,
  previousTransactions,
  receipts,
  from,
  to,
  previousFrom,
  timeZone,
}) => {
  const costBook = costBookFrom(receipts);
  const current = salesSnapshot({ transactions: currentTransactions, costBook, timeZone });
  const previous = salesSnapshot({ transactions: previousTransactions, costBook, timeZone });
  const procurement = procurementSnapshot({ receipts, from, to });

  return {
    range: { from: from.toISOString(), to: to.toISOString(), timeZone },
    comparisonRange: { from: previousFrom.toISOString(), to: from.toISOString() },
    summary: {
      revenue: current.revenue,
      orders: current.orders,
      unitsSold: current.unitsSold,
      customers: current.customers,
      averageOrderValue: current.averageOrderValue,
      estimatedCogs: current.estimatedCogs,
      estimatedGrossProfit: current.estimatedGrossProfit,
      estimatedGrossMargin: current.estimatedGrossMargin,
      costCoverage: current.costCoverage,
    },
    comparison: {
      revenue: previous.revenue,
      orders: previous.orders,
      averageOrderValue: previous.averageOrderValue,
      revenueChange: percentChange(current.revenue, previous.revenue),
      ordersChange: percentChange(current.orders, previous.orders),
      averageOrderValueChange: percentChange(current.averageOrderValue, previous.averageOrderValue),
    },
    procurement,
    trend: current.days,
    topProducts: current.products.slice(0, 8),
    channels: current.channels,
    notes: {
      cogs: 'Estimated from the weighted average unit cost recorded on goods receipts up to the report end date.',
      expenses: 'Procurement spend includes stock received in this period. Other operating expenses are not recorded in Hunger Hunt.',
      deletedSales: 'Deleted sales are excluded.',
    },
  };
};
