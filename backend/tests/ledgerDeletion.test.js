/* Deleting a wallet row off the Transactions page: the row is marked, never
 * removed, and its money moves back. No database — model calls are stubbed,
 * as in refunds.test.js.
 */
import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { deleteLedgerEntry } = await import('../utils/ledgerDeletion.js');
const { cancelAndRefundFulfillment } = await import('../utils/refunds.js');
const { buildMovementRows, movementTotals } = await import(
  '../src/application/accounting/movementRows.js'
);
const { signAdminToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const MAKER_ID = '507f1f77bcf86cd799439012';
const STUDENT_ID = '507f191e810c19729de860eb';
const DEPOSIT_ID = '507f191e810c19729de860ef';
const CHARGE_ID = '507f191e810c19729de860ee';

const lean = (value) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  lean: async () => value,
});

const admins = { [ADMIN_ID]: { _id: ADMIN_ID, name: 'Stephen B' }, [MAKER_ID]: { _id: MAKER_ID, name: 'Bharat' } };

const deposit = (extra = {}) => ({
  _id: DEPOSIT_ID, studentId: STUDENT_ID, source: 'ADMIN', amount: 500,
  performedBy: MAKER_ID, deletion: null, ...extra,
});
const charge = (extra = {}) => ({
  _id: CHARGE_ID, studentId: STUDENT_ID, sourceType: 'DIRECT_CHECKOUT', totalAmount: 40,
  deletion: null, ...extra,
});

const stubAdmins = () => mock.method(Admin, 'findById', (id) => lean(admins[String(id)] || null));

afterEach(() => mock.restoreAll());

describe('deleting a cash deposit', () => {
  test('takes the money back out and records both people and the reason', async () => {
    stubAdmins();
    mock.method(WalletAdjustment, 'findOne', () => lean(deposit()));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 100 }));
    const mark = mock.method(WalletAdjustment, 'findOneAndUpdate', async () => ({ _id: DEPOSIT_ID }));

    const result = await deleteLedgerEntry({
      kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: '  Typed 500 instead of 50  ',
    });

    // Only while the wallet still holds it.
    assert.deepEqual(wallet.mock.calls[0].arguments[0], { _id: STUDENT_ID, pocketMoney: { $gte: 500 } });
    assert.deepEqual(wallet.mock.calls[0].arguments[1], { $inc: { pocketMoney: -500 } });
    // Claimed only if nobody deleted it first.
    assert.deepEqual(mark.mock.calls[0].arguments[0], { _id: DEPOSIT_ID, deletion: null });
    const { deletion } = mark.mock.calls[0].arguments[1].$set;
    assert.equal(deletion.byName, 'Stephen B');
    assert.equal(String(deletion.by), ADMIN_ID);
    assert.equal(deletion.madeBy, 'Bharat');
    assert.equal(deletion.reason, 'Typed 500 instead of 50');
    assert.deepEqual([deletion.previousBalance, deletion.newBalance], [600, 100]);
    assert.equal(result.balance, 100);
  });

  test('refuses once the deposit has been spent, and changes nothing', async () => {
    stubAdmins();
    mock.method(WalletAdjustment, 'findOne', () => lean(deposit()));
    mock.method(Student, 'findOneAndUpdate', async () => null);
    mock.method(Student, 'findById', () => lean({ _id: STUDENT_ID, pocketMoney: 120 }));
    const mark = mock.method(WalletAdjustment, 'findOneAndUpdate', async () => null);

    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'Wrong student' }),
      (error) => error.status === 409 && /already been spent/.test(error.message)
    );
    assert.equal(mark.mock.callCount(), 0);
  });

  test('refuses a second deletion', async () => {
    mock.method(WalletAdjustment, 'findOne', () => lean(deposit({ deletion: { reason: 'x' } })));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 0 }));

    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'Again' }),
      (error) => error.status === 409
    );
    assert.equal(wallet.mock.callCount(), 0);
  });

  test('puts the money back when a concurrent delete wins the claim', async () => {
    stubAdmins();
    mock.method(WalletAdjustment, 'findOne', () => lean(deposit()));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 100 }));
    mock.method(WalletAdjustment, 'findOneAndUpdate', async () => null);

    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'Race' }),
      (error) => error.status === 409
    );
    assert.equal(wallet.mock.callCount(), 2);
    assert.deepEqual(wallet.mock.calls[1].arguments[1], { $inc: { pocketMoney: 500 } });
  });

  test('never reaches a UPI deposit', async () => {
    const find = mock.method(WalletAdjustment, 'findOne', () => lean(null));

    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'No' }),
      (error) => error.status === 404
    );
    assert.deepEqual(find.mock.calls[0].arguments[0].source, { $ne: 'PARENT_UPI' });
  });

  test('needs a reason and a deletable kind', async () => {
    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'CASH_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: '   ' }),
      (error) => error.status === 400 && /why/.test(error.message)
    );
    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'UPI_DEPOSIT', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'x' }),
      (error) => error.status === 400
    );
    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'REFUND', id: DEPOSIT_ID, actorId: ADMIN_ID, reason: 'x' }),
      (error) => error.status === 400
    );
  });
});

