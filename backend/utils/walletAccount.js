import Student from '../models/Student.js';

/* Student.pocketMoney is the one current-balance projection for every app.
 * Transactions, adjustments and reversals are immutable history; their
 * previous/new balance fields are audit snapshots, never alternate balances.
 * Keeping every live read and mutation here prevents a new surface from
 * quietly calculating its own version of the wallet. */
export const walletView = (student) => ({
  studentId: String(student._id),
  balance: Number(student.pocketMoney || 0),
  currency: 'INR',
  updatedAt: student.updatedAt || null,
});

export const readWallet = async (studentId, { activeOnly = true, session = null } = {}) => {
  const query = Student.findOne({
    _id: studentId,
    ...(activeOnly ? { active: { $ne: false } } : {}),
  }).select('_id pocketMoney updatedAt');
  const student = session ? await query.session(session) : await query;
  return student ? walletView(student) : null;
};

export const creditWallet = (studentId, amount, { activeOnly = false, session = null } = {}) =>
  Student.findOneAndUpdate(
    {
      _id: studentId,
      ...(activeOnly ? { active: { $ne: false } } : {}),
    },
    { $inc: { pocketMoney: amount } },
    { new: true, ...(session ? { session } : {}) }
  );

export const debitWallet = (studentId, amount, { session = null } = {}) =>
  Student.findOneAndUpdate(
    { _id: studentId, active: { $ne: false }, pocketMoney: { $gte: amount } },
    { $inc: { pocketMoney: -amount } },
    { new: true, ...(session ? { session } : {}) }
  );
