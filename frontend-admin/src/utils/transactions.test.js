import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeFilterCount,
  availableFilters,
  emptyFilters,
  filterRows,
  inTab,
  staffIn,
  nextSort,
  periodRange,
  rangeLabel,
  rangeProblem,
  sortRows,
} from './transactions.js';

const row = (overrides) => ({
  id: 'x', kind: 'CASH_DEPOSIT', group: 'DEPOSIT', mode: 'Cash', at: '2026-09-12T04:00:00.000Z',
  amount: 100, signedAmount: 100, receiptNumber: null, reference: null, processedBy: null,
  balanceAfter: null, note: '', student: { name: 'Aarav', admissionNumber: 'N1', className: 'X', section: 'A', roomNumber: 'R1' },
  ...overrides,
});

test('tabs split deposits from the sales side', () => {
  assert.equal(inTab(row({ group: 'DEPOSIT' }), 'deposits'), true);
  assert.equal(inTab(row({ group: 'DEDUCTION' }), 'deposits'), false);
  assert.equal(inTab(row({ group: 'DEDUCTION' }), 'deductions'), true);
  assert.equal(inTab(row({ group: 'DEPOSIT' }), 'all'), true);
});

test('sorts by time ascending by default and flips on a second click', () => {
  const rows = [row({ id: 'b', at: '2026-09-12T05:00:00.000Z' }), row({ id: 'a', at: '2026-09-12T04:00:00.000Z' })];
  assert.deepEqual(sortRows(rows).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(sortRows(rows, { key: 'at', direction: 'desc' }).map((r) => r.id), ['b', 'a']);
  assert.deepEqual(nextSort({ key: 'at', direction: 'asc' }, 'at'), { key: 'at', direction: 'desc' });
  assert.deepEqual(nextSort({ key: 'at', direction: 'desc' }, 'amount'), { key: 'amount', direction: 'asc' });
});

test('sorts amounts as numbers and names without regard to case', () => {
  const byAmount = sortRows(
    [row({ id: 'k', signedAmount: 1000 }), row({ id: 'm', signedAmount: -250 }), row({ id: 't', signedAmount: 10 })],
    { key: 'amount', direction: 'desc' }
  );
  assert.deepEqual(byAmount.map((r) => r.id), ['k', 't', 'm']);

  const byName = sortRows(
    [row({ id: 'b', student: { name: 'bharat' } }), row({ id: 'a', student: { name: 'Aarav' } })],
    { key: 'student' }
  );
  assert.deepEqual(byName.map((r) => r.id), ['a', 'b']);
});

const f = (overrides) => ({ ...emptyFilters(), ...overrides });

test('filters by tab, kinds, modes, amount, staff and a search over the things a person quotes', () => {
  const rows = [
    row({ id: 'dep', kind: 'CASH_DEPOSIT', group: 'DEPOSIT', mode: 'Cash', amount: 1000, signedAmount: 1000, receiptNumber: 'GMS1209N1001', processedBy: 'Santosh' }),
    row({ id: 'pay', kind: 'WALLET_DEDUCTION', group: 'DEDUCTION', mode: 'Wallet', reference: '#AB12CD', amount: 50, signedAmount: -50 }),
    row({ id: 'ref', kind: 'REFUND', group: 'DEDUCTION', mode: 'Refund', processedBy: 'Bharat', amount: 50, signedAmount: -50 }),
  ];
  assert.deepEqual(filterRows(rows, { tab: 'deductions' }).map((r) => r.id), ['pay', 'ref']);
  assert.deepEqual(filterRows(rows, { filters: f({ kinds: ['REFUND', 'CASH_DEPOSIT'] }) }).map((r) => r.id), ['dep', 'ref']);
  assert.deepEqual(filterRows(rows, { filters: f({ modes: ['Cash'] }) }).map((r) => r.id), ['dep']);
  assert.deepEqual(filterRows(rows, { filters: f({ min: '100' }) }).map((r) => r.id), ['dep']);
  assert.deepEqual(filterRows(rows, { filters: f({ max: '60' }) }).map((r) => r.id), ['pay', 'ref']);
  assert.deepEqual(filterRows(rows, { filters: f({ processedBy: 'Bharat' }) }).map((r) => r.id), ['ref']);
  assert.deepEqual(filterRows(rows, { query: 'gms1209' }).map((r) => r.id), ['dep']);
  assert.deepEqual(filterRows(rows, { query: '#ab12' }).map((r) => r.id), ['pay']);
  assert.deepEqual(filterRows(rows, { query: 'bharat' }).map((r) => r.id), ['ref']);
  // Amounts are not searched: "50" must not pull the two ₹50 rows.
  assert.deepEqual(filterRows(rows, { query: '50' }), []);
  assert.deepEqual(staffIn(rows), ['Bharat', 'Santosh']);
});

test('each tab offers only the kinds and modes its rows can carry', () => {
  assert.deepEqual(availableFilters('deposits'), { kinds: ['CASH_DEPOSIT', 'UPI_DEPOSIT'], modes: ['Cash', 'UPI'] });
  assert.deepEqual(availableFilters('deductions'), {
    kinds: ['WALLET_DEDUCTION', 'UPI_ORDER_PAYMENT', 'REFUND'],
    modes: ['UPI', 'Wallet', 'Refund'],
  });
  assert.equal(availableFilters('all').kinds.length, 5);
});

test('counts the filter groups in use, not the boxes ticked', () => {
  assert.equal(activeFilterCount(emptyFilters()), 0);
  assert.equal(activeFilterCount(f({ kinds: ['REFUND', 'CASH_DEPOSIT'], min: '10' })), 2);
  assert.equal(activeFilterCount(f({ processedBy: 'Bharat', modes: ['UPI'] })), 2);
});

test('quick periods resolve in the school day, not the browser day', () => {
  // 11:30pm UTC on the 11th is already the 12th in Kolkata.
  const late = new Date('2026-09-11T23:30:00.000Z');
  assert.deepEqual(periodRange('today', late), { from: '2026-09-12', to: '2026-09-12' });
  assert.deepEqual(periodRange('yesterday', late), { from: '2026-09-11', to: '2026-09-11' });
  // 12 Sep 2026 is a Saturday; the week started on Sunday the 6th.
  assert.deepEqual(periodRange('week', late), { from: '2026-09-06', to: '2026-09-12' });
  assert.deepEqual(periodRange('month', late), { from: '2026-09-01', to: '2026-09-12' });
});

test('labels a day and a span the way the office reads them', () => {
  assert.equal(rangeLabel({ from: '2026-09-12', to: '2026-09-12' }), '12 Sep 2026');
  assert.equal(rangeLabel({ from: '2026-09-01', to: '2026-09-12' }), '1 Sep – 12 Sep 2026');
  assert.equal(rangeLabel({ from: '2025-12-30', to: '2026-01-02' }), '30 Dec 2025 – 2 Jan 2026');
});

test('refuses a backwards or half-filled period', () => {
  assert.equal(rangeProblem({ from: '2026-09-12', to: '2026-09-01' }), 'The end date is before the start date.');
  assert.equal(rangeProblem({ from: '', to: '2026-09-01' }), 'Choose both dates.');
  assert.equal(rangeProblem({ from: '2026-09-01', to: '2026-09-12' }), null);
});
