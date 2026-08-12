// The receiving half of goods-inwards. The old completePurchase overwrote the
// order with whatever arrived, destroying the evidence of every shortfall.
// Receipts are the fix: the order is never edited, each delivery is its own
// row with who/when/invoice, and the discrepancy is always derivable.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const GoodsReceipt = (await import('../models/GoodsReceipt.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PO_ID = '507f191e810c19729de860ed';
const PRODUCT_A = '507f191e810c19729de860ec';
const PRODUCT_B = '507f191e810c19729de860eb';

const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Models the one account row the gate looks up. Shared with the other role
// tests so the two stay in lockstep if a gate's filter shape ever changes.
const accountIs = accountMatcher(Admin, STAFF_ID);

// An order for 10 A and 4 B, with `received` already at the given counts.
const orderWith = (receivedA = 0, receivedB = 0, status = 'NEW') => {
  const doc = {
    _id: PO_ID,
    status,
    items: [
      { productId: PRODUCT_A, quantity: 10, purchasePrice: 5, received: receivedA },
      { productId: PRODUCT_B, quantity: 4, purchasePrice: 9, received: receivedB },
    ],
    save: async function () { return this; },
  };
  mock.method(Purchase, 'findById', async () => doc);
  // Every booking now asks whether this token has already been answered
  // before it judges anything else. Nothing is booked by default; the tests
  // about a replay say so themselves.
  mock.method(GoodsReceipt, 'findOne', async () => null);
  return doc;
};

const receive = (body) =>
  fetch(`${base}/api/purchases/${PO_ID}/receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${warehouseToken}`,
    },
    body: JSON.stringify({ clientToken: 'tap-1', ...body }),
  });