describe('deleting a wallet charge', () => {
  test('puts the money back and names the kiosk as its maker', async () => {
    stubAdmins();
    mock.method(Transaction, 'findOne', () => lean(charge()));
    mock.method(WalletReversal, 'exists', async () => null);
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 90 }));
    const mark = mock.method(Transaction, 'findOneAndUpdate', async () => ({ _id: CHARGE_ID }));

    await deleteLedgerEntry({ kind: 'WALLET_DEDUCTION', id: CHARGE_ID, actorId: ADMIN_ID, reason: 'Test sale' });

    assert.deepEqual(wallet.mock.calls[0].arguments[1], { $inc: { pocketMoney: 40 } });
    const { deletion } = mark.mock.calls[0].arguments[1].$set;
    assert.equal(deletion.madeBy, 'Student at kiosk');
    assert.deepEqual([deletion.previousBalance, deletion.newBalance], [50, 90]);
  });

  test('refuses a charge a refund already gave back', async () => {
    mock.method(Transaction, 'findOne', () => lean(charge()));
    mock.method(WalletReversal, 'exists', async () => ({ _id: 'r' }));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 90 }));

    await assert.rejects(
      () => deleteLedgerEntry({ kind: 'WALLET_DEDUCTION', id: CHARGE_ID, actorId: ADMIN_ID, reason: 'Twice' }),
      (error) => error.status === 409 && /refunded/.test(error.message)
    );
    assert.equal(wallet.mock.callCount(), 0);
  });

  test('cannot then be refunded, so its money never comes back twice', async () => {
    const order = { _id: '507f191e810c19729de860e0', status: 'PENDING', transactionId: CHARGE_ID, studentId: STUDENT_ID };
    mock.method(WalletReversal, 'findOne', async () => null);
    mock.method(FulfillmentOrder, 'findById', async () => order);
    mock.method(FulfillmentOrder, 'findOneAndUpdate', async () => ({ ...order, status: 'CANCELLED' }));
    mock.method(Transaction, 'findById', async () => ({
      ...charge({ deletion: { reason: 'Test sale' } }), items: [],
    }));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 90 }));
    const stock = mock.method(Inventory, 'updateOne', async () => ({}));

    await assert.rejects(
      () => cancelAndRefundFulfillment({
        orderId: order._id, actorId: ADMIN_ID, idempotencyKey: 'after-delete', reason: 'Cancel',
      }),
      (error) => error.status === 409 && /deleted/.test(error.message)
    );
    assert.equal(wallet.mock.callCount(), 0);
    assert.equal(stock.mock.callCount(), 0);
  });
});

describe('deleted rows on the Transactions page', () => {
  const at = (iso) => new Date(iso);

  test('are marked, not deletable again, and left out of the totals', () => {
    const rows = buildMovementRows({
      adjustments: [
        {
          _id: 'a1', studentId: STUDENT_ID, source: 'ADMIN', amount: 500, createdAt: at('2026-09-17T06:00:00Z'),
          deletion: { at: at('2026-09-17T07:00:00Z'), byName: 'Stephen B', madeBy: 'Bharat', reason: 'Typo' },
        },
        { _id: 'a2', studentId: STUDENT_ID, source: 'ADMIN', amount: 50, createdAt: at('2026-09-17T06:30:00Z') },
        { _id: 'a3', studentId: STUDENT_ID, source: 'PARENT_UPI', amount: 70, createdAt: at('2026-09-17T06:40:00Z') },
      ],
      transactions: [
        { _id: 't1', studentId: STUDENT_ID, sourceType: 'DIRECT_CHECKOUT', totalAmount: 20, createdAt: at('2026-09-17T08:00:00Z') },
        { _id: 't2', studentId: STUDENT_ID, sourceType: 'DIRECT_CHECKOUT', totalAmount: 30, createdAt: at('2026-09-17T08:10:00Z') },
      ],
      refundedIds: new Set(['t2']),
    });

    assert.deepEqual(rows.map((row) => [row.id, row.deleted, row.deletable]), [
      ['a1', true, false],
      ['a2', false, true],
      ['a3', false, false],
      ['t1', false, true],
      ['t2', false, false],
    ]);
    assert.deepEqual(rows[0].deletion, {
      at: '2026-09-17T07:00:00.000Z', byName: 'Stephen B', madeBy: 'Bharat', reason: 'Typo',
    });
    assert.deepEqual(movementTotals(rows), { in: 120, out: 50, net: 70, count: 4 });
  });
});

describe('POST /v1/accounting-exports/movements/:id/delete', () => {
  let base;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  const send = (body) =>
    fetch(`${base}/api/v1/accounting-exports/movements/${DEPOSIT_ID}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signAdminToken(ADMIN_ID)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('deletes as the signed-in admin and answers with the mark', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    stubAdmins();
    mock.method(WalletAdjustment, 'findOne', () => lean(deposit()));
    mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 0 }));
    mock.method(WalletAdjustment, 'findOneAndUpdate', async () => ({ _id: DEPOSIT_ID }));

    const response = await send({ kind: 'CASH_DEPOSIT', reason: 'Duplicate entry' });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.deletion.byName, 'Stephen B');
    assert.equal(body.data.deletion.madeBy, 'Bharat');
    assert.equal(body.data.deletion.reason, 'Duplicate entry');
    assert.equal(body.data.deletion.previousBalance, undefined);
  });

  test('are left out of the Tally exports', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const charges = mock.method(Transaction, 'find', () => lean([]));
    const deposits = mock.method(WalletAdjustment, 'find', () => lean([]));
    mock.method(WalletReversal, 'find', () => lean([]));

    for (const file of ['tally.csv', 'tally.xml']) {
      const response = await fetch(`${base}/api/v1/accounting-exports/${file}?from=2026-09-17&to=2026-09-17`, {
        headers: { Authorization: `Bearer ${signAdminToken(ADMIN_ID)}` },
      });
      assert.equal(response.status, 200);
    }
    for (const call of [...charges.mock.calls, ...deposits.mock.calls]) {
      assert.equal(call.arguments[0].deletion, null);
    }
    assert.equal(charges.mock.callCount(), 2);
  });

  test('answers a refusal with its reason', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const response = await send({ kind: 'CASH_DEPOSIT', reason: '' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /why/);
  });
});
