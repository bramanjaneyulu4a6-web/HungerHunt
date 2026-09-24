// A super admin answering an order that is waiting on the parent, from the
// Student Orders board.
//
// What is pinned here: every admin sees the waiting orders, only a super admin
// may answer them, the answer is scoped by nothing but the order itself (the
// parent's or caretaker's hold does not stop it), and the admin is recorded as
// the one who answered.
//
// No database: every model call is stubbed, as in caretakerApproval.test.js.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const { signParentToken, signStaffToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';
const STUDENT_ID = '507f191e810c19729de860eb';
const ORDER_ID = '507f191e810c19729de860ed';

const adminToken = signStaffToken(ADMIN_ID, 'admin');
const parentToken = signParentToken(PARENT_ID, '9876543210');
const accountIs = accountMatcher(Admin, ADMIN_ID);

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

afterEach(() => mock.restoreAll());

const send = (method, path, token, body, headers = {}) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const namedAdmin = () =>
  mock.method(Admin, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: ADMIN_ID, name: 'Dhruv', roomIds: [] }) }),
  }));

const waitingOrder = (fields = {}) =>
  mock.method(PendingOrder, 'findOne', async () => ({
    _id: ORDER_ID,
    studentId: STUDENT_ID,
    parentId: PARENT_ID,
    totalAmount: 40,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000),
    ...fields,
  }));

describe('the waiting-orders list', () => {
  test('is open to any admin and lists only live orders waiting on a parent', async () => {
    accountIs('admin');
    namedAdmin();
    let asked;
    const query = {
      populate() { return query; },
      sort() { return query; },
      lean: async () => [{ _id: ORDER_ID, studentId: { name: 'Asha' }, items: [] }],
    };
    mock.method(PendingOrder, 'find', (filter) => { asked = filter; return query; });

    const res = await send('GET', '/api/pending-orders/admin', adminToken);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(asked.status, 'PENDING');
    assert.ok(asked.expiresAt.$gt instanceof Date);
    assert.equal(body.count, 1);
  });

  test('is closed to a parent', async () => {
    const res = await send('GET', '/api/pending-orders/admin', parentToken);
    assert.equal(res.status, 401);
  });
});

describe("answering for the parent", () => {
  test('is refused to a plain admin, and nothing is claimed', async () => {
    accountIs('admin', { superAdmin: false });
    const claim = mock.method(PendingOrder, 'findOneAndUpdate', async () => null);

    const approve = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-approve`, adminToken, {}, { 'Idempotency-Key': 'k1' });
    const reject = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-reject`, adminToken);

    assert.equal(approve.status, 403);
    assert.equal(reject.status, 403);
    assert.equal(claim.mock.callCount(), 0);
  });

  test('approving claims the order by its id alone, whoever holds the approval', async () => {
    accountIs('admin', { superAdmin: true });
    namedAdmin();
    waitingOrder();
    let claimFilter;
    mock.method(PendingOrder, 'findOneAndUpdate', async (filter) => {
      claimFilter = filter;
      return null; // Lost the race: stops before any money moves.
    });

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-approve`, adminToken, {}, { 'Idempotency-Key': 'super-key-1' });

    assert.equal(res.status, 409);
    assert.equal(String(claimFilter._id), ORDER_ID);
    assert.equal(claimFilter.status, 'PENDING');
    assert.equal(claimFilter.parentId, undefined);
    assert.equal(claimFilter.studentId, undefined);
  });

  test('approving without an Idempotency-Key is refused', async () => {
    accountIs('admin', { superAdmin: true });
    namedAdmin();

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-approve`, adminToken, {});

    assert.equal(res.status, 400);
  });

  test('declining records the super admin as the one who answered', async () => {
    accountIs('admin', { superAdmin: true });
    namedAdmin();
    waitingOrder();
    let update;
    mock.method(PendingOrder, 'findOneAndUpdate', async (_filter, change) => {
      update = change.$set;
      return { _id: ORDER_ID, studentId: STUDENT_ID, parentId: PARENT_ID, totalAmount: 40, ...change.$set };
    });
    mock.method(Parent, 'findById', async () => null);

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-reject`, adminToken);

    assert.equal(res.status, 200);
    assert.equal(update.status, 'REJECTED');
    assert.equal(String(update.answeredBy), ADMIN_ID);
  });

  test('an order already answered cannot be answered again', async () => {
    accountIs('admin', { superAdmin: true });
    namedAdmin();
    waitingOrder({ status: 'REJECTED' });

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/admin-reject`, adminToken);

    assert.equal(res.status, 409);
  });
});
