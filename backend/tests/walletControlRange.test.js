// The weekly spending cap a parent may set, and the range the route holds it
// to. The numbers are a school decision rather than a technical one, so they
// are pinned here: changing the range should be a deliberate edit to this
// test, not something discovered later.
//
// No database: the model calls are stubbed, since what is under test is the
// rule applied before any query runs.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;
let saved;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  saved = null;

  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));

  // assertOwnsStudent looks the parent up to check the student is theirs.
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));

  const row = {
    _id: STUDENT_ID,
    name: 'Child',
    walletControl: { enabled: false, limitAmount: 0, limitType: 'WEEKLY' },
    save: async () => {
      saved = row.walletControl;
      return row;
    },
  };

  mock.method(Student, 'findById', async () => row);
});

afterEach(() => mock.restoreAll());

const setLimit = (body) =>
  fetch(`${base}/api/parent/wallet-control/${STUDENT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
    body: JSON.stringify(body),
  });

describe('the weekly limit a parent may set runs from 30 to 300 rupees', () => {
  test('the smallest allowed limit is accepted', async () => {
    const response = await setLimit({ enabled: true, limitAmount: 30, limitType: 'WEEKLY' });

    assert.equal(response.status, 200);
    assert.equal(saved.limitAmount, 30);
  });

  test('the largest allowed limit is accepted', async () => {
    const response = await setLimit({ enabled: true, limitAmount: 300, limitType: 'WEEKLY' });

    assert.equal(response.status, 200);
    assert.equal(saved.limitAmount, 300);
  });

  test('a rupee under the floor is refused, and nothing is saved', async () => {
    const response = await setLimit({ enabled: true, limitAmount: 29, limitType: 'WEEKLY' });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /₹30 and ₹300/);
    assert.equal(saved, null);
  });

  test('a rupee over the ceiling is refused', async () => {
    const response = await setLimit({ enabled: true, limitAmount: 301, limitType: 'WEEKLY' });

    assert.equal(response.status, 400);
    assert.equal(saved, null);
  });

  test('turning the limit off does not have to carry an amount in range', async () => {
    // The range is a rule about a limit being applied. Switching the control
    // off is not setting one, and demanding ₹30 in order to turn it off would
    // be a strange thing to insist on.
    const response = await setLimit({ enabled: false, limitAmount: 0, limitType: 'WEEKLY' });

    assert.equal(response.status, 200);
    assert.equal(saved.enabled, false);
  });

  test('only a weekly limit is accepted, whatever the amount', async () => {
    const response = await setLimit({ enabled: true, limitAmount: 100, limitType: 'DAILY' });

    assert.equal(response.status, 400);
    assert.equal(saved, null);
  });
});
