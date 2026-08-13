const DAY_MS = 86_400_000;

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const daysBetween = (start, end) =>
  (new Date(end).getTime() - new Date(start).getTime()) / DAY_MS;

const withinDays = (date, asOf, days) => {
  const age = asOf.getTime() - new Date(date).getTime();
  return age >= 0 && age < days * DAY_MS;
};

const approvalOutcome = (order) => {
  if (order.rejectedAt || order.status === 'REJECTED') return 'REJECTED';
  if (order.approvedAt || ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED'].includes(order.status)) {
    return 'APPROVED';
  }
  return null;
};

export const calculateProcurementEfficiency = (purchaseOrders) => {
  const reviewed = purchaseOrders.filter((order) => approvalOutcome(order));
  const approved = reviewed.filter((order) => approvalOutcome(order) === 'APPROVED');
  const rejected = reviewed.filter((order) => approvalOutcome(order) === 'REJECTED');

  const reviewHours = reviewed
    .filter((order) => order.createdAt && order.reviewedAt)
    .map((order) => daysBetween(order.createdAt, order.reviewedAt) * 24)
    .filter((value) => value >= 0);
  const supplierDays = approved
    .filter((order) => order.approvedAt && (order.completedAt || order.receivedAt))
    .map((order) => daysBetween(order.approvedAt, order.completedAt || order.receivedAt))
    .filter((value) => value >= 0);
  const totalDays = approved
    .filter((order) => order.createdAt && (order.completedAt || order.receivedAt))
    .map((order) => daysBetween(order.createdAt, order.completedAt || order.receivedAt))
    .filter((value) => value >= 0);

  const stages = [
    { stage: 'ACCOUNTS_REVIEW', averageDays: average(reviewHours)?.valueOf() / 24 },
    { stage: 'SUPPLIER_DELIVERY', averageDays: average(supplierDays) },
  ].filter((stage) => Number.isFinite(stage.averageDays));

  return {
    reviewedOrders: reviewed.length,
    approvedOrders: approved.length,
    rejectedOrders: rejected.length,
    approvalRatio: reviewed.length ? round(approved.length / reviewed.length) : null,
    rejectionRatio: reviewed.length ? round(rejected.length / reviewed.length) : null,
    averageReviewHours: reviewHours.length ? round(average(reviewHours)) : null,
    averageSupplierLeadTimeDays: supplierDays.length ? round(average(supplierDays)) : null,
    averageRestockCycleDays: totalDays.length ? round(average(totalDays)) : null,
    primaryBottleneck: stages.sort((a, b) => b.averageDays - a.averageDays)[0]?.stage ?? null,
  };
};

const configuredLeadTime = (orders, productId, fallback) => {
  const relevant = orders.filter((order) =>
    order.items.some((item) => String(item.productId) === productId)
  );
  const observed = relevant
    .filter((order) => order.approvedAt && (order.completedAt || order.receivedAt))
    .map((order) => daysBetween(order.approvedAt, order.completedAt || order.receivedAt))
    .filter((value) => value >= 0);
  if (observed.length) return Math.max(0, average(observed));

  const configured = relevant
    .map((order) => order.supplierLeadTimeDays)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return configured.length ? average(configured) : fallback;
};

const orderStats = (orders, productId, asOf, eoq) => {
  const quantities = orders
    .filter((order) =>
      withinDays(order.createdAt, asOf, 90) &&
      !['PENDING_REVIEW', 'REJECTED', 'CANCELLED'].includes(order.status)
    )
    .flatMap((order) => order.items)
    .filter((item) => String(item.productId) === productId && item.quantity > 0)
    .map((item) => item.quantity);

  const averageBatchSize = average(quantities);
  const smallThreshold = eoq ? eoq * 0.5 : null;
  const smallOrders = smallThreshold
    ? quantities.filter((quantity) => quantity < smallThreshold).length
    : 0;
  const smallOrderRatio = quantities.length ? smallOrders / quantities.length : 0;
  const flagged = Boolean(eoq && quantities.length >= 3 && smallOrderRatio >= 0.6);

  return {
    ordersIn90Days: quantities.length,
    averageBatchSize: averageBatchSize == null ? null : round(averageBatchSize),
    smallOrderRatio: quantities.length ? round(smallOrderRatio) : null,
    flagged,
    message: flagged
      ? `Average batch ${round(averageBatchSize)} is below 50% of EOQ ${eoq}; consolidate orders.`
      : null,
  };
};

