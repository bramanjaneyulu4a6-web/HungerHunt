// Deleting a parent account: what it refuses, and what it leaves behind.
//
// No database — every model call is stubbed. What is under test is the rules
// applied before any query runs, the exact shape of the row that gets saved,
// and the words the parent is answered with.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const bcrypt = (await import('bcryptjs')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

/* Two more accounts, used only by the rate-limit test. They are separate ids
   precisely so the allowance that test spends is nobody else's: the limiter
   guarding this route keys by parent account, and its store outlives an
   individual test in this file. */
const NOISY_PARENT_ID = '507f1f77bcf86cd799439012';
const QUIET_PARENT_ID = '507f1f77bcf86cd799439013';

// accountDeleteLimiter's `max` in backend/middleware/rateLimit.js. The two are
// the same fact written twice; a change there should fail this.
const ACCOUNT_DELETE_MAX = 10;

/* The token and the row have to agree on this. protectParent matches the
   token's `v` against the row's tokenVersion, so a token signed at 0 against a
   row at 2 is a pairing production would reject — and arithmetic on it would
   prove nothing about the bump. */
const TOKEN_VERSION = 2;
const parentToken = signParentToken(PARENT_ID, '9876543210', TOKEN_VERSION);

/* The four strings the parent actually reads. They are contractual: the app
   renders them verbatim and the store-listing document quotes the deletion
   behaviour, so a reword is a product change and should break a test. */
const MESSAGES = {
  deleted: 'Your account has been deleted.',
  passwordRequired: 'Your account password is required to delete your account.',
  passwordWrong: 'Your account password is incorrect.',
  approvalWaiting:
    'You have a purchase waiting for your answer. Answer it before deleting your account.',
};

let base;
let passwordHash;

