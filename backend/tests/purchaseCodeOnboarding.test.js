// A parent who has just created their password cannot use the app until every
// one of their children has a purchase code. Two routes make that possible:
// the one the app asks which children are still missing one, and the one the
// office uses to set a code itself when a parent cannot get through the screen.
//
// No database: every model call is stubbed. What is under test is the shape of
// each response and the rules applied before any query runs.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const bcrypt = (await import('bcryptjs')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const { signAdminToken, signParentToken, signStaffToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439012';
const FIRST_CHILD = '507f191e810c19729de860ea';
const SECOND_CHILD = '507f191e810c19729de860eb';

const parentToken = signParentToken(PARENT_ID, '9876543210');
const adminToken = signAdminToken(ADMIN_ID);
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// protectParent asks whether the session is still live. Every test here is
// about something else, so the answer is always yes.
beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => mock.restoreAll());

const asParent = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

const asAdmin = (path, body, token = adminToken) =>
  fetch(base + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const parentHasChildren = (studentIds) =>
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds }),
  }));

// The pending list reads the roll, so it is a find().select().lean() chain.
const rollAnswers = (students, capture = {}) =>
  mock.method(Student, 'find', (filter) => {
    capture.filter = filter;
    return { select: () => ({ lean: async () => students }) };
  });

describe('the app asks which children still need a code', () => {
  test('only children without a code are listed', async () => {
    parentHasChildren([FIRST_CHILD, SECOND_CHILD]);
    const asked = {};
    rollAnswers([{ _id: SECOND_CHILD, name: 'Second', className: '8', section: 'B' }], asked);

    const response = await asParent('/api/parent/purchase-code-setup');
    const body = await response.json();

    assert.equal(response.status, 200);
    // The query, not the reply, is what keeps a child with a code out of the
    // list — asking for all of them and filtering here would send the hash.
    assert.deepEqual(asked.filter.purchasePassword, null);
    assert.deepEqual(asked.filter._id.$in, [FIRST_CHILD, SECOND_CHILD]);
    assert.equal(body.pending.length, 1);
    assert.equal(body.pending[0]._id, SECOND_CHILD);
  });

  test('an archived child does not hold their parent at the gate', async () => {
    parentHasChildren([FIRST_CHILD]);
    const asked = {};
    rollAnswers([], asked);

    await asParent('/api/parent/purchase-code-setup');

    // Nobody can set a code for a student who has left, so a gate that counted
    // them would never open again.
    assert.deepEqual(asked.filter.active, { $ne: false });
  });

  test('a parent whose children all have codes is sent an empty list', async () => {
    parentHasChildren([FIRST_CHILD]);
    rollAnswers([]);

    const body = await (await asParent('/api/parent/purchase-code-setup')).json();

    assert.deepEqual(body.pending, []);
  });

  test('a parent with no children linked yet is not asked to set anything', async () => {
    parentHasChildren([]);
    const reached = mock.method(Student, 'find', () => ({
      select: () => ({ lean: async () => [] }),
    }));

    const body = await (await asParent('/api/parent/purchase-code-setup')).json();

    assert.deepEqual(body.pending, []);
    assert.equal(reached.mock.callCount(), 0);
  });

  test('no session, no list', async () => {
    const response = await fetch(base + '/api/parent/purchase-code-setup');

    assert.equal(response.status, 401);
  });
});

describe('the office can set a code when a parent cannot', () => {
  const studentRow = (overrides = {}) => {
    const row = {
      _id: FIRST_CHILD,
      name: 'First',
      purchasePassword: null,
      purchaseCodeIsPin: false,
      purchaseCodeAttempts: 0,
      purchaseCodeLockedUntil: null,
      save: async () => row,
      ...overrides,
    };
    return row;
  };

  const rollHolds = (row) =>
    mock.method(Student, 'findById', () => ({ select: async () => row }));

  test('a four-digit code is stored as a hash the counter can check', async () => {
    const row = studentRow();
    accountMatcher(Admin, ADMIN_ID)('admin');
    rollHolds(row);

    const response = await asAdmin(`/api/students/${FIRST_CHILD}/purchase-code`, { code: '4821' });

    assert.equal(response.status, 200);
    assert.notEqual(row.purchasePassword, '4821');
    assert.equal(await bcrypt.compare('4821', row.purchasePassword), true);
    // The counter takes nothing but four digits, and this code is known to be.
    assert.equal(row.purchaseCodeIsPin, true);
  });

  test('an existing code is replaced, because replacing it is the point', async () => {
    const row = studentRow({
      purchasePassword: await bcrypt.hash('1111', 10),
      purchaseCodeIsPin: true,
    });
    accountMatcher(Admin, ADMIN_ID)('admin');
    rollHolds(row);

    const response = await asAdmin(`/api/students/${FIRST_CHILD}/purchase-code`, { code: '2222' });

    assert.equal(response.status, 200);
    assert.equal(await bcrypt.compare('2222', row.purchasePassword), true);
  });

  test('a checkout lock from the old code does not outlive it', async () => {
    const row = studentRow({
      purchaseCodeAttempts: 5,
      purchaseCodeLockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });
    accountMatcher(Admin, ADMIN_ID)('admin');
    rollHolds(row);

    await asAdmin(`/api/students/${FIRST_CHILD}/purchase-code`, { code: '4821' });

    // Otherwise the office hands over a code the child cannot use for another
    // fifteen minutes, having done everything asked of them.
    assert.equal(row.purchaseCodeAttempts, 0);
    assert.equal(row.purchaseCodeLockedUntil, null);
  });

  test('the code must be four digits, by the same rule as everywhere else', async () => {
    const row = studentRow();
    accountMatcher(Admin, ADMIN_ID)('admin');
    rollHolds(row);

    const response = await asAdmin(`/api/students/${FIRST_CHILD}/purchase-code`, { code: '12' });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /4 digits/);
    assert.equal(row.purchasePassword, null);
  });

  test('a student nobody can find gets no code', async () => {
    accountMatcher(Admin, ADMIN_ID)('admin');
    mock.method(Student, 'findById', () => ({ select: async () => null }));

    const response = await asAdmin(`/api/students/${FIRST_CHILD}/purchase-code`, { code: '4821' });

    assert.equal(response.status, 404);
  });

  test('a warehouse account cannot set a child\'s code', async () => {
    const row = studentRow();
    accountMatcher(Admin, ADMIN_ID)('warehouse');
    rollHolds(row);

    // 403, not 401: the storeroom's session is perfectly good, it just does
    // not reach here, and signing it out for asking would be wrong.
    const response = await asAdmin(
      `/api/students/${FIRST_CHILD}/purchase-code`,
      { code: '4821' },
      warehouseToken
    );

    assert.equal(response.status, 403);
    assert.equal(row.purchasePassword, null);
  });

  test('no staff token, no code', async () => {
    const response = await fetch(base + `/api/students/${FIRST_CHILD}/purchase-code`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '4821' }),
    });

    assert.equal(response.status, 401);
  });
});
