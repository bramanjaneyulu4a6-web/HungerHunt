// Purchases that wait for a parent's yes.
//
// The rules worth pinning down are the ones that were wrong in the version this
// arrived as: which token opens which route, that raising a request still costs
// a verified purchase password, and that one unanswered request cannot lock a
// student out of the counter for good.
//
// No database: every model call is stubbed. What is under test is the rules
// applied before and around the queries, not the queries.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const PurchaseAuthorization = (await import('../models/PurchaseAuthorization.js')).default;
const { hashCart } = await import('../utils/purchaseAuthorization.js');
const { signAdminToken, signParentToken, signStudentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';
const STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ORDER_ID = '507f191e810c19729de860ed';

const adminToken = signAdminToken(ADMIN_ID);
const parentToken = signParentToken(PARENT_ID, '9876543210');

const ITEMS = [{ productId: PRODUCT_ID, quantity: 2 }];

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// protectParent asks whether the session is still live: the account exists and
// its tokenVersion still matches the one stamped into the token. Every test
// here is about something else, so the answer is always yes. What happens when
// it is no is in parentSessions.test.js.
beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => mock.restoreAll());

const send = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// protectAdmin confirms the admin still exists; protectParent's owner check
// looks the parent up. Neither is what these tests are about.
const signedIn = () => {
  mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
};

// The till's password check, already passed: an authorisation row bound to this
// student and this exact cart, which consumeAuthorization claims and deletes.
const passwordWasVerified = () => {
  mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => ({
    token: 'good-token',
    studentId: STUDENT_ID,
    cartHash: hashCart(ITEMS),
    expiresAt: new Date(Date.now() + 60_000),
  }));
};

const studentNeedingApproval = (overrides = {}) => {
  mock.method(Student, 'findById', async () => ({
    _id: STUDENT_ID,
    name: 'Asha',
    requiresParentApproval: true,
    ...overrides,
  }));
};

const parentIsLinked = () => {
  mock.method(Parent, 'findOne', async () => ({ _id: PARENT_ID }));
};

const noOpenOrder = () => {
  mock.method(PendingOrder, 'findOne', async () => null);
};

const stockedAt = (price, stock) => {
  mock.method(Inventory, 'findOne', () => ({
    populate: async () => ({
      stock,
      productId: { _id: PRODUCT_ID, name: 'Samosa', price },
    }),
  }));
};

const archivedAt = (price, stock) => {
  mock.method(Inventory, 'findOne', () => ({
    populate: async () => ({
      stock,
      productId: { _id: PRODUCT_ID, name: 'Samosa', price, active: false },
    }),
  }));
};

const createRequest = (body) =>
  send('POST', '/api/pending-orders', adminToken, {
    studentId: STUDENT_ID,
    items: ITEMS,
    purchaseToken: 'good-token',
    ...body,
  });

// The kiosk's caller. A student holds a session of their own, and the purchase
// token — bought with their four-digit code a moment earlier — is what
// authorises the order. The admin console authorises with its own sign-in
// instead, so the token rules below are tested from this side.
const studentToken = signStudentToken(STUDENT_ID, 'ADM-1042');

const studentSession = () => {
  mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
};

const createRequestAsStudent = (body) =>
  send('POST', '/api/pending-orders', studentToken, {
    items: ITEMS,
    purchaseToken: 'good-token',
    ...body,
  });

describe('each side of the counter gets its own routes', () => {
  test('a parent token cannot raise a request', async () => {
    const res = await send('POST', '/api/pending-orders', parentToken, {
      studentId: STUDENT_ID,
      items: ITEMS,
    });

    assert.equal(res.status, 401);
  });

  test('an admin token cannot approve on a parent behalf', async () => {
    signedIn();

    const res = await send('POST', `/api/pending-orders/${ORDER_ID}/approve`, adminToken);

    assert.equal(res.status, 401);
  });

  test('no token at all raises nothing', async () => {
    const res = await send('POST', '/api/pending-orders', null, {
      studentId: STUDENT_ID,
      items: ITEMS,
    });

    assert.equal(res.status, 401);
  });
});

