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
  mrp: 12,
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
    // getProducts now joins the shelf onto every row; give it an empty one.
    mock.method(Inventory, 'find', () => ({ lean: async () => [] }));

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

// Nutrition is entered by hand from a packet, so it arrives incomplete far more
// often than not. Every field stands alone: what the office typed is stored and
// shown, and what it left blank stays blank rather than reading as zero.
describe('product nutrition', () => {
  test('stores the values given and leaves the untyped ones out', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', {
      ...NEW_PRODUCT,
      nutritionCalories: 280,
      nutritionProtein: 3.2,
      nutritionServing: 'Per 52g pack',
    });

    assert.equal(res.status, 201);
    assert.deepEqual(created.nutrition, {
      calories: 280,
      protein: 3.2,
      serving: 'Per 52g pack',
    });
  });

  test('a product with no nutrition at all is created without the field', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    assert.equal((await post('/api/products', NEW_PRODUCT)).status, 201);
    assert.equal('nutrition' in created, false);
  });

  // Zero fat is a fact about the product; blank is the absence of one. Storing
  // the first as the second would put a dash on the till where 0 g belongs.
  test('a typed zero is kept as zero, not dropped as absent', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, nutritionFat: 0 });

    assert.equal(res.status, 201);
    assert.deepEqual(created.nutrition, { fat: 0 });
  });

  test('a negative macro is refused, and nothing is created', async () => {
    accountIs('admin');
    const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

    const res = await post('/api/products', { ...NEW_PRODUCT, nutritionProtein: -1 });

    assert.equal(res.status, 400);
    assert.equal(create.mock.callCount(), 0);
  });

  test('a macro that is not a number is refused', async () => {
    accountIs('admin');
    const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

    const res = await post('/api/products', { ...NEW_PRODUCT, nutritionCarbs: 'about thirty' });

    assert.equal(res.status, 400);
    assert.equal(create.mock.callCount(), 0);
  });

  test('an edit names only the macros it carries, leaving the rest standing', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { nutritionCalories: 300 });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { 'nutrition.calories': 300 });
  });

  // The only way to take back a wrong number: clearing the box means clearing
  // the value, not leaving the old one because a blank looked like "unchanged".
  test('a blank box clears the value it stood for', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { nutritionFat: '' });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { 'nutrition.fat': null });
  });

  test('an unrelated edit does not touch the nutrition already stored', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { active: false });
  });

  test('a negative macro is refused on edit too', async () => {
    accountIs('admin');
    const update = mock.method(Product, 'findByIdAndUpdate', async (id, data) => ({ _id: id, ...data }));

    const res = await put(`/api/products/${PRODUCT_ID}`, { nutritionCalories: -5 });

    assert.equal(res.status, 400);
    assert.equal(update.mock.callCount(), 0);
  });
});