describe('booking a delivery', () => {
  test('a partial delivery moves stock, advances received, leaves the order open', async () => {
    accountIs('warehouse');
    const order = orderWith();

    let receiptDoc;
    mock.method(GoodsReceipt, 'create', async (doc) => { receiptDoc = doc; return { _id: 'r1', ...doc }; });

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push([String(filter.productId), update.$inc.stock]);
      return { modifiedCount: 1 };
    });

    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      orderMoves.push([String(filter['items.productId']), update.$inc['items.$.received']]);
      // Mirror the write onto the in-memory doc so the recompute sees it.
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    const res = await receive({
      invoiceNumber: 'INV-77',
      lines: [{ productId: PRODUCT_A, received: 6, damaged: 1, reason: 'crushed box' }],
    });

    assert.equal(res.status, 201);
    assert.equal(receiptDoc.receivedBy.toString?.() ?? String(receiptDoc.receivedBy), STAFF_ID);
    assert.deepEqual(stockMoves, [[PRODUCT_A, 6]], 'damaged units never reach the shelf');
    assert.deepEqual(orderMoves, [[PRODUCT_A, 7]], 'damaged units count against the order');
    assert.equal(order.status, 'PARTIAL');
  });

  test('the delivery that covers everything completes the order', async () => {
    accountIs('warehouse');
    const order = orderWith(7, 4, 'PARTIAL'); // A needs 3 more, B done

    mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r2', ...doc }));
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 3 }] });

    assert.equal(res.status, 201);
    assert.equal(order.status, 'COMPLETED');
    assert.ok(order.completedAt instanceof Date);
  });

  test('more than remains on the order is refused', async () => {
    accountIs('warehouse');
    orderWith(7); // 3 of A remain

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 4 }] });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /more than remains/i);
  });

  test('a product the order never asked for is refused', async () => {
    accountIs('warehouse');
    const order = orderWith();
    order.items = order.items.slice(0, 1); // only A on the order

    const res = await receive({ lines: [{ productId: PRODUCT_B, received: 1 }] });

    assert.equal(res.status, 400);
  });

  test('a completed order takes no more deliveries', async () => {
    accountIs('warehouse');
    orderWith(10, 4, 'COMPLETED');

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 1 }] });

    assert.equal(res.status, 409);
  });

  /* The office can cancel an order the storeroom is mid-delivery on; the
     storeroom's screen may be minutes stale. Booking anyway would apply stock
     against an order the ledger says is void, and flip the status straight
     back to PARTIAL or COMPLETED — silently un-cancelling it. */
  test('a cancelled order takes no deliveries, and nothing moves', async () => {
    accountIs('warehouse');
    orderWith(0, 0, 'CANCELLED');

    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const created = mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 1 }] });

    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /cancelled/i);
    assert.equal(created.mock.callCount(), 0, 'no receipt row for a delivery against a void order');
    assert.equal(stock.mock.callCount(), 0, 'and no stock may move');
  });

  test('the same tap twice books one delivery', async () => {
    accountIs('warehouse');
    orderWith();

    const existing = { _id: 'r1', clientToken: 'tap-1' };
    mock.method(GoodsReceipt, 'create', async () => {
      const err = new Error('dup');
      err.code = 11000;
      throw err;
    });
    mock.method(GoodsReceipt, 'findOne', async () => existing);
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 200, 'the duplicate is answered, not errored');
    assert.equal(stock.mock.callCount(), 0, 'and it must not move stock again');
  });

  /* The double-tap the unique index catches is two requests racing, both of
     which read the order before either wrote. The other retry — the one the
     token is actually minted for — arrives after the first attempt committed
     and its response was lost on the way back. By then the order carries the
     advanced counts, so every check would refuse the replay: it would be told
     to raise a new order for extras, inventing a supplier debt out of a
     dropped packet. */
  test('a replayed token is recognised even after the first attempt advanced the order', async () => {
    accountIs('warehouse');
    orderWith(6, 0, 'PARTIAL'); // the lost confirm landed: only 4 of A remain

    const existing = { _id: 'r1', clientToken: 'tap-1' };
    mock.method(GoodsReceipt, 'findOne', async (filter) =>
      filter.clientToken === 'tap-1' ? existing : null);

    const created = mock.method(GoodsReceipt, 'create', async () => {
      throw new Error('the replay was booked a second time');
    });
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    // The same body the lost confirm carried: six, which no longer fits.
    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 200, 'the retry was judged instead of recognised');
    assert.deepEqual((await res.json()).receipt, existing);
    assert.equal(created.mock.callCount(), 0);
    assert.equal(stock.mock.callCount(), 0, 'and nothing may reach the shelf twice');
  });

  test('and recognised even once the delivery it booked closed the order', async () => {
    accountIs('warehouse');
    orderWith(10, 4, 'COMPLETED');

    const existing = { _id: 'r2', clientToken: 'tap-1' };
    mock.method(GoodsReceipt, 'findOne', async () => existing);

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 10 }] });

    assert.equal(res.status, 200, 'a closed order answered the retry with a 409');
    assert.deepEqual((await res.json()).receipt, existing);
  });

  test('two rows for the same product are one line, checked once', async () => {
    accountIs('warehouse');
    const order = orderWith();

    let receiptDoc;
    mock.method(GoodsReceipt, 'create', async (doc) => { receiptDoc = doc; return { _id: 'r1', ...doc }; });

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push([String(filter.productId), update.$inc.stock]);
      return { modifiedCount: 1 };
    });

    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      orderMoves.push([String(filter['items.productId']), update.$inc['items.$.received']]);
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    const res = await receive({
      lines: [
        { productId: PRODUCT_A, received: 4, reason: '' },
        { productId: PRODUCT_A, received: 2, damaged: 1, reason: 'crushed box' },
      ],
    });

    assert.equal(res.status, 201);
    assert.equal(receiptDoc.lines.length, 1, 'the ledger records one line per product');
    assert.equal(receiptDoc.lines[0].received, 6);
    assert.equal(receiptDoc.lines[0].damaged, 1);
    assert.deepEqual(stockMoves, [[PRODUCT_A, 6]], 'one stock move, not one per row');
    assert.deepEqual(orderMoves, [[PRODUCT_A, 7]], 'one positional write, not one per row');
  });

  test('the same product split over two rows cannot exceed what remains', async () => {
    accountIs('warehouse');
    orderWith(); // 10 of A on the order, none received

    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const created = mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));

    // Each row fits inside the remaining ten on its own. Together they do not.
    const res = await receive({
      lines: [
        { productId: PRODUCT_A, received: 10 },
        { productId: PRODUCT_A, received: 10 },
      ],
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /more than remains/i);
    assert.equal(created.mock.callCount(), 0, 'nothing may be booked');
    assert.equal(stock.mock.callCount(), 0, 'and nothing may reach the shelf');
  });

  test('a count that is not a number is refused rather than read as zero', async () => {
    accountIs('warehouse');
    orderWith();

    for (const received of [null, '', true, [], 'six', 1.5, -1]) {
      const res = await receive({ lines: [{ productId: PRODUCT_A, received }] });
      assert.equal(res.status, 400, `${JSON.stringify(received)} was accepted as a count`);
    }
  });

  test('a failure mid-apply takes back the stock and the receipt', async () => {
    accountIs('warehouse');
    orderWith();
    // The 500 path logs the cause on purpose; a stack here would be
    // indistinguishable from a real one in a future run.
    mock.method(console, 'error', () => {});

    let deleted = false;
    mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));
    mock.method(GoodsReceipt, 'deleteOne', async () => { deleted = true; return {}; });

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push(update.$inc.stock);
      return { modifiedCount: 1 };
    });
    mock.method(Purchase, 'updateOne', async () => { throw new Error('mongo hiccup'); });

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 500);
    assert.deepEqual(stockMoves, [6, -6], 'applied stock must be taken back');
    assert.ok(deleted, 'the receipt row must not survive a failed booking');
  });
});

