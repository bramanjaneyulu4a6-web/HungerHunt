import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Hostel = (await import('../models/Hostel.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const StaffReport = (await import('../models/StaffReport.js')).default;
const {
  canTransitionReport,
  categoryProblem,
  reportNoteProblem,
} = await import('../src/domain/reports/staffReport.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439012';
const HOSTEL_ID = '507f191e810c19729de860e1';
const ORDER_ID = '507f191e810c19729de860e3';
const REPORT_ID = '507f191e810c19729de860e9';

const caretakerToken = signStaffToken(STAFF_ID, 'caretaker');
const adminToken = signStaffToken(ADMIN_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const authenticate = (role, id) => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === id && allowed.includes(role) ? { _id: id } : null;
  });
  mock.method(Admin, 'findById', (requested) => ({
    select: () => ({
      lean: async () =>
        String(requested) === STAFF_ID
          ? { _id: STAFF_ID, name: 'Meena Rao', email: 'd4.caretaker@example.com', hostelId: HOSTEL_ID }
          : { _id: ADMIN_ID, name: 'Office', email: 'admin@example.com' },
    }),
  }));
};

const asCaretaker = () => authenticate('caretaker', STAFF_ID);
const asAdmin = () => authenticate('admin', ADMIN_ID);

const send = (method, path, body, token = caretakerToken) =>
  fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const noOpenReports = () => mock.method(StaffReport, 'countDocuments', async () => 0);

const hostelFound = () =>
  mock.method(Hostel, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: HOSTEL_ID, code: 'D-4', name: 'Dorm 4' }) }),
  }));

const capturingCreate = () => {
  const captured = {};
  mock.method(StaffReport, 'create', async (document) => {
    Object.assign(captured, document);
    return {
      toObject: () => ({ _id: REPORT_ID, createdAt: new Date(), handling: [], ...document }),
    };
  });
  return captured;
};

