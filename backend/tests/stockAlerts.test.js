// Availability rides on every list the screens draw from, so no screen
// computes a threshold again — and the alerts endpoint is the persistent
// banner's source of truth, derived from live stock on every read.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Product = (await import('../models/Product.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const caretakerToken = signStaffToken(STAFF_ID, 'caretaker');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

const get = (path, token = adminToken) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });

// An inventory row the way getInventory's populate returns one.
const invRow = (id, name, stock, extra = {}) => ({
  _id: `row-${id}`,
  productId: { _id: id, name, reorderLevel: 5, active: true, ...extra },
  stock,
  toObject() {
    return { _id: this._id, productId: this.productId, stock: this.stock };
  },
});

const mockInventoryList = (rows) =>
  mock.method(Inventory, 'find', () => ({ populate: () => Promise.resolve(rows) }));

describe('availability on the list endpoints', () => {
  test('every inventory row carries a derived availability', async () => {
    accountIs('warehouse');
    mockInventoryList([
      invRow('p1', 'Frooti', 0),
      invRow('p2', 'Good Day', 3),
      invRow('p3', 'Lays', 20),
      invRow('p4', 'Old Bar', 0, { active: false }),
    ]);

    const res = await get('/api/inventory', warehouseToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    const byName = Object.fromEntries(body.map((r) => [r.productId.name, r.availability]));
    assert.deepEqual(byName, {
      Frooti: 'OUT_OF_STOCK',
      'Good Day': 'LOW',
      Lays: 'AVAILABLE',
      'Old Bar': 'ARCHIVED',
    });
  });

  test('every product row carries its shelf count and availability', async () => {
    accountIs('warehouse');
    const products = [
      { _id: 'p1', name: 'Frooti', reorderLevel: 5, active: true,
        toObject() { return { _id: 'p1', name: 'Frooti', reorderLevel: 5, active: true }; } },
      { _id: 'p9', name: 'Never Received', reorderLevel: 5, active: true,
        toObject() { return { _id: 'p9', name: 'Never Received', reorderLevel: 5, active: true }; } },
    ];
    const query = {
      collation() { return query; },
      sort() { return query; },
      populate() { return query; },
      then(resolve) { resolve(products); },
    };
    mock.method(Product, 'find', () => query);
    mock.method(Inventory, 'find', () => ({ lean: async () => [{ productId: 'p1', stock: 12 }] }));

    const res = await get('/api/products', warehouseToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    const frooti = body.find((p) => p._id === 'p1');
    const orphan = body.find((p) => p._id === 'p9');
    assert.equal(frooti.stock, 12);
    assert.equal(frooti.availability, 'AVAILABLE');
    assert.equal(orphan.stock, 0);
    assert.equal(orphan.availability, 'OUT_OF_STOCK');
  });
});
