// Feature visibility: what a plain admin's console shows, decided per role and
// per account by the super admin. The catalogue arithmetic is tested on its
// own; the routes run through the real app with the model calls stubbed.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FeatureVisibility = (await import('../models/FeatureVisibility.js')).default;
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const { DEFAULT_HIDDEN, FEATURES, effectiveHidden, featuresForRole } = await import('../utils/featureCatalogue.js');
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

const lean = (value) => ({ sort() { return this; }, populate() { return this; }, select() { return this; }, lean: async () => value });

describe('the catalogue arithmetic', () => {
  test('a plain admin with nothing stored gets the built-in default', () => {
    assert.deepEqual(effectiveHidden({ role: 'admin' }), DEFAULT_HIDDEN.admin);
  });

  test('a super admin sees everything whatever is stored', () => {
    assert.deepEqual(effectiveHidden({ role: 'admin', isSuperAdmin: true, roleHidden: ['/billing'], overrides: { '/reports': 'hidden' } }), []);
  });

  test('a stored empty role list means nothing is hidden', () => {
    assert.deepEqual(effectiveHidden({ role: 'admin', roleHidden: [] }), []);
  });

  test('account overrides win over the role list in both directions', () => {
    const hidden = effectiveHidden({
      role: 'admin',
      roleHidden: ['/billing', '/reports'],
      overrides: { '/reports': 'shown', '/transactions': 'hidden', 'not.a.feature': 'hidden' },
    });
    assert.deepEqual(hidden, ['/billing', '/transactions']);
  });

  test('every default key is a real feature of its role', () => {
    for (const [role, hidden] of Object.entries(DEFAULT_HIDDEN)) {
      const keys = new Set(featuresForRole(role).map((feature) => feature.key));
      for (const key of hidden) assert.ok(keys.has(key), `${key} is not a ${role} feature`);
    }
  });

  test('the warehouse and caretaker roles hide nothing until told to', () => {
    assert.deepEqual(effectiveHidden({ role: 'warehouse' }), []);
    assert.deepEqual(effectiveHidden({ role: 'caretaker' }), []);
  });

  test('a role only ever receives its own features, even when handed another role\'s keys', () => {
    assert.deepEqual(
      effectiveHidden({ role: 'warehouse', roleHidden: ['/billing', 'wh:/records'], overrides: { 'caretaker.reports': 'hidden' } }),
      ['wh:/records'],
    );
  });

  test('every feature names at least one role', () => {
    for (const feature of FEATURES) assert.ok(feature.roles?.length, `${feature.key} has no role`);
  });
});

describe('the warehouse app asks the same question', () => {
  const WAREHOUSE_ID = '507f1f77bcf86cd799439021';
  const CARETAKER_ID = '507f1f77bcf86cd799439022';
  const ROOM_ID = '507f191e810c19729de860ea';

  test('a warehouse account reads its name and hidden set', async () => {
    mock.method(Admin, 'exists', async (filter) => (String(filter._id) === WAREHOUSE_ID ? { _id: WAREHOUSE_ID } : null));
    mock.method(Admin, 'findById', () => lean({
      _id: WAREHOUSE_ID, name: 'Store', phone: '9876543211', role: 'warehouse', featureOverrides: [{ key: 'wh:/records', value: 'hidden' }],
    }));
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => ({ role: 'warehouse', hidden: ['warehouse.printOrders'] }) }));

    const res = await fetch(`${base}/api/admin/me`, { headers: { Authorization: `Bearer ${signStaffToken(WAREHOUSE_ID, 'warehouse')}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.role, 'warehouse');
    assert.equal(body.isSuperAdmin, false);
    assert.deepEqual(body.hiddenFeatures, ['wh:/records', 'warehouse.printOrders']);
  });

  test('a caretaker account reads its hidden set too', async () => {
    mock.method(Admin, 'exists', async (filter) => (String(filter._id) === CARETAKER_ID ? { _id: CARETAKER_ID } : null));
    // staffGate reads the caretaker's rooms, then currentStaff reads the row.
    mock.method(Admin, 'findById', () => lean({
      _id: CARETAKER_ID, name: 'Meera', phone: '9876543212', email: 'meera@example.com', role: 'caretaker', roomIds: [ROOM_ID],
    }));
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => ({ role: 'caretaker', hidden: ['caretaker.history'] }) }));

    const res = await fetch(`${base}/api/admin/me`, { headers: { Authorization: `Bearer ${signStaffToken(CARETAKER_ID, 'caretaker')}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.role, 'caretaker');
    assert.deepEqual(body.hiddenFeatures, ['caretaker.history']);
  });

  test('a warehouse account still cannot change anything', async () => {
    mock.method(Admin, 'exists', async (filter) => (String(filter._id) === WAREHOUSE_ID ? { _id: WAREHOUSE_ID } : null));
    const res = await fetch(`${base}/api/admin/features`, { headers: { Authorization: `Bearer ${signStaffToken(WAREHOUSE_ID, 'warehouse')}` } });
    assert.equal(res.status, 403);
  });
});

