import Student from '../models/Student.js';

/* The showroom account: the student a visiting parent is handed at an open
 * day so they can drive the kiosk themselves and have it lead nowhere.
 *
 * It is deliberately not the PhonePe test account in utils/testAccount.js.
 * That one is a real student who really buys things — its orders are written,
 * its packages are picked, its parent is notified — and it only has some
 * limits lifted so a reviewer is not made to wait a week. This one is the
 * opposite: every limit is off AND nothing it does is recorded. Conflating
 * the two would have made the reviewer's orders vanish.
 *
 * Unlike the test account, which is declared by an environment variable, this
 * is a flag on the row. That is the weaker of the two choices — a bypass that
 * hides orders and silences parents can now be switched on by writing data —
 * so the flag is kept out of WRITABLE_FIELDS in controllers/studentController.js,
 * which is the whitelist every admin route and the CSV importer write through.
 * scripts/createDemoStudent.js is the only thing that sets it.
 *
 * Takes a loaded student or an id, like isTestAccountStudent. An object is
 * answered from the object and an id is looked up — with no cleverness in
 * between, because the obvious cleverness is wrong. Asking whether the key is
 * present and querying when it is not looks like it protects a caller who
 * passed a projected document; it does not, because a mongoose document
 * carries every schema path as a prototype getter, so the key is always
 * "present" and the fallback never fires for the case it was written for. All
 * it achieves is a second query against callers holding a plain object.
 *
 * So the rule that actually holds is the flat one: a caller passing a
 * document must have selected demoAccount. Both that do — createKioskSession
 * and checkPurchaseCode — select it, and checkout.js passes an unprojected
 * document. A projection that forgot it would read as not-demo, which shows
 * up as a demo order being recorded: wrong, but wrong loudly and only for the
 * demo account. No real student is touched either way.
 */

// Twelve hours: long enough that no visitor ever sees a countdown, short
// enough that the token dies overnight. /students/kiosk-session takes an
// admission number and no secret, so a token minted there that never expired
// would be a permanent key cut from a lock anyone can reach.
export const DEMO_SESSION_SECONDS = 12 * 60 * 60;

export const isDemoStudent = async (studentOrId, { session = null } = {}) => {
  if (!studentOrId) return false;

  if (typeof studentOrId === 'object') return studentOrId.demoAccount === true;

  const query = Student.findById(studentOrId).select('demoAccount').lean();
  const student = session ? await query.session(session) : await query;

  return student?.demoAccount === true;
};