/* Who pays for the order with what.
 *
 * At the kiosk it is the student's four-digit code, spent for a purchase token
 * bound to that student and that exact cart. That is the only thing between an
 * unattended terminal and somebody else's wallet, so these rules are pinned
 * from the student's side.
 *
 * At the console the code is no longer asked for at all. What authorises an
 * admin is their own sign-in, and what protects the student is that every
 * admin-raised order goes to the parent to answer. */
describe('a student raising a request still costs a verified code', () => {
  test('a request with no purchase token is refused', async () => {
    studentSession();
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);

    const res = await createRequestAsStudent({ purchaseToken: undefined });

    // 403 rather than 401: the session is fine, it is the charge that is not
    // authorised. A 401 would sign the kiosk out mid-order.
    assert.equal(res.status, 403);
  });

  test('a token issued for a different cart is refused', async () => {
    studentSession();
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => ({
      token: 'good-token',
      studentId: STUDENT_ID,
      cartHash: hashCart([{ productId: PRODUCT_ID, quantity: 99 }]),
      expiresAt: new Date(Date.now() + 60_000),
    }));

    const res = await createRequestAsStudent();

    assert.equal(res.status, 403);
  });

  // The other half of the same rule, and the reason the two are tested apart.
  test('an admin needs no token — their sign-in is the authorisation', async () => {
    signedIn();
    studentNeedingApproval();
    parentIsLinked();
    noOpenOrder();
    stockedAt(20, 10);

    const consumed = mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);
    mock.method(PendingOrder, 'create', async (doc) => ({ ...doc, _id: ORDER_ID }));

    const res = await createRequest({ purchaseToken: undefined });

    assert.equal(res.status, 201);
    assert.equal(consumed.mock.callCount(), 0);
  });

  test('a verified cart is accepted and the parent is asked', async () => {
    signedIn();
    passwordWasVerified();
    studentNeedingApproval();
    parentIsLinked();
    noOpenOrder();
    stockedAt(20, 10);

    const created = mock.method(PendingOrder, 'create', async (doc) => ({
      ...doc,
      _id: ORDER_ID,
    }));

    const res = await createRequest();

    assert.equal(res.status, 201);
    assert.equal(created.mock.callCount(), 1);

    // Priced from inventory, never from what the till said it cost.
    assert.equal(created.mock.calls[0].arguments[0].totalAmount, 40);
  });
});

/* The console no longer charges directly — it raises a request through this
   same route, and approval can be days off. Without this check an archived
   product sails past the counter and the refusal lands on the parent's phone
   instead, holding the student's one open-request slot the whole time. */