describe('who may change it', () => {
  for (const [method, path, body] of [
    ['GET', '/api/admin/features'],
    ['PUT', '/api/admin/features/roles/admin', '{"hidden":[]}'],
    ['PUT', `/api/admin/features/accounts/${OTHER}`, '{"overrides":{}}'],
  ]) {
    test(`${method} ${path} is closed to a plain admin`, async () => {
      accountIs('admin');
      const res = await request(path, { method, body });
      assert.equal(res.status, 403);
      assert.match((await res.json()).message, /super admin/i);
    });
  }
});

describe('the panel', () => {
  test('lists the catalogue, each role\'s current list and every account with its exceptions', async () => {
    accountIs('admin', { superAdmin: true });
    mock.method(FeatureVisibility, 'find', () => lean([{ role: 'admin', hidden: ['/billing'] }]));
    mock.method(Admin, 'find', () => lean([
      { _id: OTHER, name: 'Asha', email: 'asha@example.com', phone: '9876543210', role: 'admin', featureOverrides: [{ key: '/reports', value: 'shown' }] },
    ]));

    const res = await request('/api/admin/features');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.features.length, FEATURES.length);
    assert.deepEqual(body.roles.admin, { hidden: ['/billing'], stored: true });
    assert.deepEqual(body.roles.warehouse, { hidden: [], stored: false });
    assert.deepEqual(body.accounts[0].overrides, { '/reports': 'shown' });
  });

  test('saves a role list, refusing unknown keys', async () => {
    accountIs('admin', { superAdmin: true });
    let written;
    mock.method(FeatureVisibility, 'findOneAndUpdate', (filter, update) => {
      written = { filter, update };
      return { lean: async () => ({ role: 'admin', hidden: update.$set.hidden }) };
    });

    const bad = await request('/api/admin/features/roles/admin', { method: 'PUT', body: JSON.stringify({ hidden: ['/nope'] }) });
    assert.equal(bad.status, 400);
    assert.equal(written, undefined);

    const res = await request('/api/admin/features/roles/admin', {
      method: 'PUT', body: JSON.stringify({ hidden: ['/billing', '/billing', '/reports'] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(written.update.$set.hidden, ['/billing', '/reports']);
    assert.equal(String(written.update.$set.updatedBy), ME);

    const unknownRole = await request('/api/admin/features/roles/cashier', { method: 'PUT', body: '{"hidden":[]}' });
    assert.equal(unknownRole.status, 404);
  });

  test('merges account exceptions and answers with the effective set', async () => {
    accountIs('admin', { superAdmin: true });
    const account = {
      _id: OTHER, name: 'Asha', email: 'asha@example.com', phone: '9876543210', role: 'admin',
      featureOverrides: [{ key: '/billing', value: 'shown' }],
      save: async function () { return this; },
    };
    mock.method(Admin, 'findById', async () => account);
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => null }));

    const res = await request(`/api/admin/features/accounts/${OTHER}`, {
      method: 'PUT',
      body: JSON.stringify({ overrides: { '/transactions': 'hidden', 'students.purchaseCode': 'hidden', '/billing': null } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Stored as a list so keys with dots survive Mongo's map-key rule.
    assert.deepEqual(account.featureOverrides, [
      { key: '/transactions', value: 'hidden' },
      { key: 'students.purchaseCode', value: 'hidden' },
    ]);
    assert.ok(body.hiddenFeatures.includes('/billing'), 'clearing the exception falls back to the role default');
    assert.ok(body.hiddenFeatures.includes('/transactions'));
    assert.ok(body.hiddenFeatures.includes('students.purchaseCode'));

    const bad = await request(`/api/admin/features/accounts/${OTHER}`, {
      method: 'PUT', body: JSON.stringify({ overrides: { '/billing': 'maybe' } }),
    });
    assert.equal(bad.status, 400);
  });
});

describe('what the console is told', () => {
  test('GET /api/admin/me carries the effective hidden set for a plain admin', async () => {
    accountIs('admin');
    mock.method(Admin, 'findById', () => lean({
      _id: ME, name: 'Asha', email: 'asha@example.com', phone: '9876543210', role: 'admin',
      featureOverrides: [{ key: '/billing', value: 'shown' }],
    }));
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => null }));

    const body = await (await request('/api/admin/me')).json();
    assert.equal(body.isSuperAdmin, false);
    assert.ok(!body.hiddenFeatures.includes('/billing'));
    assert.ok(body.hiddenFeatures.includes('/reports'));
  });

  test('and an empty one for a super admin', async () => {
    accountIs('admin', { superAdmin: true });
    mock.method(Admin, 'findById', () => lean({
      _id: ME, name: 'Dhruv', email: 'dhruv@example.com', phone: '9000000001', role: 'admin', isSuperAdmin: true,
    }));
    mock.method(FeatureVisibility, 'findOne', () => ({ lean: async () => ({ role: 'admin', hidden: ['/billing'] }) }));

    const body = await (await request('/api/admin/me')).json();
    assert.deepEqual(body.hiddenFeatures, []);
  });
});