// The office types what the packet says and how much comes off it; the price
// the till charges is arithmetic, not a third thing to type. Sending it
// directly is refused rather than ignored, so a caller left on the old
// contract is told rather than silently having its price dropped.
describe('pricing a product from its MRP and discount', () => {
  test('derives the price the till charges from the MRP and the rate', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, mrp: 27, discountRate: 15 });

    assert.equal(res.status, 201);
    assert.equal(created.mrp, 27);
    assert.equal(created.discountRate, 15);
    assert.equal(created.price, 23);
  });

  test('an MRP with no rate given sells at the MRP', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, mrp: 40, discountRate: undefined });

    assert.equal(res.status, 201);
    assert.equal(created.discountRate, 0);
    assert.equal(created.price, 40);
  });

  for (const [label, body] of [
    ['no MRP', { mrp: undefined }],
    ['an MRP of zero', { mrp: 0 }],
    ['a negative MRP', { mrp: -5 }],
    ['a rate of 100', { discountRate: 100 }],
    ['a rate above 100', { discountRate: 250 }],
    ['a negative rate', { discountRate: -10 }],
    ['a rate that is not a number', { discountRate: 'half' }],
  ]) {
    test(`refuses ${label} on create, and nothing is created`, async () => {
      accountIs('admin');
      const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

      const res = await post('/api/products', { ...NEW_PRODUCT, ...body });

      assert.equal(res.status, 400);
      assert.equal(create.mock.callCount(), 0);
    });
  }

  test('refuses a price sent straight to create', async () => {
    accountIs('admin');
    const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

    const res = await post('/api/products', { ...NEW_PRODUCT, price: 5 });

    assert.equal(res.status, 400);
    assert.equal(create.mock.callCount(), 0);
  });

  test('a new rate alone reprices against the stored MRP', async () => {
    accountIs('admin');
    mock.method(Product, 'findById', async () => ({ _id: PRODUCT_ID, mrp: 27, discountRate: 0 }));
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { discountRate: 15 });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { discountRate: 15, price: 23 });
  });

  test('a new MRP alone reprices against the stored rate', async () => {
    accountIs('admin');
    mock.method(Product, 'findById', async () => ({ _id: PRODUCT_ID, mrp: 27, discountRate: 50 }));
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { mrp: 21 });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { mrp: 21, price: 11 });
  });

  // Legacy rows created before the field have no MRP. Discounting one has
  // nothing to compute against, so the office is asked for the MRP rather
  // than given a rate off an imagined figure.
  test('a rate on a product with no stored MRP is refused', async () => {
    accountIs('admin');
    mock.method(Product, 'findById', async () => ({ _id: PRODUCT_ID }));
    const update = mock.method(Product, 'findByIdAndUpdate', async (id, data) => ({ _id: id, ...data }));

    const res = await put(`/api/products/${PRODUCT_ID}`, { discountRate: 15 });

    assert.equal(res.status, 400);
    assert.equal(update.mock.callCount(), 0);
  });

  test('refuses a price sent straight to an edit', async () => {
    accountIs('admin');
    const update = mock.method(Product, 'findByIdAndUpdate', async (id, data) => ({ _id: id, ...data }));

    const res = await put(`/api/products/${PRODUCT_ID}`, { price: 5 });

    assert.equal(res.status, 400);
    assert.equal(update.mock.callCount(), 0);
  });

  test('an edit that mentions neither never reads the product to reprice it', async () => {
    accountIs('admin');
    const read = mock.method(Product, 'findById', async () => ({ _id: PRODUCT_ID, mrp: 27 }));
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { active: false });
    assert.equal(read.mock.callCount(), 0);
  });
});

// What is actually in the packet — 250 for a bottle whose unit is ml, 150 for
// a wrapper whose unit is g. Optional everywhere, because most of the
// catalogue predates the field and a product without one still sells.
describe('the size of the packet', () => {
  test('stores a size given on create', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, packSize: 250 });

    assert.equal(res.status, 201);
    assert.equal(created.packSize, 250);
  });

  // Absent must stay absent rather than becoming a zero: "nobody has recorded
  // the size" and "this packet contains nothing" are different statements, and
  // the kiosk prints the first as no line at all.
  test('creates without the field when no size is given', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', NEW_PRODUCT);

    assert.equal(res.status, 201);
    assert.ok(!('packSize' in created), 'packSize should be left off entirely');
  });

  test('a blank box on create is no size, not a zero', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (doc) => { created = doc; return { _id: PRODUCT_ID, ...doc }; });
    mock.method(Inventory, 'create', async (doc) => doc);

    const res = await post('/api/products', { ...NEW_PRODUCT, packSize: '' });

    assert.equal(res.status, 201);
    assert.ok(!('packSize' in created), 'a blank box should record nothing');
  });

  for (const [label, size] of [['zero', 0], ['a negative size', -5], ['words', 'big']]) {
    test(`refuses ${label} on create`, async () => {
      accountIs('admin');
      const create = mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));

      const res = await post('/api/products', { ...NEW_PRODUCT, packSize: size });

      assert.equal(res.status, 400);
      assert.equal(create.mock.callCount(), 0);
    });
  }

  test('a size can be added to a product that had none', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { packSize: 150 });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { packSize: 150 });
  });

  // Explicit null, not undefined: Mongoose drops undefined from an update, so
  // an emptied box would otherwise leave the old figure sitting there.
  test('an emptied box clears the size rather than leaving the old one', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { packSize: '' });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { packSize: null });
  });

  test('refuses a size of zero on edit', async () => {
    accountIs('admin');
    const update = mock.method(Product, 'findByIdAndUpdate', async (id, data) => ({ _id: id, ...data }));

    const res = await put(`/api/products/${PRODUCT_ID}`, { packSize: 0 });

    assert.equal(res.status, 400);
    assert.equal(update.mock.callCount(), 0);
  });

  test('an edit that never mentions the size leaves it alone', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { active: false });
  });
});
