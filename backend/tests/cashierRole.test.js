// The till is the most exposed device in the system: it sits on a counter,
// unattended between customers, holding a token in browser storage. Until now
// that token was a full admin's — the same one the back office signs in with —
// so anyone who reached the terminal could edit the catalogue, top up a wallet
// or delete a student, none of which is anything a till does.
//
// A cashier account is what that token is worth now. These tests pin down both
// halves of that: the few routes the counter genuinely needs, and everything
// else staying where it was.
//
// No database: the Admin lookup the gate makes is stubbed to model a single
// account whose role the test chooses. What is under test is who is let where.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

// Pinned closed so a bill without a purchase token is refused for a reason that
// does not move with the calendar. These tests compare answers, so the answers
// have to be the same next month as today.
process.env.PURCHASE_AUTH_GRACE_UNTIL = '2000-01-01T00:00:00Z';
process.env.LEGACY_TOKEN_GRACE_UNTIL = '2999-01-01T00:00:00Z';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const PurchaseAuthorization = (await import('../models/PurchaseAuthorization.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

// Routes with no stub fall through to a query that cannot run. They still prove
// what they are asked to prove — a gate that opened is not a 401 — so let them
// fail fast rather than wait out the default.
mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f191e810c19729de860ea';

const adminToken = signStaffToken(STAFF_ID, 'admin');
const cashierToken = signStaffToken(STAFF_ID, 'cashier');

// What protectAdmin says to a signed-in cashier. It is deliberately not a 401:
// the session is fine, and answering with one would send the till back to the
// login screen for doing nothing wrong.
const NEEDS_ADMIN = 'This action needs a full admin account.';

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Models the one account row the gate looks up. Shared with warehouseRole.test.js
// so the two stay in lockstep if a gate's filter shape ever changes.
const accountIs = accountMatcher(Admin, STAFF_ID);

// Enough for the till's routes to answer from memory instead of a database, so
// the same request twice gives the same reply both times.
beforeEach(() => {
  accountIs('admin');
  mock.method(Inventory, 'find', () => ({ populate: async () => [] }));
  mock.method(Student, 'find', () => ({ select: () => ({ limit: async () => [] }) }));
  mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);
  mock.method(PendingOrder, 'findById', async () => null);
  mock.method(PendingOrder, 'findOne', async () => null);
});

const send = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// Status alone is not enough to compare on. A bill with no purchase token is
// refused with 403 too, and a permission denial that happened to match it would
// read as agreement, so the message comes along.
const answerTo = async (token, [method, path, body]) => {
  const res = await send(method, path, token, body);
  const parsed = await res.json().catch(() => ({}));
  return `${res.status} ${parsed?.message ?? ''}`;
};

// Everything the kiosk calls, in the order it calls them.
const TILL_ROUTES = [
  ['GET', '/api/inventory'],
  ['GET', '/api/students/search?q=as'],
  ['POST', '/api/transactions/verify-payment', {}],
  ['POST', '/api/transactions/bill', {}],
  ['POST', '/api/pending-orders', {}],
  ['GET', `/api/pending-orders/${OTHER_ID}/status`],
];

// The rest of the admin surface, which no till has ever needed.
const BACK_OFFICE_ROUTES = [
  ['GET', '/api/students'],
  ['POST', '/api/students', { name: 'Asha' }],
  ['PUT', `/api/students/${OTHER_ID}`, { name: 'Asha' }],
  ['DELETE', `/api/students/${OTHER_ID}`],
  ['POST', '/api/students/bulk', { students: [] }],
  ['PUT', `/api/students/${OTHER_ID}/topup`, { amount: 5000 }],
  ['GET', '/api/students/count'],
  ['GET', '/api/transactions/history'],
  ['GET', '/api/purchases/new'],
  ['GET', '/api/stock-groups'],
  ['GET', '/api/units'],
  ['POST', '/api/admin/register', { email: 'new@example.com', password: 'longenough1' }],
];

describe('a cashier can work the till', () => {
  for (const route of TILL_ROUTES) {
    const [method, path] = route;

    // Asserting the answers match, rather than naming a status per route, keeps
    // this about the gate. Whatever the controller then makes of an empty body
    // is its own business, and it is the same business either way.
    test(`${method} ${path} answers a cashier exactly as it answers an admin`, async () => {
      accountIs('admin');
      const asAdmin = await answerTo(adminToken, route);

      accountIs('cashier');
      const asCashier = await answerTo(cashierToken, route);

      assert.equal(asCashier, asAdmin);
      assert.ok(!asCashier.startsWith('401'), `${method} ${path} refused the cashier's token`);
      assert.ok(!asCashier.includes(NEEDS_ADMIN), `${method} ${path} is closed to the till`);
    });
  }
});

describe('and nothing else', () => {
  for (const route of BACK_OFFICE_ROUTES) {
    const [method, path] = route;

    test(`${method} ${path} is closed to a cashier`, async () => {
      accountIs('cashier');
      const res = await send(method, path, cashierToken, route[2]);

      assert.equal(res.status, 403, `${method} ${path} let a cashier through`);
      assert.equal((await res.json()).message, NEEDS_ADMIN);
    });

    test(`${method} ${path} is still open to an admin`, async () => {
      accountIs('admin');
      const res = await send(method, path, adminToken, route[2]);

      assert.ok(
        res.status !== 401 && res.status !== 403,
        `${method} ${path} locked an admin out with ${res.status}`
      );
    });
  }

  test('POST /api/purchases is closed to a cashier — storeroom work', async () => {
    accountIs('cashier');
    const res = await send('POST', '/api/purchases', cashierToken, {});
    assert.equal(res.status, 403);
    assert.equal((await res.json()).message, 'This action needs a warehouse account.');
  });

  test('GET /api/products is closed to a cashier — storeroom and back office read the catalogue, the till does not', async () => {
    accountIs('cashier');
    const res = await send('GET', '/api/products', cashierToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).message, 'This action needs a warehouse account.');
  });
});

