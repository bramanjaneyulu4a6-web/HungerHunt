// "Notify Parent via WhatsApp" counts once per order. The kiosk's student and
// the room caretaker share one record, so whoever taps first locks the button
// for everyone else. No database: every model call is stubbed.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const { signParentToken, signStaffToken, signStudentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const CARETAKER_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const ORDER_ID = '507f191e810c19729de860ed';
const ROOM_ID = '507f191e810c19729de860e1';
const NOTIFIED_AT = new Date('2026-09-22T06:42:00.000Z');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const notify = (token, id = ORDER_ID) => fetch(`${base}/api/pending-orders/${id}/parent-notified`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
});

const chain = (value) => ({ populate() { return this; }, select() { return this; }, lean: async () => value });

const asStudent = () => {
  mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
  return signStudentToken(STUDENT_ID, 'ADM1042');
};

const asCaretaker = ({ inRooms = true } = {}) => {
  const scopes = [];
  mock.method(Admin, 'exists', async () => ({ _id: CARETAKER_ID }));
  mock.method(Admin, 'findById', () => chain({ _id: CARETAKER_ID, roomIds: [ROOM_ID] }));
  mock.method(PendingOrder, 'findById', () => chain({ _id: ORDER_ID, studentId: STUDENT_ID }));
  mock.method(Student, 'exists', async (filter) => { scopes.push(filter); return inRooms ? { _id: STUDENT_ID } : null; });
  return { token: signStaffToken(CARETAKER_ID, 'caretaker'), scopes };
};

// The atomic claim: answers with `claimed` and records the filter and change.
const claim = (claimed) => {
  const calls = [];
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, change) => { calls.push({ filter, change }); return chain(claimed); });
  return calls;
};

describe('the kiosk marks its own order as notified', () => {
  test('the first tap records the kiosk and is answered with the record', async () => {
    const token = asStudent();
    const calls = claim({ _id: ORDER_ID, parentNotifiedAt: NOTIFIED_AT, parentNotifiedVia: 'KIOSK', parentNotifiedBy: null });

    const res = await notify(token);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).parentNotified, { at: NOTIFIED_AT.toISOString(), via: 'KIOSK', by: null });

    const [{ filter, change }] = calls;
    assert.equal(String(filter.studentId), STUDENT_ID, 'a student only reaches their own order');
    assert.equal(filter.status, 'PENDING');
    assert.equal(filter.parentNotifiedAt, null, 'only the first notification counts');
    assert.equal(change.$set.parentNotifiedVia, 'KIOSK');
    assert.equal(change.$set.parentNotifiedBy, null);
  });

  test('a second tap is refused with who notified and when', async () => {
    const token = asStudent();
    claim(null);
    mock.method(PendingOrder, 'findOne', () => chain({
      _id: ORDER_ID, status: 'PENDING', parentNotifiedAt: NOTIFIED_AT, parentNotifiedVia: 'CARETAKER', parentNotifiedBy: { name: 'Meena' },
    }));

    const res = await notify(token);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'PARENT_ALREADY_NOTIFIED');
    assert.deepEqual(body.parentNotified, { at: NOTIFIED_AT.toISOString(), via: 'CARETAKER', by: 'Meena' });
  });

  test('an order that is no longer waiting cannot be notified', async () => {
    const token = asStudent();
    claim(null);
    mock.method(PendingOrder, 'findOne', () => chain({ _id: ORDER_ID, status: 'APPROVED', parentNotifiedAt: null }));

    const res = await notify(token);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'ORDER_NOT_WAITING');
  });

  test("somebody else's order is not found", async () => {
    const token = asStudent();
    claim(null);
    mock.method(PendingOrder, 'findOne', () => chain(null));

    assert.equal((await notify(token)).status, 404);
  });

  test('a malformed id is not found without a query', async () => {
    const token = asStudent();
    const calls = claim(null);

    assert.equal((await notify(token, 'not-an-id')).status, 404);
    assert.equal(calls.length, 0);
  });
});

describe('the caretaker marks an order from their rooms', () => {
  test('recorded as the caretaker, scoped to their rooms and approval students', async () => {
    const { token, scopes } = asCaretaker();
    const calls = claim({
      _id: ORDER_ID, parentNotifiedAt: NOTIFIED_AT, parentNotifiedVia: 'CARETAKER', parentNotifiedBy: { _id: CARETAKER_ID, name: 'Meena' },
    });

    const res = await notify(token);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).parentNotified, { at: NOTIFIED_AT.toISOString(), via: 'CARETAKER', by: 'Meena' });

    const scope = scopes.at(-1);
    assert.deepEqual(scope.roomId.$in, [ROOM_ID]);
    assert.equal(scope.requiresParentApproval, true);
    assert.equal(scope.caretakerMayApprove, undefined, 'orders the parent answers can be notified too');
    assert.equal(calls[0].change.$set.parentNotifiedVia, 'CARETAKER');
    assert.equal(String(calls[0].change.$set.parentNotifiedBy), CARETAKER_ID);
  });

  test("an order outside the caretaker's rooms is not found and not written", async () => {
    const { token } = asCaretaker({ inRooms: false });
    const calls = claim(null);

    assert.equal((await notify(token)).status, 404);
    assert.equal(calls.length, 0);
  });

  test('a parent token is turned away', async () => {
    const res = await notify(signParentToken('507f191e810c19729de860ea', '9876543210'));
    assert.equal(res.status, 401);
  });
});

describe("the caretaker's list carries the record", () => {
  test('each order says whether and how the parent was notified', async () => {
    const { token } = asCaretaker();
    mock.method(Student, 'find', () => chain([{ _id: STUDENT_ID, caretakerMayApprove: false }]));
    const sorted = [
      { _id: ORDER_ID, studentId: { _id: STUDENT_ID }, parentNotifiedAt: NOTIFIED_AT, parentNotifiedVia: 'KIOSK', parentNotifiedBy: null },
      { _id: '507f191e810c19729de860ee', studentId: { _id: STUDENT_ID }, parentNotifiedAt: null },
    ];
    mock.method(PendingOrder, 'find', () => ({ populate() { return this; }, sort: async () => sorted }));

    const res = await fetch(`${base}/api/pending-orders/caretaker`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const { orders } = await res.json();
    assert.deepEqual(orders[0].parentNotified, { at: NOTIFIED_AT.toISOString(), via: 'KIOSK', by: null });
    assert.equal(orders[1].parentNotified, null);
  });
});
