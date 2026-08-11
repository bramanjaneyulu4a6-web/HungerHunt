// The kiosk's open front door: a session from an admission number, and the
// model fields that carry it. No database — model calls are stubbed.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

describe('the Student schema carries the kiosk fields', () => {
  test('admissionNumber is a unique, sparse, trimmed string', () => {
    const path = Student.schema.path('admissionNumber');
    assert.ok(path, 'admissionNumber must exist on the schema');
    assert.equal(path.instance, 'String');
    assert.equal(path.options.unique, true);
    assert.equal(
      path.options.sparse,
      true,
      'sparse: existing rows have no number and must not collide on null'
    );
    assert.equal(path.options.trim, true);
  });

  test('lockout fields default to unlocked', () => {
    const doc = new Student({});
    assert.equal(doc.purchaseCodeAttempts, 0);
    assert.equal(doc.purchaseCodeLockedUntil, null);
  });
});

const { signStudentToken, signAdminToken, verifyToken } = await import('../utils/tokens.js');
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;

const STUDENT_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f1f77bcf86cd799439012';

// Mongoose queries are thenable and chainable; the controllers await some
// directly and call .select()/.populate() on others.
const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  return query;
};

const asStudent = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${signStudentToken(STUDENT_ID, 'ADM-1042')}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

const asAdmin = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${signAdminToken(ADMIN_ID)}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

const stubInventory = () => mock.method(Inventory, 'find', () => queryFor([]));

describe('the till read gate takes a student session or staff', () => {
  test('a live student token is let through', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    stubInventory();

    const res = await asStudent('/api/inventory');
    assert.equal(res.status, 200);
  });

  // The only thing that retires an unexpired token before its 450 seconds are
  // up, and the reason the gate pays for a lookup per request.
  test("a deleted student's unexpired token is refused", async () => {
    mock.method(Student, 'exists', async () => null);

    const res = await asStudent('/api/inventory');
    assert.equal(res.status, 401);
  });

  test('staff still read it — the console and the storeroom must not break', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubInventory();

    const res = await asAdmin('/api/inventory');
    assert.equal(res.status, 200);
  });

  test('no token is still no entry', async () => {
    const res = await fetch(base + '/api/inventory');
    assert.equal(res.status, 401);
  });
});

const postSession = (body) =>
  fetch(base + '/api/students/kiosk-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('opening a kiosk session', () => {
  const onRoll = {
    _id: STUDENT_ID,
    name: 'Asha Rao',
    admissionNumber: 'ADM-1042',
    pocketMoney: 350,
    requiresParentApproval: false,
    purchasePassword: 'some-bcrypt-hash',
    parentPhoneNumber: '9876543210',
    hostelNumber: 'H-4',
  };

  test('a known admission number gets a token and only what the screen needs', async () => {
    mock.method(Student, 'findOne', () => queryFor(onRoll));

    const res = await postSession({ admissionNumber: ' ADM-1042 ' });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.expiresInSeconds, 450);
    assert.deepEqual(body.student, {
      id: STUDENT_ID,
      name: 'Asha Rao',
      admissionNumber: 'ADM-1042',
      pocketMoney: 350,
      requiresParentApproval: false,
    });

    // The route is open, so what it returns is what anyone holding an
    // admission number can read. Nothing beyond the student's own ID card.
    const raw = JSON.stringify(body.student);
    assert.equal(raw.includes('9876543210'), false, 'the parent phone must not ride along');
    assert.equal(raw.includes('H-4'), false, 'nor the hostel');
    assert.equal(raw.includes('bcrypt'), false, 'nor anything of the code');
  });

  test('the token it hands back is a session for that student', async () => {
    mock.method(Student, 'findOne', () => queryFor(onRoll));

    const { token } = await (await postSession({ admissionNumber: 'ADM-1042' })).json();
    const payload = verifyToken(token, 'student');

    assert.equal(payload?.id, STUDENT_ID);
    assert.equal(payload?.admissionNumber, 'ADM-1042');
  });

  test('an unknown admission number is refused', async () => {
    mock.method(Student, 'findOne', () => queryFor(null));

    const res = await postSession({ admissionNumber: 'ADM-9999' });
    assert.equal(res.status, 404);
  });

  // Turned away at the door rather than after a cart they cannot pay for.
  test('a student with no purchase code cannot open a session', async () => {
    mock.method(Student, 'findOne', () => queryFor({ ...onRoll, purchasePassword: null }));

    const res = await postSession({ admissionNumber: 'ADM-1042' });
    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /purchase code/i);
  });

  test('a missing admission number is answered without a query', async () => {
    const findOne = mock.method(Student, 'findOne', () => queryFor(null));

    const res = await postSession({});
    assert.equal(res.status, 400);
    assert.equal(findOne.mock.callCount(), 0);
  });
});