describe('what a caretaker may report', () => {
  test('a complaint is filed against the account that sent it, not the body', async () => {
    asCaretaker();
    noOpenReports();
    hostelFound();
    const captured = capturingCreate();

    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'COMPLAINT',
      category: 'STAFF_CONDUCT',
      note: 'The van driver left the packages outside in the rain again.',
      // All of this is ignored: a report is a statement by a person, and the
      // session is the only trustworthy source for which person.
      raisedBy: ADMIN_ID,
      raiser: { name: 'Somebody else', role: 'admin' },
      status: 'RESOLVED',
    });

    assert.equal(response.status, 201);
    assert.equal(String(captured.raisedBy), STAFF_ID);
    assert.equal(captured.raiser.name, 'Meena Rao');
    assert.equal(captured.raiser.role, 'caretaker');
    assert.equal(captured.raiser.hostelNumber, 'D-4');
    assert.equal(captured.status, 'OPEN');
    assert.equal(captured.order, undefined);

    const body = await response.json();
    assert.equal(body.data.status, 'OPEN');
    assert.equal(body.data.categoryLabel, 'Conduct of another member of staff');
  });

  test('an order issue is scoped to the caretaker\'s own hostel', async () => {
    asCaretaker();
    noOpenReports();
    hostelFound();
    const captured = capturingCreate();
    let filter;
    mock.method(FulfillmentOrder, 'findOne', (requested) => {
      filter = requested;
      return {
        select: () => ({
          lean: async () => ({
            _id: ORDER_ID,
            studentSnapshot: { name: 'Asha', hostelNumber: 'D-4' },
            status: 'DELIVERED',
          }),
        }),
      };
    });

    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'ORDER_ISSUE',
      category: 'MISSING_ITEM',
      orderId: ORDER_ID,
      note: 'Two juices are missing from this package.',
    });

    assert.equal(response.status, 201);
    assert.deepEqual(filter, { _id: ORDER_ID, 'studentSnapshot.hostelId': HOSTEL_ID });
    assert.equal(String(captured.order.orderId), ORDER_ID);
    assert.equal(captured.order.statusAtReport, 'DELIVERED');
    // The snapshot carries no price: a caretaker never sees what a package
    // cost, and a report they raised must not become the place it leaks.
    assert.equal(JSON.stringify(captured).includes('totalAmount'), false);
  });

  test('a package at another hostel is 404, not a refusal', async () => {
    asCaretaker();
    noOpenReports();
    mock.method(FulfillmentOrder, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
    const create = mock.method(StaffReport, 'create', () => { throw new Error('must not run'); });

    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'ORDER_ISSUE',
      category: 'DAMAGED',
      orderId: ORDER_ID,
      note: 'The box was crushed on arrival.',
    });

    assert.equal(response.status, 404);
    assert.equal(create.mock.callCount(), 0);
  });

  test('an unusable report is refused before anything is written', async () => {
    asCaretaker();
    noOpenReports();
    const create = mock.method(StaffReport, 'create', () => { throw new Error('must not run'); });

    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'COMPLAINT',
      category: 'NOT_A_CATEGORY',
      note: 'issue',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(
      (await response.json()).error.details.map((detail) => detail.field),
      ['category', 'note']
    );
    assert.equal(create.mock.callCount(), 0);
  });

  test('a caretaker with a wall of unanswered reports is asked to wait', async () => {
    asCaretaker();
    mock.method(StaffReport, 'countDocuments', async () => 25);
    const create = mock.method(StaffReport, 'create', () => { throw new Error('must not run'); });

    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'COMPLAINT',
      category: 'OTHER',
      note: 'One more thing that needs looking at.',
    });

    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'TOO_MANY_OPEN_REPORTS');
    assert.equal(create.mock.callCount(), 0);
  });

  test('the list a caretaker reads is their own account and nothing wider', async () => {
    asCaretaker();
    let filter;
    mock.method(StaffReport, 'find', (requested) => {
      filter = requested;
      const chain = {
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        lean: async () => [{
          _id: REPORT_ID,
          kind: 'COMPLAINT',
          category: 'OTHER',
          note: 'Something happened.',
          status: 'RESOLVED',
          raisedBy: STAFF_ID,
          raiser: { name: 'Meena Rao', role: 'caretaker', hostelNumber: 'D-4' },
          resolutionNote: 'Spoke to the driver; it will not happen again.',
          handling: [{ from: 'OPEN', to: 'RESOLVED', at: new Date(), actorId: ADMIN_ID, note: 'done' }],
          createdAt: new Date(),
        }],
      };
      return chain;
    });
    mock.method(StaffReport, 'countDocuments', async () => 1);

    const response = await send('GET', '/api/v1/caretaker/reports');
    assert.equal(response.status, 200);
    assert.deepEqual(filter, { raisedBy: STAFF_ID });

    const body = await response.json();
    assert.equal(body.data[0].resolutionNote, 'Spoke to the driver; it will not happen again.');
    /* The answer is the school's. Which admin typed it is not shown to the
       caretaker — that invites the wrong conversation in a corridor. */
    assert.equal(body.data[0].handling, undefined);
    assert.equal(body.data[0].raisedBy, undefined);
    assert.equal(JSON.stringify(body.data).includes(ADMIN_ID), false);
  });
});

describe('the order the office works in', () => {
  const listWithSort = () => {
    const seen = {};
    mock.method(StaffReport, 'find', () => {
      const chain = {
        sort: (value) => { seen.sort = value; return chain; },
        skip: () => chain,
        limit: () => chain,
        lean: async () => [],
      };
      return chain;
    });
    mock.method(StaffReport, 'countDocuments', async () => 0);
    return seen;
  };

  /* ACKNOWLEDGED sorts before OPEN alphabetically, so ordering the queue by
     status would put reports somebody is already handling ahead of ones nobody
     has read. The view separates those; age is what orders them inside it. */
  test('what is still owed comes oldest first', async () => {
    asAdmin();
    const seen = listWithSort();
    await send('GET', '/api/v1/reports?status=OUTSTANDING', undefined, adminToken);
    assert.deepEqual(seen.sort, { createdAt: 1 });
  });

  test('unread reports alone are also oldest first', async () => {
    asAdmin();
    const seen = listWithSort();
    await send('GET', '/api/v1/reports?status=OPEN', undefined, adminToken);
    assert.deepEqual(seen.sort, { createdAt: 1 });
  });

  test('the whole log reads newest first', async () => {
    asAdmin();
    const seen = listWithSort();
    await send('GET', '/api/v1/reports', undefined, adminToken);
    assert.deepEqual(seen.sort, { createdAt: -1 });
  });

  test('every admin account reaches the same queue', async () => {
    // No ownership, no assignment: the queue belongs to all of them, which is
    // why the answer has to carry a name.
    asAdmin();
    listWithSort();
    assert.equal((await send('GET', '/api/v1/reports', undefined, adminToken)).status, 200);
  });
});

