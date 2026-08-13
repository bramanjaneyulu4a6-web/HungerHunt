import Transaction from '../../../../models/Transaction.js';
import WalletAdjustment from '../../../../models/WalletAdjustment.js';
import WalletReversal from '../../../../models/WalletReversal.js';
import { buildTallyVoucherXml } from '../../../application/accounting/tallyXml.js';
import { ApplicationError } from '../../../shared/errors/applicationError.js';
import { parseBusinessDateRange } from '../../../shared/http/businessDateRange.js';

const MAX_RANGE_DAYS = 93;
const MAX_VOUCHERS = 50_000;

const ledgers = () => ({
  walletLiability: process.env.TALLY_WALLET_LEDGER?.trim() || 'Student Wallet Liability',
  sales: process.env.TALLY_SALES_LEDGER?.trim() || 'HungerHunt Sales',
  fundingClearing: process.env.TALLY_FUNDING_LEDGER?.trim() || 'Wallet Funding Clearing',
  salesVoucherType: process.env.TALLY_SALES_VOUCHER_TYPE?.trim() || 'Sales',
  receiptVoucherType: process.env.TALLY_RECEIPT_VOUCHER_TYPE?.trim() || 'Receipt',
  refundVoucherType: process.env.TALLY_REFUND_VOUCHER_TYPE?.trim() || 'Credit Note',
});

export const tallyXml = async (req, res) => {
  const { from, to } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });
  const range = { createdAt: { $gte: from, $lt: to } };
  const [transactions, adjustments, reversals] = await Promise.all([
    Transaction.find(range).select('_id studentId totalAmount createdAt').sort({ createdAt: 1 }).limit(MAX_VOUCHERS + 1).lean(),
    WalletAdjustment.find(range).select('_id studentId amount createdAt').sort({ createdAt: 1 }).limit(MAX_VOUCHERS + 1).lean(),
    WalletReversal.find(range).select('_id studentId amount createdAt').sort({ createdAt: 1 }).limit(MAX_VOUCHERS + 1).lean(),
  ]);
  if (transactions.length + adjustments.length + reversals.length > MAX_VOUCHERS) {
    throw new ApplicationError('Export contains more than 50,000 vouchers. Select a shorter period.', {
      status: 413,
      code: 'EXPORT_TOO_LARGE',
    });
  }
  const xml = buildTallyVoucherXml({
    transactions, adjustments, reversals, ledgers: ledgers(),
    timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata',
  });
  const filename = `hungerhunt-tally-${req.query.from.slice(0, 10)}-to-${req.query.to.slice(0, 10)}.xml`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-HungerHunt-Voucher-Count', String(transactions.length + adjustments.length + reversals.length));
  res.send(xml);
};
