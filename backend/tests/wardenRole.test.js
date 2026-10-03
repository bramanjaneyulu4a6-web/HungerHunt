import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const WARDEN_ID = '507f1f77bcf86cd799439011';
const CARETAKER_A = '507f1f77bcf86cd799439012';
const CARETAKER_B = '507f1f77bcf86cd799439013';
const ROOM_A = '507f191e810c19729de860e1';
const ROOM_B = '507f191e810c19729de860e2';
const ROOM_C = '507f191e810c19729de860e3';
const OUTSIDE_ROOM = '507f191e810c19729de860e9';
const token = signStaffToken(WARDEN_ID, 'warden');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const request = () => fetch(`${base}/api/pending-orders/caretaker`, {
  headers: { Authorization: `Bearer ${token}` },
});

const wardenAccount = () => mock.method(Admin, 'findById', () => ({
  select() { return this; },
  lean: async () => ({
    _id: WARDEN_ID,
    role: 'warden',
    caretakerIds: [CARETAKER_A, CARETAKER_B],
  }),
}));

test('a warden receives the live union of assigned caretaker rooms', async () => {
  mock.method(Admin, 'exists', async () => ({ _id: WARDEN_ID }));
  wardenAccount();
  mock.method(Admin, 'find', () => ({
    select() { return this; },
    lean: async () => [
      { _id: CARETAKER_A, role: 'caretaker', active: true, roomIds: [ROOM_A, ROOM_B] },
      { _id: CARETAKER_B, role: 'caretaker', active: true, roomIds: [ROOM_B, ROOM_C] },
    ],
  }));

  let studentFilter;
  mock.method(Student, 'find', (filter) => {
    studentFilter = filter;
    return {
      select() { return this; },
      lean: async () => [],
    };
  });

  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { count: 0, orders: [] });
  assert.deepEqual(studentFilter.roomId.$in, [ROOM_A, ROOM_B, ROOM_C]);
  assert.equal(studentFilter.roomId.$in.includes(OUTSIDE_ROOM), false);
});

test('a broken caretaker assignment refuses the warden before any student data is read', async () => {
  mock.method(Admin, 'exists', async () => ({ _id: WARDEN_ID }));
  wardenAccount();
  mock.method(Admin, 'find', () => ({
    select() { return this; },
    // Only one of the two assigned caretaker accounts remains active.
    lean: async () => [
      { _id: CARETAKER_A, role: 'caretaker', active: true, roomIds: [ROOM_A] },
    ],
  }));
  const students = mock.method(Student, 'find', () => { throw new Error('must not read students'); });

  const response = await request();
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'AUTH_REQUIRED');
  assert.equal(students.mock.callCount(), 0);
});

test('a warden cannot access warehouse-only routes', async () => {
  const response = await fetch(`${base}/api/inventory/alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 403);
});