describe('nothing at all in a receipt', () => {
  test('is refused before any model is touched', async () => {
    accountIs('warehouse');
    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 0, damaged: 0 }] });
    assert.equal(res.status, 400);
  });
});

/* Nothing else in the system can set a unit cost on an order raised in the
   warehouse app: the order screen does not ask for one and there is no screen
   that can add one afterwards, so without this every such order would read as
   ₹0.00 spent forever. The invoice is in the receiver's hand at exactly this
   moment, which is why it is asked for here. */
describe('the price off the invoice', () => {
  // Everything a priced booking needs, with the writes it made handed back.
  const bookingReaches = () => {
    const order = orderWith();
    const seen = { receipt: null, writes: [] };

    mock.method(GoodsReceipt, 'create', async (doc) => { seen.receipt = doc; return { _id: 'r1', ...doc }; });
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      seen.writes.push(update);
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    return seen;
  };

  test('lands on the order line and on the ledger row', async () => {
    accountIs('warehouse');
    const seen = bookingReaches();

    // Fractional on purpose: this is money per kilo, not a count of tins.
    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6, purchasePrice: 12.5 }] });

    assert.equal(res.status, 201);
    assert.equal(seen.writes[0].$set['items.$.purchasePrice'], 12.5,
      'the order must learn what its stock cost');
    assert.equal(seen.receipt.lines[0].purchasePrice, 12.5,
      'and the ledger must keep what this delivery was invoiced at');
  });

  test('left blank, it leaves the price the order already carries alone', async () => {
    accountIs('warehouse');
    const seen = bookingReaches();

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 201);
    assert.equal(seen.writes[0].$set, undefined,
      'a delivery with no invoice to hand must not overwrite a price with nothing');
    assert.equal(seen.receipt.lines[0].purchasePrice, undefined);
  });

  test('a zero is treated as blank against the order, and still recorded on the row', async () => {
    accountIs('warehouse');
    const seen = bookingReaches();

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6, purchasePrice: 0 }] });

    assert.equal(res.status, 201);
    assert.equal(seen.writes[0].$set, undefined, 'an empty box coerces to zero; that is not a price');
    assert.equal(seen.receipt.lines[0].purchasePrice, 0);
  });

  test('and comes back off the order when the delivery that carried it is rolled back', async () => {
    accountIs('warehouse');
    mock.method(console, 'error', () => {});
    orderWith(); // A already carries a purchasePrice of 5, B of 9

    mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));
    mock.method(GoodsReceipt, 'deleteOne', async () => ({}));
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const writes = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      writes.push([String(filter['items.productId']), update]);
      // B's write is what fails; A's is already on the order by then.
      if (String(filter['items.productId']) === PRODUCT_B && update.$inc['items.$.received'] > 0) {
        throw new Error('mongo hiccup');
      }
      return { modifiedCount: 1 };
    });

    const res = await receive({
      lines: [
        { productId: PRODUCT_A, received: 6, purchasePrice: 40 },
        { productId: PRODUCT_B, received: 2, purchasePrice: 70 },
      ],
    });

    assert.equal(res.status, 500);

    const rollback = writes.find(([id, u]) => id === PRODUCT_A && u.$inc['items.$.received'] < 0);
    assert.ok(rollback, 'the received count must come back');
    assert.equal(rollback[1].$set['items.$.purchasePrice'], 5,
      'and so must the price, or the order keeps a figure no receipt stands behind');
  });

  test('and something that is not an amount is refused rather than booked as one', async () => {
    accountIs('warehouse');
    const created = mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));

    for (const purchasePrice of ['twelve', -1, true, []]) {
      orderWith();
      const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6, purchasePrice }] });
      assert.equal(res.status, 400, `${JSON.stringify(purchasePrice)} was accepted as money`);
    }

    assert.equal(created.mock.callCount(), 0);
  });
});

