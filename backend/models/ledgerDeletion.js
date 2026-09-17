import mongoose from 'mongoose';

/* The mark a deleted wallet row carries.
 *
 * Wallet rows are history, so deleting one never removes it: the row stays
 * where it was, carries this mark, and every reader decides what a deleted
 * row means for it (the Transactions page shows it struck through, the Tally
 * exports and the totals leave it out). Deleting also undoes the money —
 * utils/ledgerDeletion.js moves the wallet back — and the balances either side
 * of that move are recorded here, because the wallet audit replays them as an
 * event of their own.
 *
 * Both names are copies taken at the moment of deletion. Who made the row and
 * who deleted it are what the office asks about a deleted row, and the answer
 * must not change when an admin is renamed or removed later. */
export const DELETION_REASON_MAX = 200;

export const deletionSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    byName: { type: String, required: true, maxlength: 120 },
    madeBy: { type: String, default: '', maxlength: 120 },
    reason: { type: String, required: true, trim: true, maxlength: DELETION_REASON_MAX },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
  },
  { _id: false }
);

// The mark as a reader hands it on: the audit balances stay on the server.
export const deletionView = (deletion) =>
  deletion
    ? {
        at: deletion.at,
        byName: deletion.byName,
        madeBy: deletion.madeBy || null,
        reason: deletion.reason,
      }
    : null;
