import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { MOVEMENT_TYPES } from '../src/application/accounting/movementTypes.js';
import {
  exportChargeFilter,
  realMovements,
} from '../src/application/accounting/realMovements.js';

const at = new Date('2026-08-14T06:00:00.000Z');

const walletCharge = {
  _id: 'c-wallet', studentId: 's1', totalAmount: 120, sourceType: 'DIRECT_CHECKOUT', createdAt: at,
};
const upiCharge = {
  _id: 'c-upi', studentId: 's1', totalAmount: 80, sourceType: 'UPI_ORDER_PAYMENT',
  receiptNumber: 'GMS1408N24068003', createdAt: at,
};
const deposit = { _id: 'a1', studentId: 's1', source: 'ADMIN', amount: 500, createdAt: at };

describe('real movements for the exports', () => {
  test('keeps a charge nobody cancelled', () => {
    const out = realMovements({
      transactions: [walletCharge, upiCharge], adjustments: [deposit],
      cancelledIds: new Set(), included: MOVEMENT_TYPES,
    });
    assert.deepEqual(out.transactions, [walletCharge, upiCharge]);
    assert.deepEqual(out.adjustments, [deposit]);
  });

  test('drops a cancelled wallet charge entirely', () => {
    const out = realMovements({
      transactions: [walletCharge], adjustments: [],
      cancelledIds: new Set(['c-wallet']), included: MOVEMENT_TYPES,
    });
    assert.deepEqual(out.transactions, []);
    assert.deepEqual(out.adjustments, []);
  });

  test('files a cancelled UPI order as the UPI deposit it became', () => {
    const out = realMovements({
      transactions: [upiCharge], adjustments: [],
      cancelledIds: new Set(['c-upi']), included: MOVEMENT_TYPES,
    });
    assert.deepEqual(out.transactions, []);
    assert.deepEqual(out.adjustments, [{
      _id: 'c-upi', studentId: 's1', source: 'PARENT_UPI', amount: 80,
      receiptNumber: 'GMS1408N24068003', createdAt: at,
    }]);
  });

  test('keeps that deposit only when UPI deposits were asked for', () => {
    const out = realMovements({
      transactions: [upiCharge], adjustments: [],
      cancelledIds: new Set(['c-upi']), included: ['UPI_ORDER_PAYMENT'],
    });
    assert.deepEqual(out.adjustments, []);
    assert.deepEqual(out.transactions, []);
  });

  test('leaves out a UPI order read only to find cancelled ones', () => {
    const out = realMovements({
      transactions: [upiCharge], adjustments: [],
      cancelledIds: new Set(), included: ['UPI_DEPOSIT'],
    });
    assert.deepEqual(out.transactions, []);
    assert.deepEqual(out.adjustments, []);
  });

  test('keeps the deposits sorted with the converted ones among them', () => {
    const early = { ...deposit, _id: 'a0', createdAt: new Date('2026-08-14T05:00:00.000Z') };
    const late = { ...deposit, _id: 'a2', createdAt: new Date('2026-08-14T07:00:00.000Z') };
    const out = realMovements({
      transactions: [upiCharge], adjustments: [early, late],
      cancelledIds: new Set(['c-upi']), included: MOVEMENT_TYPES,
    });
    assert.deepEqual(out.adjustments.map((row) => row._id), ['a0', 'c-upi', 'a2']);
  });
});

describe('which charges an export reads', () => {
  test('reads UPI orders when only UPI deposits were asked for', () => {
    assert.deepEqual(exportChargeFilter(['UPI_DEPOSIT']), { sourceType: 'UPI_ORDER_PAYMENT' });
  });

  test('reads every charge when wallet deductions and UPI deposits were asked for', () => {
    assert.deepEqual(exportChargeFilter(['UPI_DEPOSIT', 'WALLET_DEDUCTION']), {});
  });

  test('reads only wallet charges for wallet deductions alone', () => {
    assert.deepEqual(exportChargeFilter(['WALLET_DEDUCTION']), {
      sourceType: { $ne: 'UPI_ORDER_PAYMENT' },
    });
  });

  test('reads no charges for cash deposits or refunds alone', () => {
    assert.equal(exportChargeFilter(['CASH_DEPOSIT', 'REFUND']), null);
  });
});
