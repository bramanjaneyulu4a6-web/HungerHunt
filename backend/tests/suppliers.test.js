// Suppliers are a name the money remembers: purchase orders point at them
// forever, so they deactivate rather than delete, and only the back office
// may change them — the storeroom reads.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Supplier = (await import('../models/Supplier.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const SUPPLIER_ID = '507f191e810c19729de860ea';

const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Models the one account row the gate looks up. Shared with the other role
// tests so the two stay in lockstep if a gate's filter shape ever changes.
const accountIs = accountMatcher(Admin, STAFF_ID);

const send = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('reading suppliers', () => {
  test('the storeroom sees active suppliers only, by default', async () => {
    accountIs('warehouse');
    let asked;
    mock.method(Supplier, 'find', (filter) => {
      asked = filter;
      return { sort: async () => [] };
    });

    const res = await send('GET', '/api/suppliers', warehouseToken);

    assert.equal(res.status, 200);
    assert.deepEqual(asked, { active: true });
  });

  test('?all=1 includes the deactivated, for the back office ledger', async () => {
    accountIs('admin');
    let asked;
    mock.method(Supplier, 'find', (filter) => {
      asked = filter;
      return { sort: async () => [] };
    });

    await send('GET', '/api/suppliers?all=1', adminToken);

    assert.deepEqual(asked, {});
  });
});

describe('writing suppliers', () => {
  test('creating one is admin work', async () => {
    accountIs('warehouse');
    const res = await send('POST', '/api/suppliers', warehouseToken, { name: 'Fresh Farm Co' });
    assert.equal(res.status, 403);
  });

  test('an admin can create one', async () => {
    accountIs('admin');
    mock.method(Supplier, 'create', async (doc) => ({ _id: SUPPLIER_ID, ...doc }));

    const res = await send('POST', '/api/suppliers', adminToken, {
      name: '  Fresh Farm Co  ', phone: '9111111111', contactPerson: 'Ravi',
    });

    assert.equal(res.status, 201);
    assert.equal((await res.json()).name, 'Fresh Farm Co');
  });

  test('a nameless supplier is refused', async () => {
    accountIs('admin');
    const res = await send('POST', '/api/suppliers', adminToken, { phone: '9' });
    assert.equal(res.status, 400);
  });

  // Mongo's unique index trips before Mongoose validation ever runs, so its
  // message is collection internals — E11000, index name, dup key — not
  // something to put in front of whoever typed the name.
  test('a duplicate name is 409 with a message meant for a person', async () => {
    accountIs('admin');
    mock.method(Supplier, 'create', async () => {
      const err = new Error('E11000 duplicate key error collection: hungerhunt.suppliers index: name_1 dup key: { name: "Fresh Farm Co" }');
      err.code = 11000;
      throw err;
    });

    const res = await send('POST', '/api/suppliers', adminToken, { name: 'Fresh Farm Co' });
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.equal(body.message, 'A supplier with that name already exists.');
    assert.equal(body.error, undefined, 'the raw Mongo text must not reach the response');
  });

  test('renaming into a collision is 409 the same way', async () => {
    accountIs('admin');
    mock.method(Supplier, 'findByIdAndUpdate', async () => {
      const err = new Error('E11000 duplicate key error collection: hungerhunt.suppliers index: name_1 dup key: { name: "Fresh Farm Co" }');
      err.code = 11000;
      throw err;
    });

    const res = await send('PUT', `/api/suppliers/${SUPPLIER_ID}`, adminToken, { name: 'Fresh Farm Co' });
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.equal(body.message, 'A supplier with that name already exists.');
  });

  test('deactivating is the delete', async () => {
    accountIs('admin');
    mock.method(Supplier, 'findByIdAndUpdate', async (id, update) => ({
      _id: id, name: 'Fresh Farm Co', ...update.$set ?? update,
    }));

    const res = await send('PUT', `/api/suppliers/${SUPPLIER_ID}`, adminToken, { active: false });

    assert.equal(res.status, 200);
    assert.equal((await res.json()).active, false);
  });
});