describe('reading the ledger for one order', () => {
  test('is newest first, which is the whole point of a delivery history', async () => {
    accountIs('warehouse');

    let sortedBy;
    mock.method(GoodsReceipt, 'find', () => {
      const chain = {
        populate: () => chain,
        sort: async (order) => { sortedBy = order; return []; },
      };
      return chain;
    });

    const res = await fetch(`${base}/api/purchases/${PO_ID}/receipts`, {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(sortedBy, { createdAt: -1 });
  });
});

// The old back-office screen still closes an order in one step. It keeps that
// contract, but it now goes through the same ledger as everything else.
describe('the legacy one-step close', () => {
  const close = (items) =>
    fetch(`${base}/api/purchases/complete/${PO_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ items }),
    });

  /* The read, the claim and the ledger write, in the order every close
     performs them. Tests that want either write to fail pass their own create;
     `pre` is the order as it stands before the close, which the over-receipt
     guard measures the posted quantities against and whose status the
     compensation has to restore. Returns the ids of the rows the compensation
     took back, so every failure path can be held to leaving none behind. */
  const closeReaches = (onCreate = async (doc) => ({ _id: 'r1', ...doc }), pre = {}) => {
    orderWith(pre.receivedA ?? 0, pre.receivedB ?? 0, pre.status ?? 'NEW');
    mock.method(Purchase, 'findOneAndUpdate', async () => ({ _id: PO_ID, status: 'COMPLETED' }));
    mock.method(GoodsReceipt, 'create', onCreate);

    const deleted = [];
    mock.method(GoodsReceipt, 'deleteOne', async (filter) => { deleted.push(String(filter._id)); return {}; });
    return deleted;
  };

  test('closes the order and leaves a receipt behind it', async () => {
    accountIs('admin');

    const order = [];
    let receiptDoc;
    const deleted = closeReaches(async (doc) => { order.push('receipt'); receiptDoc = doc; return { _id: 'r1', ...doc }; });

    mock.method(Inventory, 'updateOne', async () => { order.push('stock'); return { modifiedCount: 1 }; });

    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      orderMoves.push([String(filter['items.productId']), update.$inc?.['items.$.received']]);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 6, purchasePrice: 5 }]);

    assert.equal(res.status, 200);
    assert.deepEqual(orderMoves, [[PRODUCT_A, 6]], 'a legacy close advances received like any delivery');
    assert.equal(String(receiptDoc.receivedBy), STAFF_ID);
    assert.deepEqual(receiptDoc.lines, [{ productId: PRODUCT_A, received: 6, damaged: 0 }]);
    assert.deepEqual(order, ['receipt', 'stock'], 'the ledger row is written before anything is applied');
    assert.deepEqual(deleted, [], 'a close that worked keeps its row');
  });

  test('a ledger that will not take the row stops the close entirely', async () => {
    accountIs('admin');
    mock.method(console, 'error', () => {});
    const deleted = closeReaches(async () => { throw new Error('ledger down'); });

    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const reopened = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      reopened.push(update.$set?.status);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 6, purchasePrice: 5 }]);

    assert.equal(res.status, 500);
    assert.equal(stock.mock.callCount(), 0, 'an order must not close on stock with no receipt behind it');
    assert.deepEqual(reopened, ['NEW'], 'and the order must be left open for the retry');
    assert.deepEqual(deleted, [], 'there is no row to take back when the write itself failed');
  });

  test('a failed close leaves no orphan row in the ledger', async () => {
    accountIs('admin');
    mock.method(console, 'error', () => {});
    const deleted = closeReaches();

    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const reopened = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      // The apply write is what fails; the reopen behind it still goes through.
      if (update.$inc) throw new Error('mongo hiccup');
      reopened.push(update.$set?.status);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 6, purchasePrice: 5 }]);

    assert.equal(res.status, 500);
    assert.deepEqual(reopened, ['NEW']);
    assert.deepEqual(deleted, ['r1'],
      'a receipt with no close behind it overstates what arrived, so the shortfall understates what is owed');
  });

  test('a failure partway takes back both the stock and the received counts', async () => {
    accountIs('admin');
    mock.method(console, 'error', () => {});
    const deleted = closeReaches();

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push([String(filter.productId), update.$inc.stock]);
      // The second product's stock move is what fails; the rollback of the
      // first one is a decrement, so it is still allowed through.
      if (String(filter.productId) === PRODUCT_B && update.$inc.stock > 0) {
        throw new Error('mongo hiccup');
      }
      return { modifiedCount: 1 };
    });

    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      if (update.$inc) orderMoves.push([String(filter['items.productId']), update.$inc['items.$.received']]);
      return { modifiedCount: 1 };
    });

    const res = await close([
      { productId: PRODUCT_A, quantity: 6, purchasePrice: 5 },
      { productId: PRODUCT_B, quantity: 2, purchasePrice: 9 },
    ]);

    assert.equal(res.status, 500);
    assert.deepEqual(stockMoves, [[PRODUCT_A, 6], [PRODUCT_B, 2], [PRODUCT_A, -6]]);
    assert.deepEqual(orderMoves, [[PRODUCT_A, 6], [PRODUCT_A, -6]],
      'a received count left standing would block the retry as an over-receipt');
    assert.deepEqual(deleted, ['r1'], 'and the row it wrote must go with them');
  });

  test('a failed order write still takes back the stock it just moved', async () => {
    accountIs('admin');
    mock.method(console, 'error', () => {});
    const deleted = closeReaches();

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push(update.$inc.stock);
      return { modifiedCount: 1 };
    });
    mock.method(Purchase, 'updateOne', async () => { throw new Error('mongo hiccup'); });

    const res = await close([{ productId: PRODUCT_A, quantity: 6, purchasePrice: 5 }]);

    assert.equal(res.status, 500);
    assert.deepEqual(stockMoves, [6, -6], 'stock that landed must come back even if the order write did not');
    assert.deepEqual(deleted, ['r1'], 'and the row it wrote must go with them');
  });

  /* The close claims NEW or PARTIAL, which is what lets an admin finish an
     order the supplier abandoned. It is also what makes a stale tab dangerous:
     the pending list is meant to be left open, and the six units the storeroom
     booked while it sat there are already on the shelf and already counted. */
  test('refuses to apply what a delivery has already brought in', async () => {
    accountIs('admin');
    const deleted = closeReaches(async (doc) => ({ _id: 'r1', ...doc }), {
      receivedA: 6,
      status: 'PARTIAL',
    });

    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const claim = mock.method(Purchase, 'findOneAndUpdate', async () => ({ _id: PO_ID }));
    mock.method(Purchase, 'updateOne', async () => ({ modifiedCount: 1 }));

    // The stale tab still shows the ordered ten in the box.
    const res = await close([{ productId: PRODUCT_A, quantity: 10, purchasePrice: 5 }]);

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /more than remains/i);
    assert.equal(claim.mock.callCount(), 0, 'the order must not be closed on a refused quantity');
    assert.equal(stock.mock.callCount(), 0, 'and ten units must not reach a shelf owed four');
    assert.deepEqual(deleted, []);
  });

  test('but closes it happily at what is genuinely still outstanding', async () => {
    accountIs('admin');
    closeReaches(async (doc) => ({ _id: 'r1', ...doc }), { receivedA: 6, status: 'PARTIAL' });

    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      orderMoves.push([String(filter['items.productId']), update.$inc?.['items.$.received']]);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 4, purchasePrice: 5 }]);

    assert.equal(res.status, 200);
    assert.deepEqual(orderMoves, [[PRODUCT_A, 4]]);
  });

  test('a product that was never on the order cannot be smuggled in by the close', async () => {
    accountIs('admin');
    const order = orderWith();
    order.items = order.items.slice(0, 1);
    mock.method(Purchase, 'findOneAndUpdate', async () => ({ _id: PO_ID, status: 'COMPLETED' }));
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const res = await close([{ productId: PRODUCT_B, quantity: 1, purchasePrice: 5 }]);

    assert.equal(res.status, 400);
    assert.equal(stock.mock.callCount(), 0);
  });

  // Reopening it as NEW would put it back in the pending list looking
  // untouched, with its received counts already advanced — the same
  // over-apply as above, reached from the other side.
  test('a failed close puts a part-delivered order back as PARTIAL, not as NEW', async () => {
    accountIs('admin');
    mock.method(console, 'error', () => {});
    closeReaches(async () => { throw new Error('ledger down'); }, {
      receivedA: 6,
      status: 'PARTIAL',
    });

    const reopened = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      reopened.push(update.$set?.status);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 4, purchasePrice: 5 }]);

    assert.equal(res.status, 500);
    assert.deepEqual(reopened, ['PARTIAL']);
  });

  // Purchased.jsx prefills the price it already has, so this only bites when
  // somebody clears the box — and then it destroys the one figure in the
  // system that no screen can put back.
  test('an admin who clears the price box does not wipe what the storeroom captured', async () => {
    accountIs('admin');
    closeReaches();

    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const writes = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      writes.push(update);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 4, purchasePrice: 0 }]);

    assert.equal(res.status, 200);
    assert.equal(writes[0].$set, undefined, 'a blank box is not a price of zero');
    assert.equal(writes[0].$inc['items.$.received'], 4, 'the delivery itself still books');
  });

  test('but a price the admin did type still lands on the order', async () => {
    accountIs('admin');
    closeReaches();

    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const writes = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      writes.push(update);
      return { modifiedCount: 1 };
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 4, purchasePrice: 12.5 }]);

    assert.equal(res.status, 200);
    assert.equal(writes[0].$set['items.$.purchasePrice'], 12.5);
  });

  test('an order already closed is a 409, not a second application of stock', async () => {
    accountIs('admin');
    orderWith(10, 4, 'COMPLETED');
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const res = await close([{ productId: PRODUCT_A, quantity: 10, purchasePrice: 5 }]);

    assert.equal(res.status, 409);
    assert.equal(stock.mock.callCount(), 0);
  });

  /* The order read at the top of the function is not the order the claim
     just lost to — a cancel and a completion are two different doors out of
     NEW/PARTIAL, and either could go through in the gap between that read
     and this write. Telling someone who cancelled it themselves that it was
     "already completed" is the wrong answer. */
  test('a claim that loses a race to a cancel says cancelled, not completed', async () => {
    accountIs('admin');
    const order = orderWith(0, 0, 'NEW');

    mock.method(Purchase, 'findOneAndUpdate', async () => {
      // The gap this closes: another request cancelled the order between
      // this function's own read and its claim.
      order.status = 'CANCELLED';
      return null;
    });

    const res = await close([{ productId: PRODUCT_A, quantity: 6, purchasePrice: 5 }]);
    const body = await res.json();

    assert.equal(res.status, 409);
    assert.match(body.message, /cancelled/i);
  });
});
