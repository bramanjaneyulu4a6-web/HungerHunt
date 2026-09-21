// A parent handing the approval of their child's purchases to the room's
// caretaker as well.
//
// What is pinned here: the permission only exists while approval is on, the
// caretaker's routes reach exactly the students in their rooms whose parent
// said yes, and that permission is read on every tap rather than remembered.
//
// No database: every model call is stubbed, as in pendingOrders.test.js.
import test, { after, afterEach, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signParentToken, signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const CARETAKER_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';
const STUDENT_ID = '507f191e810c19729de860eb';
const ORDER_ID = '507f191e810c19729de860ed';
const ROOM_ID = '507f191e810c19729de860e1';
const OTHER_STUDENT_ID = '507f191e810c19729de860f1';
const OTHER_ORDER_ID = '507f191e810c19729de860f2';
const PRODUCT_ID = '507f191e810c19729de860ec';

const caretakerToken = signStaffToken(CARETAKER_ID, 'caretaker');
const parentToken = signParentToken(PARENT_ID, '9876543210');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => mock.restoreAll());

const send = (method, path, token, body, headers = {}) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* ---------------- the parent's switch ---------------- */

const parentOwnsStudent = () => {
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));
};

const studentRow = (fields) => {
  const row = { _id: STUDENT_ID, name: 'Asha', ...fields, save: async function () { return this; } };
  mock.method(Student, 'findById', async () => row);
  return row;
};

describe("the parent's switch", () => {
  test('cannot be turned on while purchases do not need approval', async () => {
    parentOwnsStudent();
    const row = studentRow({ requiresParentApproval: false, caretakerMayApprove: false });

    const res = await send('PUT', `/api/parent/caretaker-approval/${STUDENT_ID}`, parentToken, { allowed: true });

    assert.equal(res.status, 400);
    assert.equal(row.caretakerMayApprove, false);
  });

  test('turns on while approval is on', async () => {
    parentOwnsStudent();
    const row = studentRow({ requiresParentApproval: true, caretakerMayApprove: false });

    const res = await send('PUT', `/api/parent/caretaker-approval/${STUDENT_ID}`, parentToken, { allowed: true });

    assert.equal(res.status, 200);
    assert.equal(row.caretakerMayApprove, true);
    assert.equal((await res.json()).caretakerMayApprove, true);
  });

  test('goes with approval when approval is turned off', async () => {
    parentOwnsStudent();
    const row = studentRow({ requiresParentApproval: true, caretakerMayApprove: true });

    const res = await send('PUT', `/api/parent/purchase-approval/${STUDENT_ID}`, parentToken, { required: false });

    assert.equal(res.status, 200);
    assert.equal(row.caretakerMayApprove, false);
    assert.equal((await res.json()).caretakerMayApprove, false);
  });

  test('only for the parent\'s own child', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: ['507f191e810c19729de860ff'] }),
    }));

    const res = await send('PUT', `/api/parent/caretaker-approval/${STUDENT_ID}`, parentToken, { allowed: true });

    assert.equal(res.status, 403);
  });
});

/* ---------------- the caretaker's routes ---------------- */

const signedInCaretaker = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === CARETAKER_ID && allowed.includes('caretaker') ? { _id: CARETAKER_ID } : null;
  });
  mock.method(Admin, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: CARETAKER_ID, name: 'Meena', email: null, roomIds: [ROOM_ID] }),
    }),
  }));
};

const orderFor = (studentId = STUDENT_ID) => {
  mock.method(PendingOrder, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: ORDER_ID, studentId }) }),
  }));
};

// Records the filter the scope check asked with, and answers it.
const scopeAnswers = (allowed) => {
  const seen = [];
  mock.method(Student, 'exists', async (filter) => {
    seen.push(filter);
    return allowed ? { _id: STUDENT_ID } : null;
  });
  return seen;
};

