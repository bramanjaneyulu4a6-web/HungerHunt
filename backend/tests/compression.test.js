import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
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

// Forty rows pushes the JSON body well past compression's 1KB threshold.
const bigShelf = () =>
  mock.method(Inventory, 'find', () => ({
    populate: async () =>
      Array.from({ length: 40 }, (_, index) => ({
        productId: { name: `Product ${String(index).padStart(2, '0')}`, active: true },
        stock: 5,
        toObject() {
          return { productId: this.productId, stock: this.stock };
        },
      })),
  }));

describe('response compression', () => {
  test('a large JSON body is gzipped when the client accepts it', async () => {
    asWarehouse();
    bigShelf();

    const response = await fetch(`${base}/api/inventory`, {
      headers: {
        Authorization: `Bearer ${warehouseToken}`,
        'Accept-Encoding': 'gzip',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    // fetch decompresses transparently; the payload must survive the trip.
    const body = await response.json();
    assert.equal(body.length, 40);
  });
});