describe('who may read and answer reports', () => {
  test('the office queue is closed to a caretaker', async () => {
    asCaretaker();
    assert.equal((await send('GET', '/api/v1/reports')).status, 403);
  });

  test('the office queue is closed to the warehouse', async () => {
    authenticate('warehouse', STAFF_ID);
    assert.equal((await send('GET', '/api/v1/reports', undefined, warehouseToken)).status, 403);
  });

  test('a caretaker cannot answer their own report', async () => {
    asCaretaker();
    const response = await send('POST', `/api/v1/reports/${REPORT_ID}/status`, {
      status: 'RESOLVED',
      note: 'I have decided this is fine.',
    });
    assert.equal(response.status, 403);
  });

  test('raising a report is closed to an admin account', async () => {
    asAdmin();
    const response = await send('POST', '/api/v1/caretaker/reports', {
      kind: 'COMPLAINT',
      category: 'OTHER',
      note: 'Filed from the wrong side of the desk.',
    }, adminToken);
    assert.equal(response.status, 403);
  });
});

describe('handling a report', () => {
  const openReport = (status = 'OPEN') => ({
    _id: REPORT_ID,
    kind: 'ORDER_ISSUE',
    category: 'MISSING_ITEM',
    note: 'Two juices are missing.',
    status,
    raisedBy: STAFF_ID,
    raiser: { name: 'Meena Rao', role: 'caretaker', hostelNumber: 'D-4' },
    handling: [],
    createdAt: new Date(),
  });

  test('resolving records the answer the caretaker will read', async () => {
    asAdmin();
    mock.method(StaffReport, 'findById', () => ({ lean: async () => openReport() }));
    let filter;
    let update;
    mock.method(StaffReport, 'findOneAndUpdate', (requestedFilter, requested) => {
      filter = requestedFilter;
      update = requested;
      return { lean: async () => ({ ...openReport('RESOLVED'), ...requested.$set }) };
    });

    const response = await send('POST', `/api/v1/reports/${REPORT_ID}/status`, {
      status: 'RESOLVED',
      note: 'Two juices were re-sent with the next round.',
    }, adminToken);

    assert.equal(response.status, 200);
    assert.deepEqual(filter, { _id: REPORT_ID, status: 'OPEN' });
    assert.equal(update.$set.resolutionNote, 'Two juices were re-sent with the next round.');
    assert.equal(String(update.$set.resolvedBy), ADMIN_ID);
    assert.equal(update.$push.handling.to, 'RESOLVED');
    assert.equal(String(update.$push.handling.actorId), ADMIN_ID);

    /* Every admin sees this queue and any of them may answer anything in it, so
       the name of the one who did is written onto the report — a shared
       responsibility with no name on it is nobody's. Snapshotted, so it still
       reads correctly after that person leaves. */
    assert.equal(update.$set.resolvedByName, 'Office');
    assert.equal(update.$push.handling.actorName, 'Office');
    assert.equal((await response.json()).data.answeredBy, 'Office');
  });

  test('the caretaker is told who answered them', async () => {
    asCaretaker();
    mock.method(StaffReport, 'find', () => {
      const chain = {
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        lean: async () => [{
          _id: REPORT_ID,
          kind: 'COMPLAINT',
          category: 'OTHER',
          note: 'Something happened.',
          status: 'RESOLVED',
          raisedBy: STAFF_ID,
          raiser: { name: 'Meena Rao', role: 'caretaker', hostelNumber: 'D-4' },
          resolutionNote: 'Spoke to the driver.',
          resolvedByName: 'Priya Sharma',
          handling: [{ from: 'OPEN', to: 'RESOLVED', at: new Date(), actorId: ADMIN_ID, actorName: 'Priya Sharma', note: 'done' }],
          createdAt: new Date(),
        }],
      };
      return chain;
    });
    mock.method(StaffReport, 'countDocuments', async () => 1);

    const body = await (await send('GET', '/api/v1/caretaker/reports')).json();
    assert.equal(body.data[0].answeredBy, 'Priya Sharma');
    // The name, not the account, and still not the internal trail.
    assert.equal(body.data[0].handling, undefined);
    assert.equal(JSON.stringify(body.data).includes(ADMIN_ID), false);
  });

  test('acknowledging names its actor too', async () => {
    asAdmin();
    mock.method(StaffReport, 'findById', () => ({ lean: async () => openReport() }));
    let update;
    mock.method(StaffReport, 'findOneAndUpdate', (_filter, requested) => {
      update = requested;
      return { lean: async () => ({ ...openReport('ACKNOWLEDGED'), ...requested.$set }) };
    });

    await send('POST', `/api/v1/reports/${REPORT_ID}/status`, { status: 'ACKNOWLEDGED' }, adminToken);

    assert.equal(update.$push.handling.actorName, 'Office');
    // Reading something is not answering it, so no answer is attributed yet.
    assert.equal(update.$set.resolvedByName, undefined);
  });

  test('resolving with nothing to say is refused', async () => {
    asAdmin();
    const find = mock.method(StaffReport, 'findById', () => { throw new Error('must not run'); });

    const response = await send('POST', `/api/v1/reports/${REPORT_ID}/status`, {
      status: 'RESOLVED',
    }, adminToken);

    assert.equal(response.status, 400);
    assert.equal(find.mock.callCount(), 0);
  });

  test('acknowledging may be silent', async () => {
    asAdmin();
    mock.method(StaffReport, 'findById', () => ({ lean: async () => openReport() }));
    let update;
    mock.method(StaffReport, 'findOneAndUpdate', (_filter, requested) => {
      update = requested;
      return { lean: async () => ({ ...openReport('ACKNOWLEDGED'), ...requested.$set }) };
    });

    const response = await send('POST', `/api/v1/reports/${REPORT_ID}/status`, {
      status: 'ACKNOWLEDGED',
    }, adminToken);

    assert.equal(response.status, 200);
    assert.ok(update.$set.acknowledgedAt instanceof Date);
  });

  test('a resolved report is not resolved again', async () => {
    asAdmin();
    mock.method(StaffReport, 'findById', () => ({ lean: async () => openReport('RESOLVED') }));
    const update = mock.method(StaffReport, 'findOneAndUpdate', () => {
      throw new Error('must not run');
    });

    const response = await send('POST', `/api/v1/reports/${REPORT_ID}/status`, {
      status: 'RESOLVED',
      note: 'Handled twice.',
    }, adminToken);

    assert.equal(response.status, 409);
    assert.equal(update.mock.callCount(), 0);
  });
});

