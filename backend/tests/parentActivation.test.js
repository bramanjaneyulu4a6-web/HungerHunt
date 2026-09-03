import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const firebasePhoneAuth = (await import('../utils/firebasePhoneAuth.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f1f77bcf86cd799439012';
const STUDENT_ID = '507f191e810c19729de860ea';
const adminToken = signAdminToken(ADMIN_ID);
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

test('an admin-created parent waits for phone verification and has no password', async () => {
  mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
  mock.method(Student, 'find', async () => [{
    _id: STUDENT_ID, name: 'Asha', admissionNumber: '10425', hostelNumber: 'D-4', active: true,
  }]);
  mock.method(Parent, 'findOne', () => ({ populate: async () => null }));
  mock.method(Parent, 'exists', async () => null);

  let created;
  mock.method(Parent, 'create', async (fields) => {
    created = fields;
    return {
      _id: PARENT_ID,
      ...fields,
      toObject() { return { _id: this._id, ...fields }; },
    };
  });
  mock.method(Student, 'updateMany', async () => ({ modifiedCount: 1 }));

  const response = await fetch(`${base}/api/admin/users/parents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fatherName: 'Dev Rao', phone: '9876543210', email: 'dev@example.com', studentIds: [STUDENT_ID],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.activationCode, undefined);
  assert.equal(created.activationRequired, true);
  assert.equal(created.password, undefined);
  assert.equal(created.activationCodeHash, undefined);
});

test('a verified registered phone sets the password and signs the parent in', async () => {
  const account = {
    _id: PARENT_ID,
    fatherName: 'Dev Rao',
    phone: '9876543210',
    email: 'dev@example.com',
    studentIds: [STUDENT_ID],
    activationRequired: true,
    tokenVersion: 0,
    save: async function () { return this; },
  };
  mock.method(firebasePhoneAuth, 'verifyPhoneIdToken', async () => ({
    phone_number: '+919876543210',
    firebase: { sign_in_provider: 'phone' },
  }));
  mock.method(Parent, 'findOne', async () => account);

  const response = await fetch(`${base}/api/parent/first-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentPhoneNumber: '9876543210',
      firebaseIdToken: 'firebase-proof',
      password: 'new-password',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(body.token);
  assert.equal(account.activationRequired, false);
  assert.equal(account.activationCodeHash, undefined);
  assert.equal(account.tokenVersion, 1);
  assert.equal(await bcrypt.compare('new-password', account.password), true);
});

test('parent self-registration is no longer an API route', async () => {
  const response = await fetch(`${base}/api/parent/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 404);
});