describe('the console cannot raise a request for an archived product', () => {
  test('is refused at the counter, not on the parent\'s phone days later', async () => {
    signedIn();
    studentNeedingApproval();
    parentIsLinked();
    noOpenOrder();
    archivedAt(20, 10);

    const created = mock.method(PendingOrder, 'create', async (doc) => ({ ...doc, _id: ORDER_ID }));

    const res = await createRequest({ purchaseToken: undefined });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.match(body.message, /Samosa is no longer sold/);
    assert.equal(created.mock.callCount(), 0);
  });

  // A parent trimming the archived line out must still be able to — the
  // check only sees the lines actually being priced, and by then that one
  // is gone.
  test('but a parent can still remove the offending line from an existing order', async () => {
    const order = {
      _id: ORDER_ID,
      parentId: PARENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      items: [
        { productId: PRODUCT_ID, name: 'Samosa', quantity: 2, price: 20 },
        { productId: '507f191e810c19729de860ff', name: 'Chips', quantity: 1, price: 15 },
      ],
      save: async function () { return this; },
    };
    mock.method(PendingOrder, 'findOne', async () => order);
    mock.method(PendingOrder, 'findOneAndUpdate', async (_filter, update) => ({
      ...order,
      ...update.$set,
    }));
    stockedAt(20, 10);

    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}`, parentToken, {
      // Drops the second (archived) line entirely; the remaining line is a
      // live one, so priceCart never has to look at the archived product.
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    });

    assert.equal(res.status, 200);
  });
});

describe('the approval route is only for students set up for it', () => {
  /* The setting binds the kiosk. A student who needs no approval is charged at
     the kiosk against their own wallet, so reaching this route from a session
     is a mistake worth naming. An admin-raised order waits for the parent
     whatever the setting says — covered in kioskSession.test.js. */
  test('a student who needs no approval is charged at the kiosk instead', async () => {
    studentSession();
    passwordWasVerified();
    studentNeedingApproval({ requiresParentApproval: false });

    const res = await createRequestAsStudent();
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.match(body.message, /does not need parent approval/i);
  });

  test('a student with no linked parent has nobody to ask', async () => {
    signedIn();
    passwordWasVerified();
    studentNeedingApproval();
    mock.method(Parent, 'findOne', async () => null);

    const res = await createRequest();

    assert.equal(res.status, 404);
    // The console keys its disabled pay button on this rather than on prose.
    assert.equal((await res.json()).code, 'NO_PARENT');
  });
});

describe('one unanswered request does not lock a student out for good', () => {
  test('a live request blocks a second one, and says until when', async () => {
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    signedIn();
    passwordWasVerified();
    studentNeedingApproval();
    parentIsLinked();
    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      status: 'PENDING',
      expiresAt,
      save: async () => {},
    }));

    const res = await createRequest();
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.match(body.message, /already has an order waiting/i);
    assert.equal(new Date(body.expiresAt).getTime(), expiresAt.getTime());
  });

  test('a request past its window is written off and the next one goes through', async () => {
    const lapsed = {
      _id: ORDER_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
      save: async function () { return this; },
    };

    signedIn();
    passwordWasVerified();
    studentNeedingApproval();
    parentIsLinked();
    mock.method(PendingOrder, 'findOne', async () => lapsed);
    stockedAt(20, 10);
    mock.method(PendingOrder, 'create', async (doc) => ({ ...doc, _id: ORDER_ID }));

    const res = await createRequest();

    assert.equal(res.status, 201);
    assert.equal(lapsed.status, 'EXPIRED');
  });

  test('a lapsed request cannot then be approved', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
    }));

    mock.method(PendingOrder, 'findOne', async () => ({
      _id: ORDER_ID,
      parentId: PARENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
      save: async function () { return this; },
    }));

    const res = await send(
      'POST',
      `/api/pending-orders/${ORDER_ID}/approve`,
      parentToken,
      { idempotencyKey: 'expiry-test-key' }
    );

    assert.equal(res.status, 410);
  });
});

describe('a parent may cut an order down but not build it up', () => {
  const openOrder = () => {
    const order = {
      _id: ORDER_ID,
      parentId: PARENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ productId: PRODUCT_ID, name: 'Samosa', quantity: 2, price: 20 }],
      save: async function () { return this; },
    };

    mock.method(PendingOrder, 'findOne', async () => order);
    mock.method(PendingOrder, 'findOneAndUpdate', async (_filter, update) => ({
      ...order,
      ...update.$set,
    }));
  };

  test('a product the till never rang up cannot be added', async () => {
    openOrder();

    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}`, parentToken, {
      items: [{ productId: '507f191e810c19729de860ff', quantity: 1 }],
    });

    const body = await res.json();

    assert.equal(res.status, 400);
    assert.match(body.message, /only be reduced/i);
  });

  test('reducing a line re-prices the order from inventory', async () => {
    openOrder();
    stockedAt(20, 10);

    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}`, parentToken, {
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.order.totalAmount, 20);
  });

  test('an order emptied to nothing is refused rather than approved for zero', async () => {
    const res = await send('PUT', `/api/pending-orders/${ORDER_ID}`, parentToken, {
      items: [{ productId: PRODUCT_ID, quantity: 0 }],
    });

    assert.equal(res.status, 400);
  });
});
