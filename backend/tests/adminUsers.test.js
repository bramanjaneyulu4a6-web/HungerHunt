import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const Student = (await import('../models/Student.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f1f77bcf86cd799439012';
const STUDENT_ID = '507f191e810c19729de860ea';
const token = signAdminToken(ADMIN_ID);
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const authenticate = () => mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
const request = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
});

test('archived student search is paged, filtered, and sorted on the server', async () => {
  authenticate();
  let askedFilter;
  let askedSort;
  let skipped;
  let limited;
  mock.method(Student, 'find', (filter) => {
    askedFilter = filter;
    return {
      sort(value) { askedSort = value; return this; },
      skip(value) { skipped = value; return this; },
      async limit(value) {
        limited = value;
        return [{ _id: STUDENT_ID, name: 'Asha', active: false }];
      },
    };
  });
  mock.method(Student, 'countDocuments', async () => 121);

  const response = await request('/api/students?status=archived&page=3&limit=50&q=asha&sort=admissionNumber&direction=desc');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(askedFilter.active, false);
  assert.equal(askedFilter.$or.length, 5);
  assert.equal(askedFilter.$or[0].name.test('ASHA Rao'), true);
  assert.deepEqual(askedSort, { admissionNumber: -1, _id: 1 });
  assert.equal(skipped, 100);
  assert.equal(limited, 50);
  assert.deepEqual({ page: body.page, pages: body.pages, total: body.total }, { page: 3, pages: 3, total: 121 });
});

test('requiring password setup reactivates the parent and revokes existing sessions', async () => {
  authenticate();
  const account = {
    _id: PARENT_ID,
    fatherName: 'Dev Rao', phone: '9876543210', email: 'dev@example.com',
    studentIds: [STUDENT_ID], active: false, tokenVersion: 4,
    save: async function () { return this; },
  };
  mock.method(Parent, 'findById', async () => account);
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
  mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));

  const response = await request(`/api/admin/users/parents/${PARENT_ID}/require-password-setup`, { method: 'POST' });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.message, /password setup required/i);
  assert.equal(account.active, true);
  assert.equal(account.activationRequired, true);
  assert.equal(account.tokenVersion, 5);
  assert.equal(account.pushTokens.length, 0);
});

test('archiving a parent is recoverable and ends their sessions', async () => {
  authenticate();
  const account = {
    _id: PARENT_ID,
    fatherName: 'Dev Rao', phone: '9876543210', email: 'dev@example.com',
    studentIds: [STUDENT_ID], active: true, tokenVersion: 1,
    save: async function () { return this; },
  };
  mock.method(Parent, 'findById', async () => account);
  mock.method(Parent, 'exists', async () => null);
  mock.method(PendingOrder, 'exists', async () => null);
  mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));

  const response = await request(`/api/admin/users/parents/${PARENT_ID}`, { method: 'DELETE' });

  assert.equal(response.status, 200);
  assert.equal(account.active, false);
  assert.equal(account.tokenVersion, 2);
  assert.equal(String(account.archivedBy), ADMIN_ID);
});

test('archiving a parent from the console records that staff did it', async () => {
  authenticate();
  const saved = [];
  const account = {
    _id: PARENT_ID,
    fatherName: 'Dev Rao', phone: '9876543210', email: 'dev@example.com',
    studentIds: [], active: true, tokenVersion: 3,
    pushTokens: [{ token: 't', platform: 'android' }],
    save: async function () { saved.push(this); return this; },
  };
  mock.method(Parent, 'findById', async () => account);
  mock.method(Parent, 'exists', async () => null);
  mock.method(PendingOrder, 'exists', async () => null);
  mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));

  const response = await request(`/api/admin/users/parents/${PARENT_ID}`, { method: 'DELETE' });

  assert.equal(response.status, 200);
  assert.equal(saved[0].archivedReason, 'admin');
  assert.equal(saved[0].active, false);
  assert.equal(saved[0].tokenVersion, 4);
  assert.deepEqual(saved[0].pushTokens, []);
});

test('the final active admin cannot be demoted or deactivated', async () => {
  authenticate();
  const account = {
    _id: PARENT_ID, name: 'Only Admin', phone: '9876543210', email: 'admin@example.com',
    role: 'admin', active: true,
  };
  mock.method(Admin, 'findById', async () => account);
  mock.method(Admin, 'countDocuments', async () => 0);

  const demote = await request(`/api/admin/users/staff/${PARENT_ID}`, {
    method: 'PUT', body: JSON.stringify({ role: 'warehouse' }),
  });
  const deactivate = await request(`/api/admin/users/staff/${PARENT_ID}`, { method: 'DELETE' });

  assert.equal(demote.status, 409);
  assert.match((await demote.json()).message, /one active admin/i);
  assert.equal(deactivate.status, 409);
  assert.match((await deactivate.json()).message, /one active admin/i);
});

/* Staff updates.
 *
 * Rooms used to be demanded on every single update, which meant archiveStaff —
 * it sends nothing but { active: false } — could never archive a caretaker, and
 * a phone-only edit had to resend the whole room list to be accepted. */
const STAFF_ID = '507f1f77bcf86cd799439013';
const ROOM_ID = '507f191e810c19729de860e1';
const MISSING_ROOM_ID = '507f191e810c19729de860e9';
const PASSWORD_HASH = '$2a$10$YQiiz3n1z3n1z3n1z3n1zOmZ0m1qZ0m1qZ0m1qZ0m1qZ0m1qZ0m1q';

