// The parent-facing endpoints, at the points where they were sending more than
// the app reads or accepting more than they should.
//
// No database: every model call these routes make is stubbed, which is enough
// because what is under test is the shape of the response and the rules applied
// before any query runs.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { signAdminToken, signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

const ADMIN_ID = '507f1f77bcf86cd799439012';

const adminToken = signAdminToken(ADMIN_ID);
const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// protectParent asks whether the session is still live: the account exists and
// its tokenVersion still matches the one stamped into the token. Every test
// here is about something else, so the answer is always yes. What happens when
// it is no is in parentSessions.test.js.
beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => mock.restoreAll());

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// assertOwnsStudent looks the parent up by id to check the student is theirs.
const ownsTheStudent = () =>
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));

describe('the dashboard sends what the dashboard renders', () => {
  test('no transaction history rides along', async () => {
    mock.method(Parent, 'findById', () => ({
      populate: async () => ({
        _id: PARENT_ID,
        studentIds: [{ _id: STUDENT_ID, name: 'Child', pocketMoney: 500 }],
      }),
    }));

    const body = await (await get('/api/parent/dashboard')).json();

    assert.deepEqual(Object.keys(body), ['children']);
    assert.equal(body.children.length, 1);
  });

  test('only the fields the cards show are selected', async () => {
    let populateArg;

    mock.method(Parent, 'findById', () => ({
      populate: async (arg) => {
        populateArg = arg;
        return { studentIds: [] };
      },
    }));

    await get('/api/parent/dashboard');

    // rechargeHistory grows for as long as a child is enrolled and was being
    // sent on a screen that shows a balance.
    assert.equal(populateArg.select.includes('rechargeHistory'), false);
    assert.equal(populateArg.select.includes('pocketMoney'), true);
  });
});

describe('child history comes a page at a time', () => {
  const billQuery = (bills) => ({
    sort: () => ({ skip: () => ({ limit: async () => bills }) }),
  });

  test('the first page reports there is more to come', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 45);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills`)).json();

    assert.equal(body.total, 45);
    assert.equal(body.page, 1);
    assert.equal(body.hasMore, true);
  });

  test('the last page does not', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 21);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills?page=2`)).json();

    assert.equal(body.page, 2);
    assert.equal(body.hasMore, false);
  });

  test('a limit past the cap is clamped rather than honoured', async () => {
    ownsTheStudent();

    let asked;
    mock.method(Transaction, 'find', () => ({
      sort: () => ({ skip: () => ({ limit: async (n) => ((asked = n), []) }) }),
    }));
    mock.method(Transaction, 'countDocuments', async () => 5000);

    await get(`/api/parent/child/${STUDENT_ID}/bills?limit=100000`);

    assert.equal(asked, 100);
  });

  test('recharges come newest first', async () => {
    ownsTheStudent();
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        rechargeHistory: [{ amount: 1 }, { amount: 2 }, { amount: 3 }],
      }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    assert.deepEqual(
      body.recharges.map((r) => r.amount),
      [3, 2, 1]
    );
    assert.equal(body.total, 3);
    assert.equal(body.hasMore, false);
  });

  test('a student belonging to someone else is refused', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: ['507f191e810c19729de860ff'] }),
    }));

    const res = await get(`/api/parent/child/${STUDENT_ID}/bills`);

    assert.equal(res.status, 403);
  });
});

describe('registration holds passwords to the same rule as the reset', () => {
  test('a short password is refused before any lookup', async () => {
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '9876543210',
      email: 'parent@example.com',
      password: 'abc',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /at least 6/);
  });

  test('a missing password does not reach bcrypt', async () => {
    // bcrypt.hash(undefined) threw, and the parent saw a 500.
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '9876543210',
      email: 'parent@example.com',
    });

    assert.equal(res.status, 400);
  });

  test('a number that cannot match the school records is refused', async () => {
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '+91 98765 43210',
      email: 'parent@example.com',
      password: 'longenough',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /10-digit/);
  });
});

