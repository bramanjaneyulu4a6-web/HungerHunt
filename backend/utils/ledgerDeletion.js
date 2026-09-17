/* Deleting a wallet row: the mark goes on, the money comes back off.
 *
 * Two kinds of row can be deleted, both the office's own mistakes to correct:
 * a cash deposit taken at the desk, and a wallet charge (a kiosk sale or a
 * parent-approved order). UPI money really arrived through the gateway, a UPI
 * order payment is that same money, and a refund already has its own flow
 * with stock attached — none of those are deletable here.
 *
 * Deleting never removes the row. It sets `deletion` (models/ledgerDeletion.js)
 * and moves the wallet back by the row's amount, so the balance keeps agreeing
 * with the rows that are still standing:
 *   - a deposit is taken back out, and only if the wallet still holds it;
 *   - a charge is put back in, unless a refund already did that.
 * The package and the stock behind a charge are not touched.
 *
 * Without a replica set (tests, a bare local Mongo) there is no transaction to
 * roll back, so the steps are ordered to leave nothing behind on failure: the
 * guarded wallet move first, the claim second, and the move undone by hand if
 * the claim is lost to a concurrent delete. */
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import WalletReversal from '../models/WalletReversal.js';
import { DELETION_REASON_MAX } from '../models/ledgerDeletion.js';
import { sessionOptions, withMongoTransaction } from './mongoTransaction.js';
import { creditWallet } from './walletAccount.js';

const fail = (status, message) =>
  Object.assign(new Error(message), { status, code: 'TRANSACTION_DELETE_REFUSED' });

const inSession = (query, session) => (session ? query.session(session) : query);

const rupees = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`;

// Who made a charge, in the words the ledger already uses for it.
const CHARGE_MAKERS = {
  DIRECT_CHECKOUT: 'Student at kiosk',
  PARENT_APPROVAL: 'Parent approval',
};

/* Each deletable kind: where its row lives, which rows of that collection
   count, and which way undoing it moves the wallet. The kinds are the
   Transactions page's (application/accounting/movementRows.js). */
const KINDS = {
  CASH_DEPOSIT: {
    Model: WalletAdjustment,
    // Anything not PARENT_UPI is cash, as the ledger reads it: rows older
    // than the source field carry none.
    match: { source: { $ne: 'PARENT_UPI' } },
    amountOf: (row) => row.amount,
    sign: -1,
    madeBy: async (row, session) => {
      const admin = row.performedBy
        ? await inSession(Admin.findById(row.performedBy).select('name').lean(), session)
        : null;
      return admin?.name || 'Former staff';
    },
  },
  WALLET_DEDUCTION: {
    Model: Transaction,
    match: { sourceType: { $ne: 'UPI_ORDER_PAYMENT' } },
    amountOf: (row) => row.totalAmount,
    sign: 1,
    madeBy: async (row) => CHARGE_MAKERS[row.sourceType] || CHARGE_MAKERS.DIRECT_CHECKOUT,
    // A refunded charge's money is already back; giving it again would pay twice.
    guard: async (row, session) => {
      const refunded = await inSession(WalletReversal.exists({ transactionId: row._id }), session);
      if (refunded) {
        throw fail(409, 'This charge was already refunded, so its money is back in the wallet. It cannot be deleted as well.');
      }
    },
  },
};

export const DELETABLE_KINDS = Object.freeze(Object.keys(KINDS));

// Taken back out only while the wallet still holds it: a deposit already spent
// cannot be unmade without sending the wallet below zero.
const debitHeld = (studentId, amount, session) =>
  Student.findOneAndUpdate(
    { _id: studentId, pocketMoney: { $gte: amount } },
    { $inc: { pocketMoney: -amount } },
    { new: true, ...sessionOptions(session) }
  );

const moveWallet = (studentId, amount, sign, session) =>
  sign > 0
    ? creditWallet(studentId, amount, { session })
    : debitHeld(studentId, amount, session);

export const deleteLedgerEntry = async ({ kind, id, actorId, reason }) => {
  const spec = KINDS[kind];
  if (!spec) throw fail(400, 'Only cash deposits and wallet charges can be deleted.');

  const why = String(reason ?? '').trim();
  if (!why) throw fail(400, 'Say why this transaction is being deleted.');
  if (why.length > DELETION_REASON_MAX) {
    throw fail(400, `Keep the reason under ${DELETION_REASON_MAX} characters.`);
  }
  if (!mongoose.Types.ObjectId.isValid(id)) throw fail(404, 'Transaction not found.');

  return withMongoTransaction(async (session) => {
    const row = await inSession(spec.Model.findOne({ _id: id, ...spec.match }).lean(), session);
    if (!row) throw fail(404, 'Transaction not found.');
    if (row.deletion) throw fail(409, 'This transaction has already been deleted.');
    await spec.guard?.(row, session);

    // One after the other: a transaction's session takes one operation at a time.
    const actor = await inSession(Admin.findById(actorId).select('name').lean(), session);
    if (!actor) throw fail(401, 'Your admin account was not found.');
    const madeBy = await spec.madeBy(row, session);

    const amount = Number(spec.amountOf(row)) || 0;
    const student = await moveWallet(row.studentId, amount, spec.sign, session);
    if (!student) {
      const exists = await inSession(Student.findById(row.studentId).select('pocketMoney').lean(), session);
      if (!exists) throw fail(409, "This student's record is missing, so the wallet cannot be corrected.");
      throw fail(
        409,
        `The wallet holds ${rupees(exists.pocketMoney)}, less than this ${rupees(amount)} deposit — ` +
          'it has already been spent, so it cannot be taken back.'
      );
    }

    const deletion = {
      at: new Date(),
      by: actorId,
      byName: String(actor.name || 'Admin').slice(0, 120),
      madeBy: String(madeBy || '').slice(0, 120),
      reason: why,
      previousBalance: student.pocketMoney - spec.sign * amount,
      newBalance: student.pocketMoney,
    };
    const claimed = await spec.Model.findOneAndUpdate(
      { _id: row._id, deletion: null },
      { $set: { deletion } },
      { new: true, ...sessionOptions(session) }
    );
    if (!claimed) {
      // Someone else deleted it between the read and here; their undo stands.
      await moveWallet(row.studentId, amount, -spec.sign, session);
      throw fail(409, 'This transaction has already been deleted.');
    }

    return { kind, id: String(row._id), deletion, balance: student.pocketMoney };
  });
};
