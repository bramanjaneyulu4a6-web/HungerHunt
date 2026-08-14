// The catalogue's honesty: a product is created together with its shelf, or
// not at all — both sale screens draw the menu from Inventory, so a product
// without a row is invisible to every buyer with no admin action to fix it.
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
const PRODUCT_ID = '507f191e810c19729de860ec';
const GROUP_ID = '507f191e810c19729de860e1';
const UNIT_ID = '507f191e810c19729de860e2';

const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const NEW_PRODUCT = {
  name: 'Samosa',
  stockGroup: GROUP_ID,
  subCategory: 'Savoury Snacks',
  unit: UNIT_ID,
  price: 12,
};

describe('creating a product', () => {
  test('creates its inventory row at stock 0 in the same request', async () => {
    accountIs('admin');
    mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));
    let shelf;
    mock.method(Inventory, 'create', async (doc) => { shelf = doc; return doc; });

    const res = await post('/api/products', NEW_PRODUCT);

    assert.equal(res.status, 201);
    assert.equal(String(shelf.productId), PRODUCT_ID);
    assert.equal(shelf.stock, 0);
  });

  test('stores a normalized sub-category and defaults legacy callers to Others', async () => {
    accountIs('admin');
    const created = [];
    mock.method(Product, 'create', async (doc) => {
      created.push(doc);
      return { _id: PRODUCT_ID, ...doc };
    });
    mock.method(Inventory, 'create', async (doc) => doc);

    assert.equal((await post('/api/products', { ...NEW_PRODUCT, subCategory: '  Chips   & Crisps ' })).status, 201);
    assert.equal((await post('/api/products', { ...NEW_PRODUCT, name: 'Plain item', subCategory: undefined })).status, 201);
    assert.equal(created[0].subCategory, 'Chips & Crisps');
    assert.equal(created[1].subCategory, 'Others');
  });

  test('a product whose shelf cannot be created is deleted again', async () => {
    accountIs('admin');
    mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));
    mock.method(Inventory, 'create', async () => { throw new Error('db down'); });
    let deleted;
    mock.method(Product, 'findByIdAndDelete', async (id) => { deleted = id; return {}; });

    const res = await post('/api/products', NEW_PRODUCT);

    assert.equal(res.status, 400);
    assert.equal(String(deleted), PRODUCT_ID);
  });

  // The admin screen makes reorder level required and sends it on every
  // create. Silently discarding it and falling back to the schema default
  // means the number on the table never matches what was typed.
  test('a supplied reorder level is stored, not discarded for the default', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, reorderLevel: 40 });

    assert.equal(res.status, 201);
    assert.equal(created.reorderLevel, 40);
  });

  test('a fractional reorder level is refused, and nothing is created', async () => {
    accountIs('admin');
    const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

    const res = await post('/api/products', { ...NEW_PRODUCT, reorderLevel: 2.5 });

    assert.equal(res.status, 400);
    assert.equal(create.mock.callCount(), 0);
  });
});

const put = (path, body) =>
  fetch(base + path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const del = (path) =>
  fetch(base + path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${adminToken}` } });

// Models Product.find(filter).collation(...).sort(...).populate(...).populate(...)
// — a chain that resolves to its fixed result when awaited.
const findChain = (result) => {
  const chain = {
    collation: () => chain,
    sort: () => chain,
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('the catalogue list', () => {
  test('hides archived products by default and shows them under ?all=1', async () => {
    accountIs('admin');
    const filters = [];
    mock.method(Product, 'find', (filter) => { filters.push(filter); return findChain([]); });

    assert.equal((await get('/api/products')).status, 200);
    assert.equal((await get('/api/products?all=1')).status, 200);

    assert.deepEqual(filters[0], { active: { $ne: false } });
    assert.deepEqual(filters[1], {});
  });
});

describe('updating a product', () => {
  test('an id that matches nothing is 404, not 200 null', async () => {
    accountIs('admin');
    mock.method(Product, 'findByIdAndUpdate', async () => null);
    const res = await put(`/api/products/${PRODUCT_ID}`, { name: 'Kachori' });
    assert.equal(res.status, 404);
  });

  test('garbage ids are 404 without touching the database', async () => {
    accountIs('admin');
    const res = await put('/api/products/not-an-id', { name: 'Kachori' });
    assert.equal(res.status, 404);
  });

  test('writes only the fields the body actually carries', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { active: false });
  });

  test('a fractional reorder level is refused', async () => {
    accountIs('admin');
    const res = await put(`/api/products/${PRODUCT_ID}`, { reorderLevel: 2.5 });
    assert.equal(res.status, 400);
  });

  test('a negative price is refused', async () => {
    accountIs('admin');
    const res = await put(`/api/products/${PRODUCT_ID}`, { price: -3 });
    assert.equal(res.status, 400);
  });

  test('normalizes a sub-category without overwriting unrelated fields', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { subCategory: '  Biscuits   & Cookies  ' });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { subCategory: 'Biscuits & Cookies' });
  });
});

describe('deleting a product', () => {
  test('the route is gone — archive is the only removal', async () => {
    accountIs('admin');
    const res = await del(`/api/products/${PRODUCT_ID}`);
    assert.equal(res.status, 404);
  });
});
