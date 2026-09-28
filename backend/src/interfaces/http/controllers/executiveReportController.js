import Transaction from '../../../../models/Transaction.js';
import GoodsReceipt from '../../../../models/GoodsReceipt.js';
import { buildExecutiveSalesReport } from '../../../domain/analytics/executiveSalesReport.js';
import { parseBusinessDateRange } from '../../../shared/http/businessDateRange.js';

const MAX_RANGE_DAYS = 366;

export const executiveSalesReport = async (req, res) => {
  const { from, to, timeZone } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });
  const duration = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - duration);
  const transactionFields = 'studentId items totalAmount sourceType createdAt deletion';

  const [currentTransactions, previousTransactions, receipts] = await Promise.all([
    Transaction.find({
      createdAt: { $gte: from, $lt: to },
      $or: [{ deletion: null }, { deletion: { $exists: false } }],
    }).select(transactionFields).lean(),
    Transaction.find({
      createdAt: { $gte: previousFrom, $lt: from },
      $or: [{ deletion: null }, { deletion: { $exists: false } }],
    }).select(transactionFields).lean(),
    GoodsReceipt.find({ createdAt: { $lt: to } })
      .select('purchaseId lines createdAt invoiceNumber')
      .populate('purchaseId', 'items')
      .lean(),
  ]);

  res.json({
    data: buildExecutiveSalesReport({
      currentTransactions,
      previousTransactions,
      receipts,
      from,
      to,
      previousFrom,
      timeZone,
    }),
    meta: { generatedAt: new Date().toISOString(), requestId: req.context.requestId },
  });
};
