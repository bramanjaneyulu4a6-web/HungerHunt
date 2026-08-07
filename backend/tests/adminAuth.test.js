// Guards the privilege-escalation fix: admin and parent tokens are signed with
// the same secret and carry the same { id }, so nothing but a lookup against
// the Admin collection tells them apart.
//
// The real app, routes and middleware run here. Only the two model calls the
// admin gate makes are stubbed, so no database is needed and the test says
// nothing about Mongo — just about who is let through.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.AUTH_BYPASS = 'false'; // the bypass would short-circuit everything below
process.env.NODE_ENV = 'test';

const jwt = (await import('jsonwebtoken')).default;
const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const app = (await import('../app.js')).default;

// Nothing here should reach a database. Without this, a query that slips past
// the stubs waits out Mongoose's 10s buffering timeout instead of failing.
mongoose.set('bufferTimeoutMS', 1000);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';

// Signed exactly as loginAdmin and loginParent sign them.
const adminToken = jwt.sign({ id: ADMIN_ID }, process.env.JWT_SECRET, { expiresIn: '1d' });
const parentToken = jwt.sign(
  { id: PARENT_ID, phone: '9999999999' },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Only ADMIN_ID is a real admin; the parent's id is not in the collection.
const stubAdmins = (count) => {
  mock.method(Admin, 'exists', async (filter) =>
    String(filter._id) === ADMIN_ID ? { _id: ADMIN_ID } : null
  );
  mock.method(Admin, 'countDocuments', async () => count);
};

const call = (path, token, init = {}) =>
  fetch(base + path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

describe('a parent token is not an admin token', () => {
  // Every admin-only surface the escalation reached.
  for (const [method, path] of [
    ['GET', '/api/students'],
    ['PUT', `/api/students/${ADMIN_ID}/topup`],
    ['PUT', `/api/students/${ADMIN_ID}`],
    ['DELETE', `/api/students/${ADMIN_ID}`],
    ['POST', '/api/students/bulk'],
    ['GET', '/api/transactions/history'],
    ['POST', '/api/transactions/bill'],
  ]) {
    test(`${method} ${path} rejects a parent token`, async () => {
      stubAdmins(1);
      const res = await call(path, parentToken, {
        method,
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      assert.equal(res.status, 401, `${method} ${path} let a parent through`);
    });
  }

  test('an admin token still reaches the route', async () => {
    stubAdmins(1);
    mock.method(Student, 'find', async () => []); // the gate is what is under test, not the query
    const res = await call('/api/students', adminToken);
    assert.equal(res.status, 200);
  });

  test('a token signed with another secret is rejected', async () => {
    stubAdmins(1);
    const forged = jwt.sign({ id: ADMIN_ID }, 'not-the-secret', { expiresIn: '1d' });
    assert.equal((await call('/api/students', forged)).status, 401);
  });

  test("a deleted admin's unexpired token is rejected", async () => {
    mock.method(Admin, 'exists', async () => null); // the account is gone
    mock.method(Admin, 'countDocuments', async () => 1);
    assert.equal((await call('/api/students', adminToken)).status, 401);
  });
});

describe('admin registration', () => {
  const body = JSON.stringify({ email: 'new@example.com', password: 'longenough1' });

  test('refuses an unauthenticated caller once an admin exists', async () => {
    stubAdmins(1);
    const res = await call('/api/admin/register', null, { method: 'POST', body });
    assert.equal(res.status, 401);
  });

  test('refuses a parent token once an admin exists', async () => {
    stubAdmins(1);
    const res = await call('/api/admin/register', parentToken, { method: 'POST', body });
    assert.equal(res.status, 401);
  });

  test('is open while no admin exists, so the first account can be created', async () => {
    stubAdmins(0);
    // Past the gate; the controller then does its own work, which is not 401.
    mock.method(Admin, 'findOne', async () => ({ email: 'new@example.com' }));
    const res = await call('/api/admin/register', null, { method: 'POST', body });
    assert.notEqual(res.status, 401);
  });

  test('accepts a genuine admin token once an admin exists', async () => {
    stubAdmins(1);
    mock.method(Admin, 'findOne', async () => ({ email: 'new@example.com' }));
    const res = await call('/api/admin/register', adminToken, { method: 'POST', body });
    assert.notEqual(res.status, 401);
  });
});
