/* The measurement units became a fixed vocabulary when the admin console
   started filtering the product form's unit dropdown by category. A unit
   created through the API would match no category in that map, so the route
   that created it is sealed. */
import test, { before, after, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Unit = (await import('../models/Unit.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const UNIT_ID = '507f191e810c19729de860e1';
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

describe('measurement units', () => {
  test('still lists the seeded units', async () => {
    accountIs('admin');
    mock.method(Unit, 'find', async () => [{ _id: UNIT_ID, name: 'Gram', symbol: 'g' }]);

    const response = await request('/api/units');

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ _id: UNIT_ID, name: 'Gram', symbol: 'g' }]);
  });

  test('refuses to create a unit', async () => {
    accountIs('admin');
    const create = mock.method(Unit, 'create', async () => ({}));

    const response = await request('/api/units', {
      method: 'POST',
      body: JSON.stringify({ name: 'Furlong', symbol: 'fur' }),
    });

    assert.equal(response.status, 405);
    assert.equal(create.mock.callCount(), 0);
  });

  test('refuses to rename a unit', async () => {
    accountIs('admin');
    const update = mock.method(Unit, 'findByIdAndUpdate', async () => ({}));

    const response = await request(`/api/units/${UNIT_ID}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Grammes', symbol: 'g' }),
    });

    assert.equal(response.status, 405);
    assert.equal(update.mock.callCount(), 0);
  });

  // Products reference units by id forever, so a delete was already a way to
  // leave a catalogue row pointing at nothing.
  test('refuses to remove a unit', async () => {
    accountIs('admin');
    const remove = mock.method(Unit, 'findByIdAndDelete', async () => ({}));

    const response = await request(`/api/units/${UNIT_ID}`, { method: 'DELETE' });

    assert.equal(response.status, 405);
    assert.equal(remove.mock.callCount(), 0);
  });
});
