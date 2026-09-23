/* What may be done to a package that was charged when it should have been
 * sent to a parent, decided without touching anything.
 *
 * Written for scripts/revertConfirmedToParentApproval.js, and kept apart from
 * it for the same reason utils/scriptTarget.js is kept apart from the scripts
 * that connect: the decision is cheap, pure and worth testing, while the act
 * it authorises credits real wallets and rings real phones and can only be
 * tested by doing it. Everything that can be known before the writing starts
 * is worked out here, so a dry run and a live run reach their verdicts by the
 * same road and the dry run is a genuine rehearsal rather than a summary.
 *
 * Three verdicts, not two:
 *
 *   REVERT       put the money back, raise a fresh request, tell the parent
 *   REFUND_ONLY  put the money back; a request cannot be raised right now
 *   SKIP         leave the package exactly as it is, and say why
 *
 * REFUND_ONLY exists because a student may hold only one open request at a
 * time. Where one is already open the charge is still a mistake and the money
 * still goes back; the request it deserves is raised by a later --resume, once
 * the open one has been answered.
 */

const skip = (reason) => ({ action: 'SKIP', reason, warnings: [] });

/* The count guard, and the only thing standing between a selection that moved
 * since somebody counted it and a run that refunds the wrong families.
 *
 * The selection is "every confirmed package", which is a live query: a kiosk
 * sale rung up between the counting and the running lands in it. So the number
 * is stated on the command line and checked here, and any disagreement stops
 * the run rather than widening it.
 *
 * Returns the complaint, or null when the run may proceed. */
export const expectationProblem = ({ found, expected }) => {
  if (expected === undefined || expected === null || expected === '') {
    return '--apply needs --expect=<count> so a selection that has changed since you counted it stops the run. Preview first without --apply. Nothing was written.';
  }

  if (!/^\d+$/.test(String(expected))) {
    return '--expect must be a whole number, for example --expect=41. Nothing was run.';
  }

  if (Number(expected) !== found) {
    return `Expected ${expected} confirmed package(s) but found ${found}. Nothing was written. Re-count, then re-run with the number you see above.`;
  }

  return null;
};

// The only stage a mistaken charge can be undone from. The refund path refuses
// anything further along on its own, but saying so here keeps the reason in
// the report rather than in an exception.
const REVERTIBLE_STATUS = 'PENDING';

/* A line a parent can be shown honestly: something to buy, a name to read and
   a price to agree to. A charge whose product has since been deleted fails the
   first, which is why this is checked before anything is written rather than
   discovered by a validation error halfway through a wallet credit. */
const lineIsShowable = (item) =>
  Boolean(item?.productId) &&
  Boolean(String(item?.name ?? '').trim()) &&
  Number.isFinite(Number(item?.quantity)) &&
  Number(item.quantity) > 0 &&
  Number.isFinite(Number(item?.price));

/* The basket the parent will be shown, copied from what was actually rung up.
 *
 * The price travels with it. A parent is being asked to approve the purchase
 * that was made in their name, so they see the price it was made at — not
 * today's. chargeCart re-reads stock and price when they approve, exactly as
 * it does for any other request, so a later price change is caught there and
 * not smuggled in here.
 *
 * Rebuilt field by field rather than spread: these come off a mongoose
 * subdocument carrying an _id and a prototype full of getters, and a pending
 * order's line wants four fields and no history. */
export const approvalItemsFrom = (transaction) =>
  (transaction?.items ?? []).map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  }));

export const classifyPackage = ({
  order,
  transaction,
  student,
  parent,
  hasLiveRequest,
  skipApproved = false,
}) => {
  if (!order) return skip('the package record is missing');

  if (order.status !== REVERTIBLE_STATUS) {
    return skip(
      `the package is ${order.status}, and only a ${REVERTIBLE_STATUS} one can be sent back for approval`
    );
  }

  // Checked before the parent, because a missing student makes every later
  // question unanswerable rather than merely awkward.
  if (!student) return skip('the student record is missing');

  /* The showroom account is refused by name here as it is in chargeCart and
     createPendingOrder. Its packages delete themselves and its parent must
     never be notified, so a revert would credit a wallet nobody spends and
     buzz a phone belonging to nobody. */
  if (student.demoAccount) return skip('this is the demo account');

  if (!transaction) return skip('the charge behind this package is missing');

  /* Deleting a charge already returns its money (utils/ledgerDeletion.js).
     Refunding on top would credit the wallet twice for one sale — the one
     mistake in this whole exercise that is worse than the one it corrects. */
  if (transaction.deletion) {
    return skip('the charge was already deleted, and its money already went back');
  }

  /* Asked before anything else about the basket, because the answer is about
     how the charge came to happen rather than what is in it.

     A PARENT_APPROVAL charge was made because somebody was asked and agreed —
     the parent, or the room caretaker they handed the decision to. Undoing one
     tells a family their answer did not count and puts the same question to
     them twice. That is a different act from refunding a charge nobody was
     consulted on, so it is opt-out rather than assumed. */
  if (skipApproved && transaction.sourceType === 'PARENT_APPROVAL') {
    return skip('a parent or caretaker already approved this one');
  }

  const items = approvalItemsFrom(transaction);

  if (!items.length || !items.every(lineIsShowable)) {
    return skip('a charged line is missing its product, name, quantity or price');
  }

  /* Nobody to answer. Reverting would take a real package off the storeroom's
     board and replace it with a request that can never be approved, so the
     package is left standing and named in the report instead. */
  if (!parent) return skip('no parent is linked, so nobody could approve it');

  const warnings = student.requiresParentApproval
    ? []
    : ['parent approval is still off for this student, so the next kiosk sale will charge them again'];

  if (hasLiveRequest) {
    return {
      action: 'REFUND_ONLY',
      reason: 'the student already has a request waiting with their parent, and may only have one',
      warnings,
      items,
    };
  }

  return { action: 'REVERT', reason: '', warnings, items };
};

/* The verdicts for a whole run, in the order the packages will be written.
 *
 * Order matters, which is the reason this is a walk rather than a map. Two of
 * the packages in one run can belong to the same student, and a student may
 * hold only one open request — so the second of the pair cannot be raised just
 * because it looked raisable when the run started. The first claims the
 * student, and every later package of theirs is refunded and left for a
 * --resume once the request it collides with has been answered.
 *
 * `hasLiveRequest` is asked per entry rather than passed in as a set, because
 * the caller reads it from the database and the answer for the second package
 * of a pair depends on what this walk decided about the first. */
export const planPackages = (entries, { skipApproved = false } = {}) => {
  const claimed = new Set();

  return entries.map((entry) => {
    const studentId = entry.student ? String(entry.student._id) : null;

    const plan = classifyPackage({
      ...entry,
      skipApproved,
      hasLiveRequest: Boolean(entry.hasLiveRequest) || (studentId ? claimed.has(studentId) : false),
    });

    if (plan.action === 'REVERT' && studentId) claimed.add(studentId);

    return { ...entry, plan };
  });
};
