// The super admin: an admin-role account that also holds isSuperAdmin. It alone
// may see and shape the staff roster, create accounts once the system is
// bootstrapped, and hand the flag to another admin. A plain admin keeps every
// other back-office surface it has today.
//
// The real app, routes and middleware run; only the model calls are stubbed.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FeatureVisibility = (await import('../models/FeatureVisibility.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ME = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const token = signAdminToken(ME);
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

const request = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
});

const adminRow = (overrides = {}) => ({
  _id: OTHER,
  name: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  role: 'admin',
  roomIds: [],
  active: true,
  isSuperAdmin: false,
  save: async function () { return this; },
  ...overrides,
});

const STAFF_ROUTES = [
  ['GET', '/api/admin/users/staff'],
  ['PUT', `/api/admin/users/staff/${OTHER}`],
  ['DELETE', `/api/admin/users/staff/${OTHER}`],
  ['POST', '/api/admin/register'],
];

describe('who reaches the staff roster', () => {
  for (const [method, path] of STAFF_ROUTES) {
    test(`${method} ${path} turns a plain admin away with 403, not a sign-out`, async () => {
      accountIs('admin');
      const res = await request(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
      assert.equal(res.status, 403, `${method} ${path} let a plain admin through`);
      const body = await res.json();
      assert.match(body.message, /super admin/i);
      assert.equal(body.code, undefined, 'a permission refusal must not sign the console out');
    });
  }

  test('a super admin reads the roster, and every row says whether it is one', async () => {
    accountIs('admin', { superAdmin: true });
    mock.method(Admin, 'find', () => ({
      sort() { return this; },
      populate() { return this; },
      lean: async () => [adminRow({ isSuperAdmin: true }), adminRow({ _id: ME, isSuperAdmin: false })],
    }));

    const res = await request('/api/admin/users/staff');
    assert.equal(res.status, 200);
    const rows = await res.json();
    assert.deepEqual(rows.map((row) => row.isSuperAdmin), [true, false]);
  });

  test('parents stay open to a plain admin', async () => {
    accountIs('admin');
    const Parent = (await import('../models/Parent.js')).default;
    mock.method(Parent, 'find', () => ({ sort() { return this; }, populate() { return this; }, lean: async () => [] }));
    const res = await request('/api/admin/users/parents');
    assert.equal(res.status, 200);
  });
});

describe('who is signed in', () => {
  test('GET /api/admin/me names the account and whether it is a super admin', async () => {
    accountIs('admin', { superAdmin: true });
    mock.method(Admin, 'findById', () => ({
      select() { return this; },
      lean: async () => ({ _id: ME, name: 'Dhruv', email: 'dhruv@example.com', phone: '9000000001', role: 'admin', isSuperAdmin: true }),
    }));

    const res = await request('/api/admin/me');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      id: ME, name: 'Dhruv', email: 'dhruv@example.com', phone: '9000000001', role: 'admin', isSuperAdmin: true,
      hiddenFeatures: [],
    });
  });

  test('a row that predates the flag reads as a plain admin', async () => {
    accountIs('admin');
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => null }));
    mock.method(Admin, 'findById', () => ({
      select() { return this; },
      lean: async () => ({ _id: ME, name: 'Old', email: 'old@example.com', phone: '9000000002' }),
    }));

    const body = await (await request('/api/admin/me')).json();
    assert.equal(body.role, 'admin');
    assert.equal(body.isSuperAdmin, false);
  });
});

describe('granting and revoking', () => {
  test('a super admin makes another admin a super admin', async () => {
    accountIs('admin', { superAdmin: true });
    const account = adminRow();
    mock.method(Admin, 'findById', async () => account);

    const res = await request(`/api/admin/users/staff/${OTHER}`, {
      method: 'PUT', body: JSON.stringify({ isSuperAdmin: true }),
    });
    assert.equal(res.status, 200);
    assert.equal(account.isSuperAdmin, true);
    assert.equal((await res.json()).staff.isSuperAdmin, true);
  });

  test('the flag is refused on a warehouse or caretaker account', async () => {
    accountIs('admin', { superAdmin: true });
    const account = adminRow({ role: 'warehouse', email: undefined });
    mock.method(Admin, 'findById', async () => account);

    const res = await request(`/api/admin/users/staff/${OTHER}`, {
      method: 'PUT', body: JSON.stringify({ isSuperAdmin: true }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /only an admin/i);
    assert.equal(account.isSuperAdmin, false);
  });

  test('moving a super admin out of the admin role drops the flag with it', async () => {
    accountIs('admin', { superAdmin: true });
    const account = adminRow({ isSuperAdmin: true });
    mock.method(Admin, 'findById', async () => account);
    mock.method(Admin, 'countDocuments', async () => 1);

    const res = await request(`/api/admin/users/staff/${OTHER}`, {
      method: 'PUT', body: JSON.stringify({ role: 'warehouse' }),
    });
    assert.equal(res.status, 200);
    assert.equal(account.role, 'warehouse');
    assert.equal(account.isSuperAdmin, false);
  });

  test('you cannot take super admin off the account you are using', async () => {
    accountIs('admin', { superAdmin: true });
    const account = adminRow({ _id: ME, isSuperAdmin: true });
    mock.method(Admin, 'findById', async () => account);

    const res = await request(`/api/admin/users/staff/${ME}`, {
      method: 'PUT', body: JSON.stringify({ isSuperAdmin: false }),
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /currently using/i);
    assert.equal(account.isSuperAdmin, true);
  });

  test('a super admin may hand the flag out at creation', async () => {
    accountIs('admin', { superAdmin: true });
    mock.method(Admin, 'findOne', async () => null);
    let saved;
    mock.method(Admin.prototype, 'save', async function () { saved = this; return this; });

    const res = await request('/api/admin/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dhruv', phone: '9876543219', email: 'dhruv@example.com', password: 'longenough1',
        role: 'admin', isSuperAdmin: true,
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(saved.isSuperAdmin, true);
  });

  test('the founding account is a super admin, whatever the form asked for', async () => {
    mock.method(Admin, 'exists', async () => null);
    mock.method(Admin, 'countDocuments', async () => 0);
    mock.method(Admin, 'findOne', async () => null);
    let saved;
    mock.method(Admin.prototype, 'save', async function () { saved = this; return this; });

    const res = await fetch(`${base}/api/admin/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'First', phone: '9876543218', email: 'first@example.com', password: 'longenough1',
        role: 'warehouse', isSuperAdmin: false,
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(saved.role, 'admin');
    assert.equal(saved.isSuperAdmin, true);
  });
});