const caretakerAccount = (overrides = {}) => ({
  _id: STAFF_ID,
  name: 'Ravi Kumar',
  phone: '9876500011',
  email: 'ravi@example.com',
  password: PASSWORD_HASH,
  role: 'caretaker',
  active: true,
  roomIds: [ROOM_ID],
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  save: async function () { return this; },
  ...overrides,
});

/* Room.find is asked two different questions here: the validation path awaits
   the query, the response shaper projects and leans it. */
const mockRooms = (rooms) => mock.method(Room, 'find', (filter, projection) => (
  projection ? { lean: async () => rooms } : Promise.resolve(rooms)
));

test('archiving a caretaker succeeds and leaves their rooms intact', async () => {
  authenticate();
  const account = caretakerAccount();
  mock.method(Admin, 'findById', async () => account);
  mockRooms([{ _id: ROOM_ID, code: 'D-4', name: 'Block D' }]);

  const response = await request(`/api/admin/users/staff/${STAFF_ID}`, { method: 'DELETE' });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(account.active, false);
  assert.deepEqual(account.roomIds.map(String), [ROOM_ID]);
  assert.deepEqual(body.staff.rooms, [{ id: ROOM_ID, code: 'D-4', name: 'Block D' }]);
});

test('a caretaker phone-only edit does not have to resend the room list', async () => {
  authenticate();
  const account = caretakerAccount();
  mock.method(Admin, 'findById', async () => account);
  mockRooms([{ _id: ROOM_ID, code: 'D-4', name: 'Block D' }]);

  const response = await request(`/api/admin/users/staff/${STAFF_ID}`, {
    method: 'PUT', body: JSON.stringify({ phone: '9876500099' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(account.phone, '9876500099');
  assert.deepEqual(account.roomIds.map(String), [ROOM_ID]);
  assert.equal(body.staff.rooms.length, 1);
});

test('promoting a non-caretaker into the role still requires rooms', async () => {
  authenticate();
  // Nothing to inherit: non-caretaker accounts are held at zero rooms.
  const account = caretakerAccount({ role: 'warehouse', roomIds: [] });
  mock.method(Admin, 'findById', async () => account);
  mock.method(Admin, 'countDocuments', async () => 2);

  const response = await request(`/api/admin/users/staff/${STAFF_ID}`, {
    method: 'PUT', body: JSON.stringify({ role: 'caretaker' }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /at least one active room/i);
  assert.equal(account.role, 'warehouse');
});

test('an explicitly supplied room that is missing or inactive is still rejected', async () => {
  authenticate();
  const account = caretakerAccount();
  mock.method(Admin, 'findById', async () => account);
  mockRooms([]); // Room.find({ active: true }) matches nothing.

  const response = await request(`/api/admin/users/staff/${STAFF_ID}`, {
    method: 'PUT', body: JSON.stringify({ roomIds: [MISSING_ROOM_ID] }),
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /at least one active room/i);
  assert.deepEqual(account.roomIds.map(String), [ROOM_ID]);
});

/* The update endpoint answered with the raw Mongoose document, so every admin
   editing a staff account was handed that person's bcrypt hash. */
test('the staff update answer carries no password and matches the list shape', async () => {
  authenticate();
  const account = caretakerAccount();
  mock.method(Admin, 'findById', async () => account);
  mockRooms([{ _id: ROOM_ID, code: 'D-4', name: 'Block D' }]);
  mock.method(Admin, 'find', () => ({
    sort: () => ({ populate: () => ({ lean: async () => [{
      ...caretakerAccount({ phone: '9876500099' }),
      roomIds: [{ _id: ROOM_ID, code: 'D-4', name: 'Block D' }],
    }] }) }),
  }));

  const updated = await request(`/api/admin/users/staff/${STAFF_ID}`, {
    method: 'PUT', body: JSON.stringify({ phone: '9876500099' }),
  });
  const body = await updated.json();
  const [listed] = await (await request('/api/admin/users/staff')).json();

  assert.equal(updated.status, 200);
  assert.equal('password' in body.staff, false);
  assert.equal(JSON.stringify(body).includes(PASSWORD_HASH), false);
  assert.equal(JSON.stringify(body).includes('$2a$'), false);
  assert.deepEqual(Object.keys(body.staff).sort(), Object.keys(listed).sort());
  assert.deepEqual(body.staff, listed);
});

test('any invalid spreadsheet cell prevents the entire bulk insert', async () => {
  authenticate();
  mock.method(Room, 'find', () => ({ lean: async () => [{ _id: '507f191e810c19729de860eb', code: 'D-4' }] }));
  mock.method(Student, 'find', () => ({ lean: async () => [] }));
  const insert = mock.method(Student, 'insertMany', async () => []);

  const response = await request('/api/students/bulk', {
    method: 'POST',
    body: JSON.stringify({ students: [{
      name: 'Asha', admissionNumber: '10425', fatherName: 'Dev', roomNumber: 'D-4', grade: '8',
      parentPhoneNumber: 'bad', __importRow: 7,
      __importCells: { parentPhoneNumber: 'F7' },
    }] }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body.invalidCells.map((item) => item.cell), ['F7']);
  assert.equal(insert.mock.callCount(), 0);
});
