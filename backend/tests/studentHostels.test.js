import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Hostel = (await import('../models/Hostel.js')).default;
const Student = (await import('../models/Student.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);
const STAFF_ID = '507f1f77bcf86cd799439011';
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

test('caretaker accounts require a hostel and other roles reject one', () => {
  const profile = { name: 'Asha Rao', phone: '9876543210' };
  assert.match(new Admin({ ...profile, email: 'c@example.com', password: 'password', role: 'caretaker' })
    .validateSync().errors.hostelId.message, /hostel is required/i);
  assert.match(new Admin({
    ...profile, email: 'a@example.com', password: 'password', role: 'admin', hostelId: '507f191e810c19729de860e1',
  }).validateSync().errors.hostelId.message, /not allowed/i);
});

test('every staff role requires a name and phone number', () => {
  for (const role of ['admin', 'warehouse', 'caretaker']) {
    const account = new Admin({
      email: `${role}@example.com`, password: 'password', role,
      ...(role === 'caretaker' ? { hostelId: '507f191e810c19729de860e1' } : {}),
    });
    const errors = account.validateSync().errors;
    assert.match(errors.name.message, /required/i);
    assert.match(errors.phone.message, /required/i);
  }
});

test('caretaker registration is blocked until the hostel backfill is complete', async () => {
  authenticate();
  mock.method(Admin, 'countDocuments', async (filter) => filter?.role === 'caretaker' ? 0 : 1);
  mock.method(Hostel, 'findOne', async () => ({ _id: '507f191e810c19729de860e1', active: true }));
  mock.method(Student, 'exists', async () => ({ _id: '507f191e810c19729de860e2' }));
  mock.method(FulfillmentOrder, 'exists', async () => null);

  const response = await post('/api/admin/register', {
    name: 'Asha Rao', phone: '9876543210',
    email: 'caretaker@example.com', password: 'longenough1', role: 'caretaker',
    hostelId: '507f191e810c19729de860e1',
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /backfill/i);
});

test('a student write refuses an unknown hostel rather than inventing one', async () => {
  authenticate();
  mock.method(Hostel, 'findOne', () => ({ lean: async () => null }));
  const create = mock.method(Student, 'create', async () => { throw new Error('must not create'); });

  const response = await post('/api/students', {
    name: 'Asha', fatherName: 'Dev', hostelNumber: 'd-404', grade: '7', parentPhoneNumber: '9000000001',
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /D-404/);
  assert.equal(create.mock.callCount(), 0);
});

test('bulk import lists every unknown normalized hostel code', async () => {
  authenticate();
  mock.method(Hostel, 'find', () => ({ lean: async () => [{ _id: '507f191e810c19729de860e1', code: 'D-4' }] }));
  const insert = mock.method(Student, 'insertMany', async () => { throw new Error('must not insert'); });

  const student = { name: 'Asha', fatherName: 'Dev', grade: '7', parentPhoneNumber: '9000000001' };
  const response = await post('/api/students/bulk', {
    students: [{ ...student, hostelNumber: 'D-4' }, { ...student, name: 'Ben', hostelNumber: ' e-9 ' }],
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.deepEqual(body.unknownHostels, ['E-9']);
  assert.equal(insert.mock.callCount(), 0);
});

test('renaming a hostel refreshes every student display copy', async () => {
  authenticate();
  const id = '507f191e810c19729de860e1';
  mock.method(Hostel, 'findById', async () => ({ _id: id, code: 'D-4', active: true }));
  mock.method(Hostel, 'findByIdAndUpdate', async () => ({
    _id: id, code: 'E-4', name: '', active: true,
    toObject() { return { _id: id, code: 'E-4', name: '', active: true }; },
  }));
  let studentUpdate;
  mock.method(Student, 'updateMany', async (filter, update) => {
    studentUpdate = { filter, update };
    return { modifiedCount: 2 };
  });
  mock.method(Student, 'aggregate', async () => []);
  mock.method(Admin, 'aggregate', async () => []);

  const response = await put(`/api/hostels/${id}`, { code: ' e-4 ' });
  assert.equal(response.status, 200);
  assert.deepEqual(studentUpdate, {
    filter: { hostelId: id },
    update: { $set: { hostelNumber: 'E-4' } },
  });
});
