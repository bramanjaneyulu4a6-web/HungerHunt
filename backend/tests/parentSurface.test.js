// The parent-facing endpoints, at the points where they were sending more than
// the app reads or accepting more than they should.
//
// No database: every model call these routes make is stubbed, which is enough
// because what is under test is the shape of the response and the rules applied
// before any query runs.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// assertOwnsStudent looks the parent up by id to check the student is theirs.
const ownsTheStudent = () =>
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));

describe('the dashboard sends what the dashboard renders', () => {
  test('no transaction history rides along', async () => {
    mock.method(Parent, 'findById', () => ({
      populate: async () => ({
        _id: PARENT_ID,
        studentIds: [{ _id: STUDENT_ID, name: 'Child', pocketMoney: 500 }],
      }),
    }));

    const body = await (await get('/api/parent/dashboard')).json();

    assert.deepEqual(Object.keys(body), ['children']);
    assert.equal(body.children.length, 1);
  });

  test('only the fields the cards show are selected', async () => {
    let populateArg;

    mock.method(Parent, 'findById', () => ({
      populate: async (arg) => {
        populateArg = arg;
        return { studentIds: [] };
      },
    }));

    await get('/api/parent/dashboard');

    // rechargeHistory grows for as long as a child is enrolled and was being
    // sent on a screen that shows a balance.
    assert.equal(populateArg.select.includes('rechargeHistory'), false);
    assert.equal(populateArg.select.includes('pocketMoney'), true);
  });
});

describe('child history comes a page at a time', () => {
  const billQuery = (bills) => ({
    sort: () => ({ skip: () => ({ limit: async () => bills }) }),
  });

  test('the first page reports there is more to come', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 45);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills`)).json();

    assert.equal(body.total, 45);
    assert.equal(body.page, 1);
    assert.equal(body.hasMore, true);
  });

  test('the last page does not', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 21);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills?page=2`)).json();

    assert.equal(body.page, 2);
    assert.equal(body.hasMore, false);
  });

  test('a limit past the cap is clamped rather than honoured', async () => {
    ownsTheStudent();

    let asked;
    mock.method(Transaction, 'find', () => ({
      sort: () => ({ skip: () => ({ limit: async (n) => ((asked = n), []) }) }),
    }));
    mock.method(Transaction, 'countDocuments', async () => 5000);

    await get(`/api/parent/child/${STUDENT_ID}/bills?limit=100000`);

    assert.equal(asked, 100);
  });

  test('recharges come newest first', async () => {
    ownsTheStudent();
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        rechargeHistory: [{ amount: 1 }, { amount: 2 }, { amount: 3 }],
      }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    assert.deepEqual(
      body.recharges.map((r) => r.amount),
      [3, 2, 1]
    );
    assert.equal(body.total, 3);
    assert.equal(body.hasMore, false);
  });

  test('a student belonging to someone else is refused', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: ['507f191e810c19729de860ff'] }),
    }));

    const res = await get(`/api/parent/child/${STUDENT_ID}/bills`);

    assert.equal(res.status, 403);
  });
});

describe('registration holds passwords to the same rule as the reset', () => {
  test('a short password is refused before any lookup', async () => {
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '9876543210',
      email: 'parent@example.com',
      password: 'abc',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /at least 6/);
  });

  test('a missing password does not reach bcrypt', async () => {
    // bcrypt.hash(undefined) threw, and the parent saw a 500.
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '9876543210',
      email: 'parent@example.com',
    });

    assert.equal(res.status, 400);
  });

  test('a number that cannot match the school records is refused', async () => {
    const res = await post('/api/parent/register', {
      fatherName: 'Test Father',
      parentPhoneNumber: '+91 98765 43210',
      email: 'parent@example.com',
      password: 'longenough',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /10-digit/);
  });
});

describe('login does not say which phone numbers have accounts', () => {
  test('an unknown number and a wrong password read the same', async () => {
    mock.method(Parent, 'findOne', async () => null);

    const unknown = await post('/api/parent/login', {
      parentPhoneNumber: '9000000000',
      password: 'whatever',
    });

    mock.restoreAll();

    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('the-real-password', 4);
    mock.method(Parent, 'findOne', async () => ({ _id: PARENT_ID, password: hash }));

    const wrongPassword = await post('/api/parent/login', {
      parentPhoneNumber: '9876543210',
      password: 'not-the-real-password',
    });

    assert.equal(unknown.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.equal(
      (await unknown.json()).message,
      (await wrongPassword.json()).message
    );
  });
});