describe("the caretaker's routes", () => {
  test('are closed to a parent token, and the parent\'s are closed to a caretaker', async () => {
    const asParent = await send('GET', '/api/pending-orders/caretaker', parentToken);
    assert.equal(asParent.status, 401);

    signedInCaretaker();
    const asCaretaker = await send('POST', `/api/pending-orders/${ORDER_ID}/approve`, caretakerToken, {});
    assert.equal(asCaretaker.status, 401);
  });

  test('list every waiting order from their rooms, marking which are theirs to answer', async () => {
    signedInCaretaker();
    let asked;
    mock.method(Student, 'find', (filter) => {
      asked = filter;
      return {
        select: () => ({
          lean: async () => [
            { _id: STUDENT_ID, caretakerMayApprove: true },
            { _id: OTHER_STUDENT_ID, caretakerMayApprove: false },
          ],
        }),
      };
    });
    const query = {
      populate() { return query; },
      sort: async () => [
        { _id: ORDER_ID, studentId: { _id: STUDENT_ID, name: 'Asha' }, items: [] },
        { _id: OTHER_ORDER_ID, studentId: { _id: OTHER_STUDENT_ID, name: 'Kiran' }, items: [] },
      ],
    };
    mock.method(PendingOrder, 'find', () => query);

    const res = await send('GET', '/api/pending-orders/caretaker', caretakerToken);
    const { orders } = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(asked.roomId, { $in: [ROOM_ID] });
    assert.equal(asked.requiresParentApproval, true);
    assert.equal(asked.caretakerMayApprove, undefined);
    assert.deepEqual(orders.map((order) => order.caretakerMayAnswer), [true, false]);
  });

  test('still cannot answer an order that is waiting on the parent', async () => {
    signedInCaretaker();
    orderFor(OTHER_STUDENT_ID);
    // The answer routes ask the permission afresh; the parent never gave it.
    mock.method(Student, 'exists', async (filter) =>
      filter.caretakerMayApprove === true && String(filter._id) === OTHER_STUDENT_ID ? null : { _id: STUDENT_ID });
    const claim = mock.method(PendingOrder, 'findOneAndUpdate', async () => null);

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/caretaker-reject`, caretakerToken);

    assert.equal(res.status, 404);
    assert.equal(claim.mock.callCount(), 0);
  });


  // The parent's phone rides along for the WhatsApp button — and only the phone.
  test('carry the parent\'s phone and nothing else of theirs', async () => {
    signedInCaretaker();
    mock.method(Student, 'find', () => ({ select: () => ({ lean: async () => [{ _id: STUDENT_ID }] }) }));
    const populated = [];
    const query = {
      populate(path, fields) { populated.push([path, fields]); return query; },
      sort: async () => [],
    };
    mock.method(PendingOrder, 'find', () => query);

    const res = await send('GET', '/api/pending-orders/caretaker', caretakerToken);

    assert.equal(res.status, 200);
    assert.deepEqual(populated.find(([path]) => path === 'parentId'), ['parentId', 'phone']);
  });

  test('cannot approve an order the parent has not handed over, and nothing is claimed', async () => {
    signedInCaretaker();
    orderFor();
    const seen = scopeAnswers(false);
    const claim = mock.method(PendingOrder, 'findOneAndUpdate', async () => null);

    const res = await send(
      'POST',
      `/api/pending-orders/${ORDER_ID}/caretaker-approve`,
      caretakerToken,
      {},
      { 'Idempotency-Key': 'caretaker-key-1' }
    );

    assert.equal(res.status, 404);
    assert.equal(claim.mock.callCount(), 0);
    // Asked of this caretaker's rooms and the standing permission, every time.
    assert.deepEqual(seen[0].roomId, { $in: [ROOM_ID] });
    assert.equal(seen[0].caretakerMayApprove, true);
  });

  test('approving one they may answer claims it by that student, not by a parent', async () => {
    signedInCaretaker();
    orderFor();
    scopeAnswers(true);
    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      studentId: STUDENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    }));
    let claimFilter;
    mock.method(PendingOrder, 'findOneAndUpdate', async (filter) => {
      claimFilter = filter;
      return null; // Lost the race: stops before any money moves.
    });

    const res = await send(
      'POST',
      `/api/pending-orders/${ORDER_ID}/caretaker-approve`,
      caretakerToken,
      {},
      { 'Idempotency-Key': 'caretaker-key-2' }
    );

    assert.equal(res.status, 409);
    assert.equal(String(claimFilter.studentId), STUDENT_ID);
    assert.equal(claimFilter.parentId, undefined);
  });

  test('declining records the caretaker as the one who answered', async () => {
    signedInCaretaker();
    orderFor();
    scopeAnswers(true);
    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      studentId: STUDENT_ID,
      parentId: PARENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
    }));
    let update;
    mock.method(PendingOrder, 'findOneAndUpdate', async (_filter, change) => {
      update = change.$set;
      return { _id: ORDER_ID, studentId: STUDENT_ID, parentId: PARENT_ID, totalAmount: 40, ...change.$set };
    });
    mock.method(Parent, 'findById', async () => null);

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/caretaker-reject`, caretakerToken);

    assert.equal(res.status, 200);
    assert.equal(update.status, 'REJECTED');
    assert.equal(String(update.answeredBy), CARETAKER_ID);
  });

  /* Caretakers never see receipts: the charge record carries the wallet's
     balance before and after, and it stays with the family and the office. */
  test('is told an approval went through, and is never handed the charge', async () => {
    signedInCaretaker();
    orderFor();
    scopeAnswers(true);
    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      studentId: STUDENT_ID,
      status: 'APPROVED',
      approvalKey: 'caretaker-key-3',
      transactionId: '507f191e810c19729de860aa',
    }));
    mock.method(Transaction, 'findById', async () => ({
      _id: '507f191e810c19729de860aa',
      totalAmount: 40,
      previousBalance: 500,
      remainingBalance: 460,
    }));

    const res = await send(
      'POST',
      `/api/pending-orders/${ORDER_ID}/caretaker-approve`,
      caretakerToken,
      {},
      { 'Idempotency-Key': 'caretaker-key-3' }
    );
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ['message', 'replayed']);
  });
});

