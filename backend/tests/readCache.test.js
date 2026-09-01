import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { readCache } = await import('../middleware/readCache.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const asWarehouse = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('warehouse')
      ? { _id: STAFF_ID }
      : null;
  });
};

const shelf = () =>
  mock.method(Inventory, 'find', () => ({
    populate: async () => [
      {
        productId: { name: 'Apple Juice', active: true },
        stock: 5,
        toObject() {
          return { productId: this.productId, stock: this.stock };
        },
      },
    ],
  }));

// Minimal req/res doubles for unit-testing the middleware itself.
const makeReq = (overrides = {}) => ({ method: 'GET', originalUrl: '/api/inventory', ...overrides });
const makeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    type() { return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = JSON.stringify(body); return this; },
  };
  return res;
};

describe('readCache unit behaviour', () => {
  test('a stable revision serves the second read from memory', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    let handled = 0;
    const first = makeRes();
    middleware(makeReq(), first, () => { handled += 1; first.json([{ name: 'Apple Juice' }]); });

    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; });

    assert.equal(handled, 1);
    assert.equal(second.headers['X-Read-Cache'], 'hit');
    assert.equal(second.body, JSON.stringify([{ name: 'Apple Juice' }]));
    assert.match(second.headers['Cache-Control'], /max-age=30/);
    assert.match(second.headers['Cache-Control'], /stale-while-revalidate=60/);
  });

  test('a bumped revision throws the entry away', () => {
    let revision = 1;
    const middleware = readCache({ revisionSource: () => revision });

    let handled = 0;
    const first = makeRes();
    middleware(makeReq(), first, () => { handled += 1; first.json(['old']); });

    revision = 2;
    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; second.json(['new']); });

    assert.equal(handled, 2);
    assert.equal(second.body, JSON.stringify(['new']));
  });

  test('a student request is never cached and never served from cache', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    // Prime the cache with a staff read of the same URL.
    const staffRes = makeRes();
    middleware(makeReq(), staffRes, () => staffRes.json(['staff view']));

    let handled = 0;
    const studentRes = makeRes();
    middleware(makeReq({ student: { id: 'someone' } }), studentRes, () => { handled += 1; });

    assert.equal(handled, 1);
    assert.equal(studentRes.headers['X-Read-Cache'], undefined);
    assert.equal(studentRes.headers['Cache-Control'], undefined);
  });

  test('an error response is not stored', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    const first = makeRes();
    middleware(makeReq(), first, () => { first.statusCode = 500; first.json({ error: 'boom' }); });

    let handled = 0;
    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; second.json(['fine now']); });

    assert.equal(handled, 1);
    assert.equal(second.body, JSON.stringify(['fine now']));
  });
});

/* The map has to stay small on its own. Its only invalidation signal is the
   revision counter and its key is a URL, so an authenticated client that
   varies the query string would otherwise leave a dead entry behind for every
   read it ever made. */
describe('readCache keeps its map bounded', () => {
  test('a bumped revision drops the entries it invalidated, not just the one being read', () => {
    let revision = 1;
    const middleware = readCache({ revisionSource: () => revision });

    const primed = makeRes();
    middleware(makeReq({ originalUrl: '/api/products' }), primed, () => primed.json(['old']));

    // A read of some *other* URL is what notices the bump. The entry above is
    // never looked at again, so it has to be discarded on the way past.
    revision = 2;
    const other = makeRes();
    middleware(makeReq({ originalUrl: '/api/inventory' }), other, () => other.json(['fresh']));

    // Rewinding the counter is a test device: a removed entry and a merely
    // skipped one are indistinguishable while the revision only moves forward.
    revision = 1;
    let handled = 0;
    const again = makeRes();
    middleware(makeReq({ originalUrl: '/api/products' }), again, () => {
      handled += 1;
      again.json(['rebuilt']);
    });

    assert.equal(handled, 1, 'an entry from a superseded revision was still in the map');
    assert.equal(again.headers['X-Read-Cache'], undefined);
  });

  test('the map is emptied rather than grown past its cap', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    const read = (url) => {
      let handled = 0;
      const res = makeRes();
      middleware(makeReq({ originalUrl: url }), res, () => { handled += 1; res.json([url]); });
      return { handled, res };
    };

    for (let index = 0; index < 70; index += 1) read(`/api/inventory?page=${index}`);

    assert.equal(read('/api/inventory?page=0').handled, 1, 'the oldest entry outlived the cap');
    assert.equal(read('/api/inventory?page=69').res.headers['X-Read-Cache'], 'hit');
  });
});

describe('readCache wired onto the inventory route', () => {
  test('two staff reads hit the database once and carry Cache-Control', async () => {
    asWarehouse();
    const find = shelf();

    const headers = { Authorization: `Bearer ${warehouseToken}` };
    const first = await fetch(`${base}/api/inventory`, { headers });
    const second = await fetch(`${base}/api/inventory`, { headers });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(find.mock.callCount(), 1);
    assert.equal(second.headers.get('x-read-cache'), 'hit');
    assert.match(second.headers.get('cache-control'), /max-age=30/);
    assert.deepEqual(await second.json(), await first.json());
  });
});