describe('report policy', () => {
  test('a matter that comes back is a new report, not a reopened one', () => {
    assert.equal(canTransitionReport('OPEN', 'ACKNOWLEDGED'), true);
    assert.equal(canTransitionReport('OPEN', 'RESOLVED'), true);
    assert.equal(canTransitionReport('ACKNOWLEDGED', 'RESOLVED'), true);
    assert.equal(canTransitionReport('RESOLVED', 'OPEN'), false);
    assert.equal(canTransitionReport('RESOLVED', 'ACKNOWLEDGED'), false);
  });

  test('a category belongs to one kind of report', () => {
    assert.equal(categoryProblem('ORDER_ISSUE', 'MISSING_ITEM'), null);
    assert.equal(categoryProblem('COMPLAINT', 'WORKING_CONDITIONS'), null);
    // A complaint cannot be filed under a package category, or the queue stops
    // meaning anything.
    assert.match(categoryProblem('COMPLAINT', 'MISSING_ITEM'), /listed categories/);
    assert.match(categoryProblem('SOMETHING', 'OTHER'), /Unknown report type/);
  });

  test('a report has to say something', () => {
    assert.match(reportNoteProblem('issue'), /at least 10/);
    assert.match(reportNoteProblem('   '), /at least 10/);
    assert.match(reportNoteProblem('a'.repeat(1001)), /under 1000/);
    assert.equal(reportNoteProblem('Two juices are missing.'), null);
  });
});
