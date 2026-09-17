import test from 'node:test';
import assert from 'node:assert/strict';

import { describeEntry, exportableEntries } from './ledgerEntry.js';

const deposit = { _id: 'd', kind: 'TOP_UP', mode: 'Cash', amount: 500 };
const walletOrder = { _id: 'w', kind: 'ORDER_PAYMENT', amount: 120, items: [{ name: 'Chips' }] };
const upiOrder = {
  _id: 'u', kind: 'UPI_ORDER_PAYMENT', amount: 80, items: [{ name: 'Juice' }],
  receiptNumber: 'GMS1408N24068003', orderId: '#E860AB',
};

test('keeps a deposit and an order nobody cancelled', () => {
  assert.deepEqual(exportableEntries([deposit, walletOrder, upiOrder]), [deposit, walletOrder, upiOrder]);
});

test('drops a failed top-up, a refund and a deleted row', () => {
  const rows = [
    { _id: 'f', kind: 'TOPUP_FAILED', amount: 300 },
    { _id: 'r', kind: 'ORDER_CANCELLATION_REFUND', amount: 120 },
    { ...deposit, _id: 'x', deleted: true },
  ];
  assert.deepEqual(exportableEntries(rows), []);
});

test('drops a cancelled wallet order entirely', () => {
  assert.deepEqual(exportableEntries([{ ...walletOrder, refunded: true }]), []);
});

test('lists a cancelled UPI order as the UPI deposit it became', () => {
  const [row] = exportableEntries([{ ...upiOrder, refunded: true }]);
  assert.equal(row.kind, 'TOP_UP');
  assert.equal(row.mode, 'UPI');
  assert.equal(row.amount, 80);
  assert.equal(row.receiptNumber, 'GMS1408N24068003');
  assert.deepEqual(row.items, []);
  assert.equal(describeEntry(row).label, 'UPI Deposit');
  assert.equal(describeEntry(row).direction, 'in');
});