/* While the caretaker holds the approval the parent can look but not act —
   the app shows the order read-only, and the server refuses the same four
   things the buttons would have done. */
describe('while the caretaker reviews, the parent only views', () => {
  const heldOrder = () => {
    mock.method(PendingOrder, 'findOne', async () => ({ _id: ORDER_ID, studentId: STUDENT_ID, parentId: PARENT_ID }));
    mock.method(Student, 'exists', async (filter) =>
      filter.caretakerMayApprove === true ? { _id: STUDENT_ID } : null);
  };

  for (const [what, method, path, body] of [
    ['approve', 'POST', `/api/pending-orders/${ORDER_ID}/approve`, {}],
    ['decline', 'POST', `/api/pending-orders/${ORDER_ID}/reject`, undefined],
    ['edit', 'PUT', `/api/pending-orders/${ORDER_ID}`, { items: [{ productId: PRODUCT_ID, quantity: 1 }] }],
  ]) {
    test(`cannot ${what} it`, async () => {
      heldOrder();
      const claim = mock.method(PendingOrder, 'findOneAndUpdate', async () => null);

      const res = await send(method, path, parentToken, body, { 'Idempotency-Key': 'parent-key' });
      const answer = await res.json();

      assert.equal(res.status, 409);
      assert.equal(answer.code, 'CARETAKER_REVIEWS');
      assert.match(answer.message, /contact them for any changes/i);
      assert.equal(claim.mock.callCount(), 0);
    });
  }
});

describe('the caretaker changes the basket for the parent', () => {
  test('may reduce a line, re-priced from inventory', async () => {
    signedInCaretaker();
    orderFor();
    scopeAnswers(true);
    const order = {
      _id: ORDER_ID,
      studentId: STUDENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ productId: PRODUCT_ID, name: 'Samosa', quantity: 2, price: 20 }],
    };
    mock.method(PendingOrder, 'findOne', async () => order);
    mock.method(Inventory, 'findOne', () => ({
      populate: async () => ({ stock: 10, productId: { _id: PRODUCT_ID, name: 'Samosa', price: 20 } }),
    }));
    let filter;
    mock.method(PendingOrder, 'findOneAndUpdate', async (asked, update) => {
      filter = asked;
      return { ...order, ...update.$set };
    });

    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}/caretaker`, caretakerToken, {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.order.totalAmount, 20);
    assert.equal(String(filter.studentId), STUDENT_ID);
  });

  test('may not add to it', async () => {
    signedInCaretaker();
    orderFor();
    scopeAnswers(true);
    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      studentId: STUDENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ productId: PRODUCT_ID, name: 'Samosa', quantity: 2, price: 20 }],
    }));

    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}/caretaker`, caretakerToken, {
      items: [{ productId: '507f191e810c19729de860ff', quantity: 1 }],
    });

    assert.equal(res.status, 400);
  });
});
