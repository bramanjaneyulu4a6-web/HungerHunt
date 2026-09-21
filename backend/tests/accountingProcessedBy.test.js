/* Narrowing an export or the Transactions feed to the people who handled the
 * rows, and the list of people it can be narrowed to.
 *
 * No database: the parser and the narrowing are pure, and the routes' model
 * calls are stubbed.
 */
import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { NO_STAFF, narrowByProcessedBy, parseProcessedBy } = await import(
  '../src/application/accounting/processedBy.js'
);
const { collectionFilters, MOVEMENT_TYPES } = await import(
  '../src/application/accounting/movementTypes.js'
);
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';
const GONE_ID = '507f1f77bcf86cd799439013';
const adminToken = signAdminToken(ADMIN_ID);
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');

describe('who an export was asked for', () => {
  test('an absent or empty parameter is everyone', () => {
    assert.equal(parseProcessedBy(undefined), null);
    assert.equal(parseProcessedBy(''), null);
    assert.equal(parseProcessedBy('  '), null);
  });

  test('reads staff ids and the no-staff marker', () => {
    assert.deepEqual(parseProcessedBy(` ${ADMIN_ID} ,${NO_STAFF},${ADMIN_ID}`), {
      staffIds: [ADMIN_ID],
      none: true,
    });
  });

  test('refuses anything that is not an id, rather than exporting less', () => {
    assert.throws(() => parseProcessedBy('Bharat'), (error) => /Unknown staff id/.test(error.details?.[0]?.message));
  });

  test('refuses a list that names nobody', () => {
    assert.throws(() => parseProcessedBy(','), (error) => /at least one person/.test(error.details?.[0]?.message));
  });
});

describe('narrowing the collections to those people', () => {
  const all = collectionFilters(MOVEMENT_TYPES);

  test('everyone leaves the filters untouched', () => {
    assert.equal(narrowByProcessedBy(all, null), all);
  });

  // A charge has a person only when a caretaker approved it for the parent.
  test('staff alone reads their deposits, refunds and the orders they approved', () => {
    assert.deepEqual(narrowByProcessedBy(all, { staffIds: [ADMIN_ID], none: false }), {
      adjustments: { performedBy: { $in: [ADMIN_ID] } },
      reversals: { performedBy: { $in: [ADMIN_ID] } },
      transactions: { performedBy: { $in: [ADMIN_ID] } },
    });
  });

  test('no staff reads the charges and the rows with nobody behind them', () => {
    assert.deepEqual(narrowByProcessedBy(all, { staffIds: [], none: true }), {
      adjustments: { performedBy: { $in: [null] } },
      reversals: { performedBy: { $in: [null] } },
      transactions: { performedBy: { $in: [null] } },
    });
  });

  test('never reads a collection the type selection left out', () => {
    const cashOnly = collectionFilters(['CASH_DEPOSIT']);
    assert.deepEqual(narrowByProcessedBy(cashOnly, { staffIds: [ADMIN_ID], none: true }), {
      adjustments: { source: { $ne: 'PARENT_UPI' }, performedBy: { $in: [ADMIN_ID, null] } },
      reversals: null,
      transactions: null,
    });
  });
});

const query = (rows) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  async lean() { return rows; },
});

describe('the routes', () => {
  let base;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  afterEach(() => mock.restoreAll());

  const get = (path, token = adminToken) =>
    fetch(`${base}/api/v1/accounting-exports/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  test('the staff list is admin-only', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const denied = await get('staff', warehouseToken);
    assert.equal(denied.status, 403);
  });

  test('the staff list names everyone who handled money, and a leaver as former staff', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(WalletAdjustment, 'distinct', async () => [ADMIN_ID, null, OTHER_ID]);
    mock.method(WalletReversal, 'distinct', async () => [GONE_ID, ADMIN_ID]);
    // A caretaker who approved an order for a parent handled money too.
    mock.method(Transaction, 'distinct', async () => [null, OTHER_ID]);
    mock.method(Admin, 'find', () => query([
      { _id: ADMIN_ID, name: 'Bharat' },
      { _id: OTHER_ID, name: 'Anitha' },
    ]));

    const response = await get('staff');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data, [
      { id: OTHER_ID, name: 'Anitha' },
      { id: ADMIN_ID, name: 'Bharat' },
      { id: GONE_ID, name: 'Former staff' },
    ]);
  });

  test('a staff filter on the CSV reads only their own charges and deposits', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const charges = mock.method(Transaction, 'find', () => query([]));
    const deposits = mock.method(WalletAdjustment, 'find', () => query([]));
    mock.method(WalletReversal, 'find', () => query([]));
    mock.method(FulfillmentOrder, 'find', () => query([]));

    const response = await get(`tally.csv?from=2026-08-14&to=2026-08-14&processedBy=${ADMIN_ID}`);
    assert.equal(response.status, 200);
    assert.deepEqual(charges.mock.calls[0].arguments[0].performedBy, { $in: [ADMIN_ID] });
    assert.deepEqual(deposits.mock.calls[0].arguments[0].performedBy, { $in: [ADMIN_ID] });
  });

  test('a malformed staff filter is a 400, not a smaller file', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const response = await get('tally.csv?from=2026-08-14&to=2026-08-14&processedBy=Bharat');
    assert.equal(response.status, 400);
  });
});
