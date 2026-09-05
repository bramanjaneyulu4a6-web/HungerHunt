import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const Student = (await import('../models/Student.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);
const STAFF_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f191e810c19729de860e1';
const token = signStaffToken(STAFF_ID, 'admin');
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const authenticate = () => mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
const post = (path, body) => fetch(base + path, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const put = (path, body) => fetch(base + path, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('caretaker accounts require at least one room and other roles reject any', () => {
  const profile = { name: 'Asha Rao', phone: '9876543210' };
  assert.match(new Admin({ ...profile, email: 'c@example.com', password: 'password', role: 'caretaker' })
    .validateSync().errors.roomIds.message, /at least one room is required/i);
  assert.match(new Admin({
    ...profile, email: 'a@example.com', password: 'password', role: 'admin', roomIds: [ROOM_ID],
  }).validateSync().errors.roomIds.message, /not allowed/i);
});

test('every staff role requires a name and phone number', () => {
  for (const role of ['admin', 'warehouse', 'caretaker']) {
    const account = new Admin({
      email: `${role}@example.com`, password: 'password', role,
      ...(role === 'caretaker' ? { roomIds: [ROOM_ID] } : {}),
    });
    const errors = account.validateSync().errors;
    assert.match(errors.name.message, /required/i);
    assert.match(errors.phone.message, /required/i);
  }
});

test('caretaker registration is refused with no room at all', async () => {
  authenticate();
  mock.method(Admin, 'countDocuments', async (filter) => filter?.role === 'caretaker' ? 0 : 1);
  mock.method(Room, 'find', async () => []);
  const student = mock.method(Student, 'exists', async () => null);

  const response = await post('/api/admin/register', {
    name: 'Asha Rao', phone: '9876543210',
    email: 'caretaker@example.com', password: 'longenough1', role: 'caretaker',
    roomIds: [],
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /at least one active room/i);
  // Refused before the backfill question is even asked.
  assert.equal(student.mock.callCount(), 0);
});

test('caretaker registration is blocked until the room backfill is complete', async () => {
  authenticate();
  mock.method(Admin, 'countDocuments', async (filter) => filter?.role === 'caretaker' ? 0 : 1);
  mock.method(Room, 'find', async () => [{ _id: ROOM_ID, active: true }]);
  mock.method(Student, 'exists', async () => ({ _id: '507f191e810c19729de860e2' }));
  mock.method(FulfillmentOrder, 'exists', async () => null);

  const response = await post('/api/admin/register', {
    name: 'Asha Rao', phone: '9876543210',
    email: 'caretaker@example.com', password: 'longenough1', role: 'caretaker',
    roomIds: [ROOM_ID],
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /backfill/i);
});

test('a student write refuses an unknown room rather than inventing one', async () => {
  authenticate();
  mock.method(Room, 'findOne', () => ({ lean: async () => null }));
  const create = mock.method(Student, 'create', async () => { throw new Error('must not create'); });

  const response = await post('/api/students', {
    name: 'Asha', fatherName: 'Dev', roomNumber: 'd-404', grade: '7', parentPhoneNumber: '9000000001',
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /D-404/);
  assert.equal(create.mock.callCount(), 0);
});

test('bulk import lists every unknown normalized room code', async () => {
  authenticate();
  mock.method(Room, 'find', () => ({ lean: async () => [{ _id: ROOM_ID, code: 'D-4' }] }));
  mock.method(Student, 'find', () => ({ lean: async () => [] }));
  const insert = mock.method(Student, 'insertMany', async () => { throw new Error('must not insert'); });

  const student = { name: 'Asha', admissionNumber: '10425', fatherName: 'Dev', grade: '7', parentPhoneNumber: '9000000001' };
  const response = await post('/api/students/bulk', {
    students: [{ ...student, roomNumber: 'D-4' }, { ...student, name: 'Ben', admissionNumber: '10426', roomNumber: ' e-9 ' }],
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body.invalidCells, [{
    row: 3,
    column: 'roomNumber',
    cell: 'roomNumber (row 3)',
    message: 'Room E-9 does not exist or is inactive.',
  }]);
  assert.equal(insert.mock.callCount(), 0);
});

test('a room a caretaker still holds cannot be deactivated', async () => {
  authenticate();
  mock.method(Room, 'findById', async () => ({ _id: ROOM_ID, code: 'D-4', active: true }));
  mock.method(Student, 'countDocuments', async () => 0);
  const caretakerCount = mock.method(Admin, 'countDocuments', async () => 1);
  const update = mock.method(Room, 'findByIdAndUpdate', async () => { throw new Error('must not update'); });

  const response = await put(`/api/rooms/${ROOM_ID}`, { active: false });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /reassign this room's caretakers/i);
  assert.equal(update.mock.callCount(), 0);
  // Archived caretaker accounts must not hold a room hostage.
  assert.deepEqual(caretakerCount.mock.calls[0].arguments[0], {
    role: 'caretaker', active: { $ne: false }, roomIds: ROOM_ID,
  });
});

test('renaming a room refreshes every student display copy', async () => {
  authenticate();
  mock.method(Room, 'findById', async () => ({ _id: ROOM_ID, code: 'D-4', active: true }));
  mock.method(Room, 'findByIdAndUpdate', async () => ({
    _id: ROOM_ID, code: 'E-4', name: '', active: true,
    toObject() { return { _id: ROOM_ID, code: 'E-4', name: '', active: true }; },
  }));
  let studentUpdate;
  mock.method(Student, 'updateMany', async (filter, update) => {
    studentUpdate = { filter, update };
    return { modifiedCount: 2 };
  });
  mock.method(Student, 'aggregate', async () => []);
  mock.method(Admin, 'aggregate', async () => []);

  const response = await put(`/api/rooms/${ROOM_ID}`, { code: ' e-4 ' });
  assert.equal(response.status, 200);
  assert.deepEqual(studentUpdate, {
    filter: { roomId: ROOM_ID },
    update: { $set: { roomNumber: 'E-4' } },
  });
});
