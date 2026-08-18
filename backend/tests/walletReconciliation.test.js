import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileWallet } from '../utils/walletReconciliation.js';

const student = (pocketMoney = 90) => ({ _id: 'student-1', pocketMoney });
const purchase = (previousBalance, amount, resultingBalance, id = 'purchase-1') => ({
  _id: id,
  kind: 'PURCHASE',
  previousBalance,
  amount,
  resultingBalance,
});
const topUp = (previousBalance, amount, resultingBalance, id = 'topup-1') => ({
  _id: id,
  kind: 'TOP_UP',
  previousBalance,
  amount,
  resultingBalance,
});

test('reconciles a continuous mixed wallet ledger', () => {
  const result = reconcileWallet(student(90), [
    topUp(0, 100, 100),
    purchase(100, 30, 70),
    topUp(70, 20, 90, 'topup-2'),
  ]);

  assert.deepEqual(result.issues, []);
  assert.equal(result.eventCount, 3);
});

test('reports arithmetic, continuity, and projection failures separately', () => {
  const result = reconcileWallet(student(65), [
    topUp(0, 100, 90),
    purchase(80, 20, 60),
  ]);

  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ['INVALID_LEDGER_ARITHMETIC', 'LEDGER_GAP', 'PROJECTION_MISMATCH']
  );
});

test('flags a non-zero wallet with no durable ledger', () => {
  const result = reconcileWallet(student(50), []);
  assert.deepEqual(result.issues, [{ code: 'NO_LEDGER_FOR_BALANCE', projectedBalance: 50 }]);
});

test('accepts an unused zero-balance wallet', () => {
  assert.deepEqual(reconcileWallet(student(0), []).issues, []);
});

test('treats cancellation refunds as wallet credits', () => {
  const result = reconcileWallet(student(90), [
    topUp(0, 100, 100),
    purchase(100, 50, 50),
    { _id: 'refund-1', kind: 'REFUND', previousBalance: 50, amount: 40, resultingBalance: 90 },
  ]);
  assert.deepEqual(result.issues, []);
});