describe('login does not say which phone numbers have accounts', () => {
  test('an unknown number and a wrong password read the same', async () => {
    mock.method(Parent, 'findOne', async () => null);

    const unknown = await post('/api/parent/login', {
      parentPhoneNumber: '9000000000',
      password: 'whatever',
    });

    mock.restoreAll();

    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('the-real-password', 4);
    mock.method(Parent, 'findOne', async () => ({ _id: PARENT_ID, password: hash }));

    const wrongPassword = await post('/api/parent/login', {
      parentPhoneNumber: '9876543210',
      password: 'not-the-real-password',
    });

    assert.equal(unknown.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.equal(
      (await unknown.json()).message,
      (await wrongPassword.json()).message
    );
  });
});

describe('the purchase code is four digits', () => {
  // post() above is deliberately signed out — it serves the register and login
  // tests. These routes are behind protectParent, so they need the token.
  const postSignedIn = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`,
      },
      body: JSON.stringify(body),
    });

  // Every one of these routes hangs off assertOwnsStudent, so the parent has
  // to own the student before the rule is even reached.
  const setCode = (password) =>
    postSignedIn('/api/parent/set-purchase-password', {
      studentId: STUDENT_ID,
      password,
    });

  const authorized = () => {
    ownsTheStudent();
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        purchasePassword: null,
        save: async () => {},
      }),
    }));
  };

  test('four digits is accepted', async () => {
    authorized();

    const res = await setCode('4821');

    assert.equal(res.status, 200);
  });

  for (const [description, code] of [
    ['three digits', '482'],
    ['five digits', '48210'],
    ['letters', 'abcd'],
    ['digits with a letter', '48a1'],
    ['a decimal point', '4.82'],
    ['spaces around it', ' 482'],
    ['nothing at all', ''],
  ]) {
    test(`${description} is refused`, async () => {
      authorized();

      const res = await setCode(code);
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.match(body.message, /4 digits|code is required/i);
    });
  }

  test('a code that is only long is no longer good enough', async () => {
    // The old rule was "at least 4 characters", so this used to pass. It is
    // the case that tells the two rules apart.
    authorized();

    const res = await setCode('correct-horse');

    assert.equal(res.status, 400);
  });

  test('the account password is the way off a code from before the rule', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const parentHash = await bcrypt.hash('the-parent-password', 4);
    const saved = { _id: STUDENT_ID, save: async () => {} };

    mock.method(Parent, 'findById', (id) =>
      String(id) === PARENT_ID
        ? {
            select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
            then: undefined,
          }
        : null
    );

    // resetPurchasePassword awaits Parent.findById directly for the password
    // check, and through .select() for the ownership check.
    mock.method(Parent, 'findById', () => {
      const doc = {
        _id: PARENT_ID,
        studentIds: [STUDENT_ID],
        password: parentHash,
        select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
      };
      return Object.assign(Promise.resolve(doc), doc);
    });

    mock.method(Student, 'findById', async () => saved);

    const res = await postSignedIn('/api/parent/reset-purchase-password', {
      studentId: STUDENT_ID,
      parentPassword: 'the-parent-password',
      newPassword: '1234',
    });

    assert.equal(res.status, 200);
    assert.equal(saved.purchaseCodeIsPin, true);
  });
});

describe('a code is recorded as four digits so the counter can tell', () => {
  // Nothing can ask a bcrypt hash whether it is four digits, so the answer is
  // written down when it is known. These are the two moments it is known.
  const postSignedIn = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`,
      },
      body: JSON.stringify(body),
    });

  test('saving a code marks the student', async () => {
    const saved = { _id: STUDENT_ID, purchasePassword: null, save: async () => {} };

    ownsTheStudent();
    mock.method(Student, 'findById', () => ({ select: async () => saved }));

    await postSignedIn('/api/parent/set-purchase-password', {
      studentId: STUDENT_ID,
      password: '4821',
    });

    assert.equal(saved.purchaseCodeIsPin, true);
  });

  test('a code that is not four digits is refused before bcrypt', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));

    const looked = mock.method(Student, 'findById', () => ({
      select: async () => ({ _id: STUDENT_ID }),
    }));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: 'legacy-long-password',
      }),
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /4 digits/i);
    assert.equal(looked.mock.callCount(), 0, 'refused before the student is even read');
  });

  test('a wrong code says what else it might be when the format is unknown', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('9999', 4);

    // A miss is counted towards the checkout lock now. The controller does not
    // depend on the write landing — it answers "wrong code" either way — but an
    // unstubbed one costs this test a buffering timeout.
    mock.method(Student, 'updateOne', async () => ({}));

    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        parentPhoneNumber: '9876543210',
        purchasePassword: hash,
        purchaseCodeIsPin: false,
      }),
    }));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: '1234',
      }),
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /before codes became 4 digits/i);
  });

  test('a four-digit code accepted at the counter marks the student', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('4821', 4);

    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        parentPhoneNumber: '9876543210',
        purchasePassword: hash,
        purchaseCodeIsPin: false,
      }),
    }));

    const marked = mock.method(Student, 'updateOne', async () => ({}));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: '4821',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(marked.mock.callCount(), 1);
    assert.deepEqual(marked.mock.calls[0].arguments[1], { purchaseCodeIsPin: true });
  });
});