before(async () => {
  passwordHash = await bcrypt.hash('correct-horse', 10);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

/* Two different callers reach Parent.exists during one delete, and they want
   opposite answers. protectParent asks "is this session still live?" by _id and
   token version, and must hear yes or nothing else in the request runs.
   syncStudentRegistration then asks "does any active parent still list this
   student?" by studentIds — and after the row has been archived the truthful
   answer is no, which is the whole point of the write it makes next.

   One blanket stub would answer both with the same value and quietly turn the
   registration assertion into a test of the stub. The two filters are already
   distinguishable — only protectParent's names an _id — so discriminate on
   that rather than on call order, which would break the moment either caller
   gained a query. The registration assertion is made against the
   Student.updateOne write regardless, so it never rests on this boolean alone. */
const sessionIsLive = () =>
  mock.method(Parent, 'exists', async (filter) =>
    (filter?._id ? { _id: PARENT_ID } : null));

const parentRow = (overrides = {}) => ({
  _id: PARENT_ID,
  fatherName: 'Ravi Kumar',
  phone: '9876543210',
  email: 'ravi@example.com',
  password: passwordHash,
  studentIds: [STUDENT_ID],
  pushTokens: [{ token: 'device-a', platform: 'android' }],
  fcmToken: 'legacy',
  // A reset link already in flight. Deleting the account has to invalidate it
  // too, or the mail sitting in an inbox is still a way back in.
  resetPasswordToken: 'a-live-reset-token',
  resetPasswordExpire: new Date(Date.now() + 60 * 60 * 1000),
  tokenVersion: TOKEN_VERSION,
  ...overrides,
});

const del = (body, { token = parentToken } = {}) =>
  fetch(`${base}/api/parent/account`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

afterEach(() => mock.restoreAll());

describe('DELETE /parent/account', () => {
  /* Without this the route's first test would pass with the auth gate removed:
     the missing-password 400 is returned before the controller ever reads
     req.parent.id. The code is what proves the answer came from the middleware
     and not from the controller, which never emits one. */
  test('is behind protectParent, not merely behind a body check', async () => {
    let reachedController = false;
    mock.method(Parent, 'findById', async () => {
      reachedController = true;
      return parentRow();
    });

    const res = await del({ password: 'correct-horse' }, { token: null });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.code, 'AUTH_REQUIRED');
    assert.equal(reachedController, false);
  });

  /* The limiter on this route can only key by parent account if protectParent
     has already put one on the request, so this is a test of mount order as
     much as of the limiter. Mounted the other way round — which is how the
     route shipped first — the limiter falls back to the IP, and a school's
     worth of parents behind one NAT share a single bucket with each other and
     with the login routes.

     What separates the two arrangements is exactly this: one parent spends the
     whole allowance getting their own password wrong, and then a different
     parent at the same address asks. IP-keyed, the second parent is refused
     and cannot sign in for fifteen minutes. Account-keyed, they are answered
     normally, which is what is asserted below.

     Both accounts here are ids of their own, so the allowance this spends is
     not one the rest of the file draws on: the limiter's store is per-key and
     outlives an individual test. */
  test('one parent exhausting the delete limit does not lock out another on the same network', async () => {
    sessionIsLive();
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => {} }));

    const wrongPassword = (token) => del({ password: 'not-the-password' }, { token });
    const noisy = signParentToken(NOISY_PARENT_ID, '9000000001', TOKEN_VERSION);

    for (let attempt = 0; attempt < ACCOUNT_DELETE_MAX; attempt += 1) {
      assert.equal((await wrongPassword(noisy)).status, 401);
    }

    // The allowance is spent, so this account — and only this account — is now
    // being throttled rather than answered.
    assert.equal((await wrongPassword(noisy)).status, 429);

    // Same address, different account, therefore a different bucket. Under the
    // IP-keyed limiter this line reads 429.
    const quiet = signParentToken(QUIET_PARENT_ID, '9000000002', TOKEN_VERSION);
    const neighbour = await wrongPassword(quiet);

    assert.equal(neighbour.status, 401);
    assert.equal((await neighbour.json()).message, MESSAGES.passwordWrong);
  });

  test('refuses a missing password without touching the row', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));

    const res = await del({});
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.message, MESSAGES.passwordRequired);
    assert.equal(saved, false);
  });

  test('refuses a wrong password, and does not sign the parent out', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));

    const res = await del({ password: 'not-the-password' });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.message, MESSAGES.passwordWrong);
    assert.equal(saved, false);
    // AUTH_REQUIRED is what the app's interceptor treats as an expired
    // session. A mistyped password must not carry it.
    assert.equal(body.code, undefined);
  });

  test('refuses while an approval is still waiting', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));
    mock.method(PendingOrder, 'exists', async () => ({ _id: 'pending' }));

    const res = await del({ password: 'correct-horse' });
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.equal(body.message, MESSAGES.approvalWaiting);
    assert.equal(saved, false);
  });

  test('archives the account, clears every device, and leaves the children with no registered parent', async () => {
    sessionIsLive();
    const registrationWrites = [];
    let saved;
    mock.method(Parent, 'findById', async () =>
      parentRow({ save: async function () { saved = this; } }));
    mock.method(PendingOrder, 'exists', async () => null);
    mock.method(Student, 'updateOne', async (filter, update) => {
      registrationWrites.push({ filter, update });
      return {};
    });

    const res = await del({ password: 'correct-horse' });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.message, MESSAGES.deleted);
    assert.equal(saved.active, false);
    assert.equal(saved.archivedReason, 'parent');
    assert.equal(saved.archivedBy, null);
    assert.ok(saved.archivedAt instanceof Date);
    assert.deepEqual(saved.pushTokens, []);
    assert.equal(saved.fcmToken, null);
    assert.equal(saved.password, undefined);
    // A reset mail already sent must stop working at the same moment.
    assert.equal(saved.resetPasswordToken, undefined);
    assert.equal(saved.resetPasswordExpire, undefined);
    // Bumping this is what ends the sessions on the parent's other devices.
    assert.equal(saved.tokenVersion, TOKEN_VERSION + 1);
    assert.equal(registrationWrites.length, 1);
    assert.equal(String(registrationWrites[0].filter._id), STUDENT_ID);
    assert.equal(
      registrationWrites[0].update.$set.isParentRegistered,
      false,
    );
  });

  /* The registration sync runs after the account has already been archived and
     its password already removed, so a throw there must not reach the
     controller's catch. If it did, the parent would be told "Couldn't delete
     your account. Please try again." on a deletion that had in fact succeeded;
     the retry would answer "Your account password is incorrect", because the
     password it would have compared against is the one this request removed;
     and the next navigation would land them on /login?expired=1. Three
     untruths, in the order most likely to make someone call the school — for a
     cached boolean on a student row.

     So the request is answered with what actually happened, and the stale flag
     is written to the log where it can be found and repaired. */
  test('still reports success when the registration sync fails after the archive', async () => {
    sessionIsLive();
    let saved;
    mock.method(Parent, 'findById', async () =>
      parentRow({ save: async function () { saved = this; } }));
    mock.method(PendingOrder, 'exists', async () => null);
    mock.method(Student, 'updateOne', async () => {
      throw new Error('student write failed');
    });
    const logged = [];
    mock.method(console, 'error', (...args) => { logged.push(args); });

    const res = await del({ password: 'correct-horse' });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.message, MESSAGES.deleted);
    // 200 is the honest answer because the deletion itself did happen.
    assert.equal(saved.active, false);
    assert.equal(saved.password, undefined);
    assert.deepEqual(saved.pushTokens, []);
    assert.equal(saved.tokenVersion, TOKEN_VERSION + 1);
    // And the roster row left out of step is discoverable rather than silent.
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /stale/i);
    assert.equal(String(logged[0][1]), PARENT_ID);
  });

  /* The assertions above are made against a plain object, so they can only say
     the controller assigned undefined — not that mongoose turns that into a
     removal. On a real document it does, and that is the difference between an
     account with no password and an account whose old password still works.
     hydrate() is the same starting state findById hands the controller: a
     persisted row with nothing modified yet. No database is involved. */
  test('assigning undefined really removes the password from the row', () => {
    const doc = Parent.hydrate({
      _id: PARENT_ID,
      fatherName: 'Ravi Kumar',
      phone: '9876543210',
      password: passwordHash,
      studentIds: [STUDENT_ID],
      resetPasswordToken: 'a-live-reset-token',
      resetPasswordExpire: new Date(Date.now() + 60 * 60 * 1000),
      tokenVersion: TOKEN_VERSION,
    });

    // Exactly the assignments the controller makes to the credential fields.
    doc.password = undefined;
    doc.resetPasswordToken = undefined;
    doc.resetPasswordExpire = undefined;

    const changes = doc.getChanges();

    assert.equal(changes.$unset?.password, 1);
    assert.equal(changes.$unset?.resetPasswordToken, 1);
    assert.equal(changes.$unset?.resetPasswordExpire, 1);
    // And nothing writes the hash back under another guise.
    assert.equal(changes.$set?.password, undefined);
    assert.equal(doc.password, undefined);
  });

  /* Stubbing Parent.exists to null and asserting 401 only restates the stub —
     it passed before this route existed. What is worth testing is the rule the
     bump relies on: protectParent asks for the row AT the token's version, so
     once the account is archived and the version incremented, the token that
     did the deleting matches nothing. This answers from a row rather than a
     constant, so the filter has to be right for the 401 to arrive. */
  test('the token that deleted the account no longer opens anything', async () => {
    // A stand-in for Mongo's matcher, covering only what atTokenVersion builds.
    const matches = (filter, row) =>
      Object.entries(filter).every(([key, want]) => {
        if (key === '$or') return want.some((clause) => matches(clause, row));
        const have = row[key];
        if (want && typeof want === 'object' && !(want instanceof Date)) {
          if ('$ne' in want) return String(have) !== String(want.$ne);
          if ('$exists' in want) return (have !== undefined) === want.$exists;
        }
        return String(have) === String(want);
      });

    const archivedRow = {
      _id: PARENT_ID,
      active: false,
      activationRequired: false,
      tokenVersion: TOKEN_VERSION + 1,
    };

    let askedFilter;
    mock.method(Parent, 'exists', async (filter) => {
      askedFilter = filter;
      return matches(filter, archivedRow) ? { _id: PARENT_ID } : null;
    });

    const res = await fetch(`${base}/api/parent/dashboard`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.code, 'AUTH_REQUIRED');
    // The 401 is the version mismatch, not a blanket refusal: the gate asked
    // for this account at the version the token carries.
    assert.equal(String(askedFilter._id), PARENT_ID);
    assert.equal(askedFilter.tokenVersion, TOKEN_VERSION);
    assert.deepEqual(askedFilter.active, { $ne: false });

    // The other direction, so the matcher cannot be silently always-null: the
    // same row does answer the same filter once the version agrees — and even
    // then not while the account is archived.
    assert.equal(matches({ ...askedFilter, tokenVersion: TOKEN_VERSION + 1 }, archivedRow), false);
    assert.equal(
      matches({ ...askedFilter, tokenVersion: TOKEN_VERSION + 1 }, { ...archivedRow, active: true }),
      true,
    );
  });
});
