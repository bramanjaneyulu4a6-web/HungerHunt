// Disabling a product hides it from the students' kiosk and from nowhere else.
// It is deliberately not archiving: an archived product is withdrawn from sale
// entirely, while a disabled one is still on the shelf, still sellable by
// staff at the admin till, and still sitting in the admin's own catalogue
// views wearing an overlay. The two must not collapse into each other, which
// is what this file is here to hold.
import test, { describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken, signStudentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f1f77bcf86cd799439022';

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  return query;
};

const row = (name, extra = {}) => {
  const doc = {
    stock: 10,
    productId: {
      _id: `id-${name}`,
      name,
      price: 20,
      active: true,
      ...extra,
    },
  };
  return { ...doc, toObject: () => doc };
};

const shelfOf = (...rows) => mock.method(Inventory, 'find', () => queryFor(rows));

const asStudent = () =>
  fetch(`${base}/api/inventory`, {
    headers: { Authorization: `Bearer ${signStudentToken(STUDENT_ID, 'ADM-1042')}` },
  });

const asStaff = () =>
  fetch(`${base}/api/inventory`, {
    headers: { Authorization: `Bearer ${signStaffToken(STAFF_ID, 'admin')}` },
  });

const namesIn = async (res) =>
  (await res.json()).map((item) => item.productId?.name).filter(Boolean);

describe('a product disabled for the kiosk', () => {
  test('is not offered to a student', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    shelfOf(row('Oreo'), row('Pepsi', { kioskVisible: false }));

    assert.deepEqual(await namesIn(await asStudent()), ['Oreo']);
  });

  // The whole point of the flag: staff can still ring it up over the counter.
  test('is still on the shelf staff can sell from', async () => {
    accountIs('admin');
    shelfOf(row('Oreo'), row('Pepsi', { kioskVisible: false }));

    assert.deepEqual(await namesIn(await asStaff()), ['Oreo', 'Pepsi']);
  });

  // Absent is not false. Every product written before this field has no flag
  // at all, and none of them should vanish from the kiosk the day it ships.
  test('a product with no flag is shown, as every existing one has none', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    shelfOf(row('Oreo'), row('Jim Jam', { kioskVisible: true }));

    // Name order, because the controller sorts the shelf so every screen
    // reading it agrees.
    assert.deepEqual(await namesIn(await asStudent()), ['Jim Jam', 'Oreo']);
  });

  // Archived products used to be sent to the till marked ARCHIVED and dropped
  // there by `sellable`. They are withheld now, for the reason disabled ones
  // are: the kiosk is a sideloaded APK, and a build that filters differently —
  // or not at all — should not be the only thing standing between a withdrawn
  // product and a student's screen. Restoring one is done from the admin's
  // archived screen, which is the only place it can be reached.
  test('an archived product is withheld from the till entirely', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    shelfOf(row('Oreo'), row('Marie Gold', { active: false }));

    const body = await (await asStudent()).json();
    assert.deepEqual(body.map((item) => item.productId?.name), ['Oreo']);
    assert.equal(body.some((item) => item.availability === 'ARCHIVED'), false);
  });

  // Staff keep seeing it: the admin needs the row to restore it from, and the
  // shelf count behind it never stopped being real.
  test('staff still receive archived products', async () => {
    accountIs('admin');
    shelfOf(row('Oreo'), row('Marie Gold', { active: false }));

    assert.deepEqual(await namesIn(await asStaff()), ['Marie Gold', 'Oreo']);
  });

  // Belt and braces on the same point: a product that is both archived and
  // disabled is gone from the payload, because disabling is what removes it.
  test('a disabled product is gone even when it is also archived', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    shelfOf(row('Oreo'), row('Marie Gold', { active: false, kioskVisible: false }));

    assert.deepEqual(await namesIn(await asStudent()), ['Oreo']);
  });
});
