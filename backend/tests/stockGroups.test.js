import test, { before, after, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Product = (await import('../models/Product.js')).default;
const StockGroup = (await import('../models/StockGroup.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const GROUP_ID = '507f191e810c19729de860e1';
const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;
let server;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

after(() => new Promise((resolve) => server.close(resolve)));

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);
const request = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

describe('stock group management', () => {
  test('returns groups in their saved display order', async () => {
    accountIs('admin');
    let sort;
    mock.method(StockGroup, 'find', () => ({
      sort: async (value) => {
        sort = value;
        return [];
      },
    }));

    const response = await request('/api/stock-groups');

    assert.equal(response.status, 200);
    assert.deepEqual(sort, { order: 1, name: 1 });
  });

  test('updates the order without clearing the group name', async () => {
    accountIs('admin');
    let update;
    mock.method(StockGroup, 'findByIdAndUpdate', async (id, value) => {
      update = value;
      return { _id: id, name: 'Snacks', ...value };
    });

    const response = await request(`/api/stock-groups/${GROUP_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ order: 2 }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(update, { order: 2 });
  });

  // The console sends the whole group back when tabs are dragged. Reordering
  // must still work, and the name must not travel with it — the category name
  // is what the admin unit map keys on, so a rename through this route would
  // leave the product form offering every unit for that category.
  test('ignores a name sent alongside the order', async () => {
    accountIs('admin');
    let update;
    mock.method(StockGroup, 'findByIdAndUpdate', async (id, value) => {
      update = value;
      return { _id: id, name: 'Snacks', ...value };
    });

    const response = await request(`/api/stock-groups/${GROUP_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ order: 2, name: 'Renamed' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(update, { order: 2 });
  });

  test('refuses to create a category', async () => {
    accountIs('admin');
    const create = mock.method(StockGroup, 'create', async () => ({}));

    const response = await request('/api/stock-groups', {
      method: 'POST',
      body: JSON.stringify({ name: 'Fireworks' }),
    });

    assert.equal(response.status, 405);
    assert.equal(create.mock.callCount(), 0);
  });

  // Sealed regardless of whether the category is empty. Removing one is a seed
  // change now, and a 409-when-in-use rule would imply the empty case works.
  test('refuses to remove a category even when nothing uses it', async () => {
    accountIs('admin');
    mock.method(Product, 'exists', async () => null);
    const remove = mock.method(StockGroup, 'findByIdAndDelete', async () => ({}));

    const response = await request(`/api/stock-groups/${GROUP_ID}`, {
      method: 'DELETE',
    });

    assert.equal(response.status, 405);
    assert.equal(remove.mock.callCount(), 0);
  });
});
