// A student may only open a kiosk session once a parent has activated their
// account — unless a super admin has switched that rule off. The routes run
// through the real app with the model calls stubbed.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { ACTIVATED_PARENT } = await import('../utils/parentActivation.js');
const { signAdminToken, signParentToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f191e810c19729de860ea';
const ME = '507f1f77bcf86cd799439011';
const accountIs = accountMatcher(Admin, ME);

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  query.lean = () => query;
  return query;
};

const onRoll = {
  _id: STUDENT_ID,
  name: 'Asha Rao',
  admissionNumber: 'ADM1042',
  pocketMoney: 350,
  requiresParentApproval: false,
  purchasePassword: 'some-bcrypt-hash',
  parentPhoneNumber: '9876543210',
};

const postSession = () => fetch(base + '/api/students/kiosk-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ admissionNumber: 'ADM1042' }),
});

const stubStudent = (overrides = {}) => {
  mock.method(Student, 'findOne', () => queryFor({ ...onRoll, ...overrides }));
  mock.method(PendingOrder, 'findOne', () => queryFor(null));
  mock.method(FulfillmentOrder, 'findOne', () => queryFor(null));
};

const settingsRow = (row) => mock.method(OrderingSettings, 'findOne', () => queryFor(row));

describe('what counts as an activated parent', () => {
  test('the filter matches the parent sign-in rule: active, set up, with a password', () => {
    assert.deepEqual(ACTIVATED_PARENT, {
      active: { $ne: false },
      activationRequired: { $ne: true },
      password: { $nin: [null, ''] },
    });
  });
});

describe('the kiosk door with the rule on', () => {
  test('with no settings row the rule is on, and a student whose parent never activated is refused', async () => {
    stubStudent();
    settingsRow(null);
    let asked;
    mock.method(Parent, 'exists', async (filter) => { asked = filter; return null; });

    const res = await postSession();
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.equal(body.code, 'KIOSK_PARENT_NOT_ACTIVATED');
    assert.match(body.message, /parent/i);
    assert.equal(body.token, undefined);
    assert.equal(String(asked.studentIds), STUDENT_ID);
    assert.equal(asked.activationRequired.$ne, true);
  });

  test('a student with an activated parent is let in', async () => {
    stubStudent();
    settingsRow({ requireActivatedParent: true });
    mock.method(Parent, 'exists', async () => ({ _id: 'p1' }));

    const res = await postSession();
    assert.equal(res.status, 200);
    assert.ok((await res.json()).token);
  });

  test('the demo account is never asked about a parent', async () => {
    stubStudent({ demoAccount: true });
    settingsRow({ requireActivatedParent: true });
    const exists = mock.method(Parent, 'exists', async () => null);

    const res = await postSession();
    assert.equal(res.status, 200);
    assert.equal(exists.mock.callCount(), 0);
  });
});

describe('the kiosk door with the rule off', () => {
  test('a student whose parent never activated is let in without a parent lookup', async () => {
    stubStudent();
    settingsRow({ requireActivatedParent: false });
    const exists = mock.method(Parent, 'exists', async () => null);

    const res = await postSession();
    assert.equal(res.status, 200);
    assert.equal(exists.mock.callCount(), 0);
  });
});

const asAdmin = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { Authorization: `Bearer ${signAdminToken(ME)}`, 'Content-Type': 'application/json', ...options.headers },
});

describe('the ordering settings routes', () => {
  test('a super admin reads the default as on', async () => {
    accountIs('admin', { superAdmin: true });
    settingsRow(null);

    const res = await asAdmin('/api/admin/settings/ordering');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.requireActivatedParent, true);
    assert.equal(body.updatedAt, null);
    assert.equal(body.updatedBy, null);
  });

  test('a super admin turns it off, and who did it is recorded', async () => {
    accountIs('admin', { superAdmin: true });
    let update;
    mock.method(OrderingSettings, 'findOneAndUpdate', (filter, change) => {
      update = { filter, change };
      return queryFor({ requireActivatedParent: false, updatedAt: new Date(), updatedBy: { _id: ME, name: 'Dhruv' } });
    });

    const res = await asAdmin('/api/admin/settings/ordering', {
      method: 'PUT',
      body: JSON.stringify({ requireActivatedParent: false }),
    });

    assert.equal(res.status, 200);
    assert.equal(update.change.$set.requireActivatedParent, false);
    assert.equal(String(update.change.$set.updatedBy), ME);
    const body = await res.json();
    assert.equal(body.requireActivatedParent, false);
    assert.equal(body.updatedBy.name, 'Dhruv');
  });

  test('anything but true or false is refused', async () => {
    accountIs('admin', { superAdmin: true });
    const write = mock.method(OrderingSettings, 'findOneAndUpdate', () => queryFor(null));

    const res = await asAdmin('/api/admin/settings/ordering', {
      method: 'PUT',
      body: JSON.stringify({ requireActivatedParent: 'no' }),
    });
    assert.equal(res.status, 400);
    assert.equal(write.mock.callCount(), 0);
  });

  test('a plain admin can neither read nor change it', async () => {
    accountIs('admin', { superAdmin: false });
    const write = mock.method(OrderingSettings, 'findOneAndUpdate', () => queryFor(null));

    assert.equal((await asAdmin('/api/admin/settings/ordering')).status, 403);
    const res = await asAdmin('/api/admin/settings/ordering', {
      method: 'PUT',
      body: JSON.stringify({ requireActivatedParent: false }),
    });
    assert.equal(res.status, 403);
    assert.equal(write.mock.callCount(), 0);
  });

  test('a parent token is turned away', async () => {
    const res = await fetch(base + '/api/admin/settings/ordering', {
      headers: { Authorization: `Bearer ${signParentToken('507f1f77bcf86cd799439099')}` },
    });
    assert.ok([401, 403].includes(res.status));
  });
});
