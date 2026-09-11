import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { MOVEMENT_TYPES, parseIncluded, collectionFilters } = await import(
  '../src/application/accounting/movementTypes.js'
);

describe('which movements an export was asked for', () => {
  test('an absent include means every type, so an older caller is unchanged', () => {
    assert.deepEqual(parseIncluded(undefined), MOVEMENT_TYPES);
    assert.deepEqual(parseIncluded(''), MOVEMENT_TYPES);
  });

  test('reads a comma-separated list, trimming what a URL carried', () => {
    assert.deepEqual(parseIncluded(' CASH_DEPOSIT , REFUND '), ['CASH_DEPOSIT', 'REFUND']);
  });

  test('keeps the canonical order however the list was written', () => {
    assert.deepEqual(
      parseIncluded('REFUND,CASH_DEPOSIT'),
      ['CASH_DEPOSIT', 'REFUND']
    );
  });

  test('names a type it does not recognise rather than dropping it', () => {
    // Silently exporting half a month because of a typo is the failure that
    // costs an accountant a day; a 400 costs a retry.
    assert.throws(() => parseIncluded('CASH_DEPOSIT,DONATIONS'), (error) => {
      assert.equal(error.status, 400);
      assert.match(JSON.stringify(error.details), /DONATIONS/);
      return true;
    });
  });

  test('refuses a selection of nothing', () => {
    assert.throws(() => parseIncluded('   ,  '), (error) => {
      assert.equal(error.status, 400);
      return true;
    });
  });
});

describe('what each selection asks of each collection', () => {
  test('everything selected filters nothing', () => {
    assert.deepEqual(collectionFilters(MOVEMENT_TYPES), {
      adjustments: {},
      transactions: {},
      reversals: {},
    });
  });

  test('a collection with nothing selected is not queried at all', () => {
    assert.deepEqual(collectionFilters(['REFUND']), {
      adjustments: null,
      transactions: null,
      reversals: {},
    });
  });

  /* A deposit row written before `source` existed carries no value for it, and
     the ledger reads anything that is not PARENT_UPI as cash. Matching on
     $ne rather than on 'ADMIN' keeps those rows in the cash export instead of
     dropping them out of both. */
  test('cash deposits claim every row the ledger calls cash', () => {
    assert.deepEqual(collectionFilters(['CASH_DEPOSIT']).adjustments, {
      source: { $ne: 'PARENT_UPI' },
    });
  });

  test('UPI deposits ask for exactly the gateway rows', () => {
    assert.deepEqual(collectionFilters(['UPI_DEPOSIT']).adjustments, {
      source: 'PARENT_UPI',
    });
  });

  test('wallet deductions claim every charge that is not gateway funded', () => {
    assert.deepEqual(collectionFilters(['WALLET_DEDUCTION']).transactions, {
      sourceType: { $ne: 'UPI_ORDER_PAYMENT' },
    });
  });

  test('UPI order payments ask for exactly the gateway-funded charges', () => {
    assert.deepEqual(collectionFilters(['UPI_ORDER_PAYMENT']).transactions, {
      sourceType: 'UPI_ORDER_PAYMENT',
    });
  });

  test('both halves of a collection selected drops the discriminator', () => {
    assert.deepEqual(collectionFilters(['CASH_DEPOSIT', 'UPI_DEPOSIT']).adjustments, {});
    assert.deepEqual(
      collectionFilters(['WALLET_DEDUCTION', 'UPI_ORDER_PAYMENT']).transactions,
      {}
    );
  });
});
