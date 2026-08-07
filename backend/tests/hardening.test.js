// The hardening that shipped without tests: the field allow-list on the three
// routes that write a student, the select: false that keeps the purchase
// password hash out of query results, and the two conditions the dev login
// bypass insists on.
//
// The auth suites cover who is let through. These cover what happens to a
// request that has already been let through — which is where each of these
// three would fail, silently, if it were undone.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
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
    mock.method(Student, 'findByIdAndUpdate', async (id, update) => {
      written = update;
      return { _id: id, ...update };
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

// The bypass serves every admin and parent route unauthenticated. It is for a
// developer's laptop, and the two conditions are what keep it there.
describe('the dev login bypass insists on both conditions', () => {
  const saved = { bypass: process.env.AUTH_BYPASS, env: process.env.NODE_ENV };

  // authBypassEnabled is computed once at module load, so each case needs its
  // own module instance. The query string is what defeats the ESM cache.
  let instance = 0;
  const loadWith = (bypass, nodeEnv) => {
    process.env.AUTH_BYPASS = bypass;

    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;

    instance += 1;
    return import(`../middleware/devBypass.js?case=${instance}`);
  };

  const restore = () => {
    process.env.AUTH_BYPASS = saved.bypass;
    process.env.NODE_ENV = saved.env;
  };

  test('on, in development', async () => {
    try {
      assert.equal((await loadWith('true', 'development')).authBypassEnabled, true);
    } finally { restore(); }
  });

  test('off when NODE_ENV is anything else, including a near miss', async () => {
    try {
      for (const nodeEnv of ['staging', 'prod', 'Development', 'test', undefined]) {
        const { authBypassEnabled } = await loadWith('true', nodeEnv);
        assert.equal(authBypassEnabled, false, `NODE_ENV=${nodeEnv} enabled the bypass`);
      }
    } finally { restore(); }
  });

  test('off when the flag is not exactly "true"', async () => {
    try {
      for (const flag of ['false', '1', 'yes', 'TRUE', '']) {
        const { authBypassEnabled } = await loadWith(flag, 'development');
        assert.equal(authBypassEnabled, false, `AUTH_BYPASS=${flag} enabled the bypass`);
      }
    } finally { restore(); }
  });

  // Reaching production with the flag still set is a configuration accident.
  // The condition above already refuses to honour it; failing the boot says so
  // instead of leaving someone to infer it from the absence of a symptom.
  test('refuses to load at all in production', async () => {
    try {
      await assert.rejects(
        () => loadWith('true', 'production'),
        /AUTH_BYPASS must not be set in production/
      );
    } finally { restore(); }
  });
});
