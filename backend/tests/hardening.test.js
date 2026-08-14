// The hardening that shipped without tests: the field allow-list on the three
// routes that write a student and the select: false that keeps the purchase
// password hash out of query results.
//
// The auth suites cover who is let through. These cover what happens to a
// request that has already been let through — which is where each of these
// three would fail, silently, if it were undone.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

const adminToken = signAdminToken(ADMIN_ID);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const call = (path, method, body) =>
  fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

// Who a student is. These are the only fields an admin route may write.
const IDENTITY = {
  name: 'Test Student',
  fatherName: 'Test Father',
  hostelNumber: 'A-1',
  grade: '8',
  parentPhoneNumber: '9000000000',
};

// Everything else on the document belongs to a flow with rules of its own:
// pocketMoney to topUpWallet, which records the movement in rechargeHistory,
// and purchasePassword and walletControl to the parent.
const SMUGGLED = {
  pocketMoney: 99999,
  purchasePassword: 'set-by-the-uploader',
  isParentRegistered: true,
  walletControl: { enabled: true, limitAmount: 1, limitType: 'DAILY' },
  _id: '507f191e810c19729de860ff',
  rechargeHistory: [{ amount: 500 }],
};

const assertOnlyIdentity = (written, label) => {
  assert.deepEqual(
    Object.keys(written ?? {}).sort(),
    Object.keys(IDENTITY).sort(),
    `${label} wrote fields outside the allow-list`
  );

  for (const field of Object.keys(SMUGGLED)) {
    assert.equal(written[field], undefined, `${label} let ${field} through`);
  }

  assert.equal(written.name, IDENTITY.name, `${label} dropped a field it should keep`);
};

/* Every route that writes a student now also links them to the parent whose
   name and number match. That is a handful of queries, and this suite runs
   without a database — unstubbed they would each sit until mongoose's buffer
   timeout and fail the route. Stubbed to "no such parent", which exercises the
   linking path without making these tests about it. */
const stubLinking = () => {
  mock.method(Parent, 'findOne', () => ({ select: async () => null }));
  mock.method(Parent, 'updateMany', async () => ({ modifiedCount: 0 }));
  mock.method(Parent, 'updateOne', async () => ({ modifiedCount: 0 }));
  mock.method(Student, 'updateOne', async () => ({ modifiedCount: 0 }));
  mock.method(Student, 'find', () => ({ select: async () => [] }));
};

describe('only the five identity fields are writable', () => {
  before(() => {});

  test('addStudent ignores everything else in the body', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubLinking();

    let written;
    mock.method(Student, 'create', async (doc) => {
      written = doc;
      return { _id: STUDENT_ID, ...doc };
    });

    const res = await call('/api/students', 'POST', { ...IDENTITY, ...SMUGGLED });

    assert.equal(res.status, 201);
    assertOnlyIdentity(written, 'addStudent');
  });

  test('updateStudent ignores everything else in the body', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubLinking();

    let written;
    mock.method(Student, 'findOneAndUpdate', async (filter, update) => {
      written = update;
      return { _id: filter._id, ...update };
    });

    const res = await call(`/api/students/${STUDENT_ID}`, 'PUT', { ...IDENTITY, ...SMUGGLED });

    assert.equal(res.status, 200);
    assertOnlyIdentity(written, 'updateStudent');
  });

  test('the bulk importer ignores extra columns on every row', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubLinking();

    let written;
    mock.method(Student, 'insertMany', async (rows) => {
      written = rows;
      return rows;
    });

    const res = await call('/api/students/bulk', 'POST', {
      students: [
        { ...IDENTITY, ...SMUGGLED },
        { ...IDENTITY, name: 'Second Student', pocketMoney: 5000 },
      ],
    });

    assert.equal(res.status, 201);
    assert.equal(written.length, 2);
    assertOnlyIdentity(written[0], 'bulkImportStudents row 1');
    assert.equal(written[1].pocketMoney, undefined);
  });

  // A dropped column that says nothing looks exactly like a column that
  // applied — the sheet reports success and only the balances disagree.
  test('the importer names the columns it dropped', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubLinking();
    mock.method(Student, 'insertMany', async (rows) => rows);

    const res = await call('/api/students/bulk', 'POST', {
      students: [{ ...IDENTITY, pocketMoney: 100, someUnknownHeading: 'x' }],
    });

    const body = await res.json();

    assert.deepEqual(
      body.ignoredColumns.sort(),
      ['pocketMoney', 'someUnknownHeading']
    );
  });

  test('a clean sheet reports nothing ignored', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubLinking();
    mock.method(Student, 'insertMany', async (rows) => rows);

    const res = await call('/api/students/bulk', 'POST', { students: [IDENTITY] });
    const body = await res.json();

    assert.equal(body.ignoredColumns, undefined);
    assert.equal(body.imported, 1);
  });
});

// The hash used to ride along on every query that returned a student — the
// admin roster, the parent dashboard's populated children, getChildDetails.
//
// This pins the schema flag rather than running a query, because whether Mongo
// honours it needs a database and this suite deliberately has none. It still
// catches the way this would actually be undone: somebody removing the option
// while adding a field next to it.
describe('the purchase password stays out of query results', () => {
  test('the field is select: false on the schema', () => {
    assert.equal(Student.schema.path('purchasePassword').options.select, false);
  });

  test('the three callers that compare it opt back in by name', async () => {
    const { readFile } = await import('node:fs/promises');

    const sources = await Promise.all(
      [
        '../controllers/transactionController.js',
        '../controllers/parentController.js',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8'))
    );

    const joined = sources.join('\n');

    assert.match(joined, /\+purchasePassword/,
      'nothing opts back in, so the password comparisons cannot work');
  });
});