export const analyzeInventory = ({
  products,
  usageEvents,
  purchaseOrders,
  asOf = new Date(),
  config = {},
}) => {
  const settings = {
    windows: config.windows ?? [30, 60, 90],
    highVelocityUnitsPerDay: config.highVelocityUnitsPerDay ?? 1,
    defaultLeadTimeDays: config.defaultLeadTimeDays ?? 7,
    orderingCost: config.orderingCost ?? 250,
    annualHoldingRate: config.annualHoldingRate ?? 0.2,
  };

  const items = products.map((product) => {
    const productId = String(product.id);
    const usage = usageEvents.filter((event) => String(event.productId) === productId);
    const windowMetrics = Object.fromEntries(settings.windows.map((days) => {
      const quantity = usage
        .filter((event) => withinDays(event.occurredAt, asOf, days))
        .reduce((sum, event) => sum + event.quantity, 0);
      return [days, { unitsUsed: quantity, averageDailyUsage: round(quantity / days, 4) }];
    }));

    const daily = new Map();
    for (const event of usage.filter((entry) => withinDays(entry.occurredAt, asOf, 90))) {
      const day = new Date(event.occurredAt).toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + event.quantity);
    }
    const averageDailyUsage = windowMetrics[90]?.averageDailyUsage ?? 0;
    const maxDailyUsage = Math.max(0, ...daily.values());
    const velocityClass = windowMetrics[90]?.unitsUsed === 0
      ? 'DEAD_STOCK'
      : windowMetrics[30]?.averageDailyUsage >= settings.highVelocityUnitsPerDay
        ? 'HIGH_VELOCITY'
        : 'NORMAL';

    const leadTimeDays = configuredLeadTime(purchaseOrders, productId, settings.defaultLeadTimeDays);
    const suggestedSafetyStock = Math.ceil(Math.max(0, maxDailyUsage - averageDailyUsage) * leadTimeDays);
    const suggestedReorderPoint = Math.ceil(averageDailyUsage * leadTimeDays + suggestedSafetyStock);
    const annualDemand = averageDailyUsage * 365;
    const prices = purchaseOrders.flatMap((order) => order.items)
      .filter((line) => String(line.productId) === productId && line.unitCost > 0)
      .map((line) => line.unitCost);
    const unitCost = average(prices);
    const annualHoldingCost = unitCost == null ? null : unitCost * settings.annualHoldingRate;
    const eoq = annualHoldingCost > 0 && annualDemand > 0
      ? Math.ceil(Math.sqrt((2 * annualDemand * settings.orderingCost) / annualHoldingCost))
      : null;
    const costOverrun = orderStats(purchaseOrders, productId, asOf, eoq);

    return {
      productId,
      productName: product.name,
      currentStock: product.currentStock,
      velocity: { classification: velocityClass, windows: windowMetrics },
      reorder: {
        supplierLeadTimeDays: round(leadTimeDays),
        maxDailyUsage,
        currentSafetyStock: product.safetyStock,
        suggestedSafetyStock,
        currentReorderPoint: product.reorderLevel,
        suggestedReorderPoint,
        recommendedOrderQuantityEoq: eoq,
        estimatedUnitCost: unitCost == null ? null : round(unitCost),
        reorderNow: product.currentStock <= suggestedReorderPoint,
        daysOfCover: averageDailyUsage > 0 ? round(product.currentStock / averageDailyUsage) : null,
      },
      costOverrun,
    };
  });

  return {
    schemaVersion: '1.0',
    generatedAt: asOf.toISOString(),
    methodology: {
      windowsDays: settings.windows,
      velocityRule: `HIGH_VELOCITY when 30-day usage is at least ${settings.highVelocityUnitsPerDay} unit/day; DEAD_STOCK when 90-day usage is zero.`,
      safetyStockFormula: '(max daily usage - 90-day average daily usage) × lead time',
      reorderPointFormula: '(90-day average daily usage × lead time) + safety stock',
      eoqFormula: 'sqrt((2 × annual demand × ordering cost) / annual holding cost)',
    },
    summary: {
      productCount: items.length,
      highVelocityCount: items.filter((item) => item.velocity.classification === 'HIGH_VELOCITY').length,
      deadStockCount: items.filter((item) => item.velocity.classification === 'DEAD_STOCK').length,
      reorderNowCount: items.filter((item) => item.reorder.reorderNow).length,
      costOverrunFlagCount: items.filter((item) => item.costOverrun.flagged).length,
    },
    procurement: calculateProcurementEfficiency(purchaseOrders),
    items,
  };
};
