import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const { loginAdmin } = await import('../controllers/adminController.js');

const STAFF_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f191e810c19729de860e1';
const SECOND_ROOM_ID = '507f191e810c19729de860e2';

afterEach(() => mock.restoreAll());

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

test('email is required only for administrators', () => {
  const warehouse = new Admin({
    name: 'Ravi Kumar', phone: '9876543211', password: 'password', role: 'warehouse',
  });
  assert.equal(warehouse.validateSync(), undefined);

  const caretaker = new Admin({
    name: 'Meera Nair', phone: '9876543212', password: 'password', role: 'caretaker',
    roomIds: [ROOM_ID],
  });
  assert.equal(caretaker.validateSync(), undefined);

  const admin = new Admin({
    name: 'Asha Rao', phone: '9876543213', password: 'password', role: 'admin',
  });
  assert.match(admin.validateSync().errors.email.message, /required/i);
});

/* The room validator reads `this.role`, which only binds correctly when
   mongoose runs it as a document validator — so it is exercised here against a
   real document rather than read off the schema. Both halves matter: a
   caretaker who holds no room can sign in to a queue that can never contain
   anything, and a warehouse account carrying rooms would silently widen a
   scope that is meant to be empty. */
test('a caretaker account cannot be saved with no rooms', () => {
  const account = new Admin({
    name: 'Meera Nair', phone: '9876543210',
    email: 'no.rooms@example.com', password: 'password', role: 'caretaker',
    roomIds: [],
  });
  const errors = account.validateSync().errors;
  assert.match(errors.roomIds.message, /at least one room/i);
});

test('a non-caretaker account cannot be saved with rooms', () => {
  for (const role of ['admin', 'warehouse']) {
    const account = new Admin({
      name: 'Ravi Kumar', phone: '9876543211',
      email: `${role}.rooms@example.com`, password: 'password', role,
      roomIds: [ROOM_ID],
    });
    const errors = account.validateSync().errors;
    assert.match(errors.roomIds.message, /not allowed for other roles/i);
  }
});

test('a caretaker holding rooms and a warehouse account holding none both validate', () => {
  const caretaker = new Admin({
    name: 'Meera Nair', phone: '9876543210',
    email: 'two.rooms@example.com', password: 'password', role: 'caretaker',
    roomIds: [ROOM_ID, SECOND_ROOM_ID],
  });
  assert.equal(caretaker.validateSync(), undefined);

  const warehouse = new Admin({
    name: 'Ravi Kumar', phone: '9876543211',
    email: 'store@example.com', password: 'password', role: 'warehouse',
  });
  assert.equal(warehouse.validateSync(), undefined);
});

test('caretaker login returns identity and every readable room', async () => {
  const password = 'caretaker-password';
  const hash = await bcrypt.hash(password, 4);
  let loginFilter;
  mock.method(Admin, 'findOne', async (filter) => {
    loginFilter = filter;
    return ({
    _id: STAFF_ID,
    name: 'Meera Nair',
    phone: '9876543210',
    email: 'd4.caretaker@example.com',
    password: hash,
    role: 'caretaker',
    roomIds: [ROOM_ID, SECOND_ROOM_ID],
    });
  });
  mock.method(Room, 'find', () => ({
    select: () => ({
      lean: async () => [
        { _id: ROOM_ID, code: 'D-4', name: 'East Residence' },
        { _id: SECOND_ROOM_ID, code: 'D-5', name: 'West Residence' },
      ],
    }),
  }));

  let status = 200;
  let body;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  await loginAdmin({ body: { phone: '9876543210', password } }, res);

  assert.equal(status, 200);
  assert.deepEqual(loginFilter, {
    phone: '9876543210',
    role: { $in: ['warehouse', 'caretaker'] },
  });
  const rooms = [
    { id: ROOM_ID, code: 'D-4', name: 'East Residence' },
    { id: SECOND_ROOM_ID, code: 'D-5', name: 'West Residence' },
  ];
  assert.deepEqual(body.staff, {
    name: 'Meera Nair',
    phone: '9876543210',
    email: 'd4.caretaker@example.com',
    role: 'caretaker',
    rooms,
  });
  assert.deepEqual(body.rooms, rooms);
  assert.equal(typeof body.token, 'string');
});

/* Rooms belong to caretakers and nobody else, so the key is absent rather than
   empty on every other login — the same shape the singular field had. */
test('a warehouse login carries no rooms key at all', async () => {
  const password = 'warehouse-password';
  const hash = await bcrypt.hash(password, 4);
  mock.method(Admin, 'findOne', async () => ({
    _id: STAFF_ID,
    name: 'Ravi Kumar',
    phone: '9876543211',
    password: hash,
    role: 'warehouse',
  }));
  mock.method(Room, 'find', () => { throw new Error('must not run'); });

  let status = 200;
  let body;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  await loginAdmin({ body: { phone: '9876543211', password } }, res);

  assert.equal(status, 200);
  assert.equal(body.staff.email, '');
  assert.equal(Object.hasOwn(body, 'rooms'), false);
  assert.equal(Object.hasOwn(body.staff, 'rooms'), false);
});

test('staff email is not accepted as a login identifier', async () => {
  const findOne = mock.method(Admin, 'findOne', async () => null);
  let status = 200;
  await loginAdmin({ body: { email: 'store@example.com', password: 'password' } }, {
    status(value) { status = value; return this; },
    json() { return this; },
  });
  assert.equal(status, 401);
  assert.equal(findOne.mock.callCount(), 1);
  assert.deepEqual(findOne.mock.calls[0].arguments[0], {
    email: 'store@example.com',
    $or: [{ role: 'admin' }, { role: { $exists: false } }],
  });
});
