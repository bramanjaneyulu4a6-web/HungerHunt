/* The kiosk's on/off switch. Off: the status route says so, a kiosk session
 * cannot start, and a student session cannot verify, bill or raise an order.
 * The admin console is never refused by it. Runs through the real app with
 * the model calls stubbed. */
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
// app.js loads backend/.env; pinned so only the tests below make a test account.
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { signAdminToken, signStudentToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ME = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const OFFLINE = 'Kiosk is currently offline. Please check again later.';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => {
  server.close(resolve);
  // Node's fetch keeps HTTP/1.1 connections alive. Close them after asking the
  // server to drain, or this test waits for the client pool's idle timeout.
  server.closeAllConnections?.();
}));
afterEach(() => {
  mock.restoreAll();
  process.env.PHONEPE_TEST_PARENT_PHONES = '';
});

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.session = () => query;
  query.lean = () => query;
  return query;
};

const settingsRow = (row) => mock.method(OrderingSettings, 'findOne', () => queryFor(row));

const post = (path, body, token) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

describe('the status route', () => {
  test('reads open when no settings row exists', async () => {
    settingsRow(null);
    const res = await fetch(base + '/api/students/kiosk-status');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { open: true });
  });

  test('reads offline, with the message to show, once switched off', async () => {
    settingsRow({ kioskEnabled: false });
    const res = await fetch(base + '/api/students/kiosk-status');
    assert.deepEqual(await res.json(), { open: false, message: OFFLINE, testSignIn: false });
  });
});

describe('with the kiosk off', () => {
  test('no kiosk session starts, and the student is never looked up', async () => {
    settingsRow({ kioskEnabled: false });
    const lookup = mock.method(Student, 'findOne', () => queryFor(null));

    const res = await post('/api/students/kiosk-session', { admissionNumber: 'ADM1042' });

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { code: 'KIOSK_OFFLINE', message: OFFLINE });
    assert.equal(lookup.mock.callCount(), 0);
  });

  test('a student session cannot verify, bill or raise an order', async () => {
    settingsRow({ kioskEnabled: false });
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    const token = signStudentToken(STUDENT_ID, 'ADM1042');

    for (const path of ['/api/transactions/verify-payment', '/api/transactions/bill', '/api/pending-orders']) {
      const res = await post(path, { items: [] }, token);
      assert.equal(res.status, 503, path);
      assert.equal((await res.json()).code, 'KIOSK_OFFLINE', path);
    }
  });

  test('the admin console is not the kiosk and is not refused', async () => {
    settingsRow({ kioskEnabled: false });
    accountMatcher(Admin, ME)('admin');

    const res = await post('/api/transactions/verify-payment', { items: [] }, signAdminToken(ME));

    assert.notEqual(res.status, 503);
  });
});

describe('the switch', () => {
  test('a super admin turns the kiosk off, and only that rule is written', async () => {
    accountMatcher(Admin, ME)('admin', { superAdmin: true });
    let change;
    mock.method(OrderingSettings, 'findOneAndUpdate', (filter, update) => {
      change = update.$set;
      return queryFor({ kioskEnabled: false, updatedAt: new Date(), updatedBy: { _id: ME, name: 'Dhruv' } });
    });

    const res = await fetch(base + '/api/admin/settings/ordering', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${signAdminToken(ME)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kioskEnabled: false }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(change).sort(), ['kioskEnabled', 'updatedBy']);
    assert.equal((await res.json()).kioskEnabled, false);
  });
});

describe('test-account students with the kiosk off', () => {
  const TEST_PHONE = '9000000021';
  const testStudent = { _id: STUDENT_ID, parentPhoneNumber: TEST_PHONE };

  test('the offline screen is told to offer a test sign-in', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
    settingsRow({ kioskEnabled: false });
    const res = await fetch(base + '/api/students/kiosk-status');
    assert.equal((await res.json()).testSignIn, true);
  });

  test('a tablet holding a test student session is told the kiosk is open', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
    settingsRow({ kioskEnabled: false });
    mock.method(Student, 'findById', () => queryFor(testStudent));

    const res = await fetch(base + '/api/students/kiosk-status', {
      headers: { Authorization: `Bearer ${signStudentToken(STUDENT_ID, '990001')}` },
    });
    assert.deepEqual(await res.json(), { open: true });
  });

  test('a real student session is still told it is offline', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
    settingsRow({ kioskEnabled: false });
    mock.method(Student, 'findById', () => queryFor({ _id: STUDENT_ID, parentPhoneNumber: '9876543210' }));

    const res = await fetch(base + '/api/students/kiosk-status', {
      headers: { Authorization: `Bearer ${signStudentToken(STUDENT_ID, 'ADM1042')}` },
    });
    assert.equal((await res.json()).open, false);
  });

  test('a test student may start a session; a real one may not', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
    settingsRow({ kioskEnabled: false });

    mock.method(Student, 'findOne', () => queryFor(testStudent));
    const allowed = await post('/api/students/kiosk-session', { admissionNumber: '990001' });
    assert.notEqual(allowed.status, 503);

    mock.restoreAll();
    settingsRow({ kioskEnabled: false });
    mock.method(Student, 'findOne', () => queryFor({ _id: STUDENT_ID, parentPhoneNumber: '9876543210' }));
    const refused = await post('/api/students/kiosk-session', { admissionNumber: 'ADM1042' });
    assert.equal(refused.status, 503);
  });

  test('a test student session may verify, bill and raise an order', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
    settingsRow({ kioskEnabled: false });
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'findById', () => queryFor(testStudent));
    const token = signStudentToken(STUDENT_ID, '990001');

    for (const path of ['/api/transactions/verify-payment', '/api/transactions/bill', '/api/pending-orders']) {
      const res = await post(path, { items: [] }, token);
      assert.notEqual(res.status, 503, path);
    }
  });
});