describe('the refusal is a permission, not an expiry', () => {
  // The kiosk signs itself out on any 401. If a permission denial arrived as
  // one, a cashier who wandered onto an admin route would be thrown back to the
  // login screen, and the cause would look like a broken session.
  test('a cashier is told no without being signed out', async () => {
    accountIs('cashier');
    const res = await send('GET', '/api/transactions/history', cashierToken);

    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, undefined, 'AUTH_REQUIRED would sign the till out');
  });
});

describe('the account row decides, not the token', () => {
  test('an admin demoted to cashier loses the back office on the next request', async () => {
    // The token was signed while they were still an admin and has not expired.
    accountIs('cashier');

    const res = await send('GET', '/api/transactions/history', adminToken);
    assert.equal(res.status, 401, 'a demoted account kept its admin token working');
  });

  test('but keeps the till, which is what they were demoted to', async () => {
    accountIs('cashier');

    const res = await send('GET', '/api/inventory', adminToken);
    assert.equal(res.status, 200);
  });

  test('a cashier token is no use once the account is gone', async () => {
    mock.method(Admin, 'exists', async () => null);

    const res = await send('GET', '/api/inventory', cashierToken);
    assert.equal(res.status, 401);
  });
});

describe('accounts that predate cashiers', () => {
  // Every existing account has no role field, and every one of them is an
  // admin. Reading the missing field as anything narrower would lock the back
  // office out of itself the moment this deploys.
  test('a row with no role at all is a full admin', async () => {
    accountIs(undefined);

    const res = await send('GET', '/api/transactions/history', adminToken);
    assert.notEqual(res.status, 403);
  });

  test('a token with no role claim is a full admin', async () => {
    accountIs('admin');
    const roleless = jwt.sign({ id: STAFF_ID }, process.env.JWT_SECRET, { expiresIn: '1d' });

    const res = await send('GET', '/api/transactions/history', roleless);
    assert.notEqual(res.status, 403, 'a legacy token was read as something less than it was');
    assert.notEqual(res.status, 401);
  });
});

describe('a cashier cannot make itself an admin', () => {
  test('creating accounts is closed to them', async () => {
    accountIs('cashier');

    const res = await send('POST', '/api/admin/register', cashierToken, {
      email: 'mine@example.com',
      password: 'longenough1',
      role: 'admin',
    });

    assert.equal(res.status, 403);
  });

  test('and a forged cashier token cannot be signed', async () => {
    // The role lives inside the signature, so editing it invalidates the token.
    // This is the same key the real one is signed with; only the claim differs.
    accountIs('admin');
    const forged = jwt.sign({ id: STAFF_ID, role: 'superuser' }, process.env.JWT_SECRET);

    const res = await send('GET', '/api/inventory', forged);
    assert.equal(res.status, 401, 'an unknown role was treated as a known one');
  });
});
