import test from 'node:test';
import assert from 'node:assert/strict';

import {
  awaitingParentTile,
  notifyParent,
  parentNotifiedLabel,
  splitPendingOrders,
} from './awaitingParent.js';

const pending = (overrides = {}) => ({
  _id: 'p1',
  caretakerMayAnswer: false,
  studentId: { _id: 's1', name: 'Asha Rao', admissionNumber: 'HH7A42', roomNumber: '217' },
  items: [{ productId: 'juice', name: 'Apple Juice', quantity: 2, price: 30 }],
  totalAmount: 60,
  expiresAt: '2026-09-23T18:29:59.000Z',
  createdAt: '2026-09-22T06:00:00.000Z',
  parentNotified: null,
  ...overrides,
});

test('orders the caretaker answers stay in pending approvals; the rest become student order tiles', () => {
  const mine = pending({ _id: 'mine', caretakerMayAnswer: true });
  const parents = pending({ _id: 'parents' });

  const { forCaretaker, awaitingParent } = splitPendingOrders([mine, parents]);
  assert.deepEqual(forCaretaker.map((order) => order._id), ['mine']);
  assert.deepEqual(awaitingParent.map((order) => order._id), ['parents']);
});

test('an awaiting order is drawn like a package tile, at the first step', () => {
  const tile = awaitingParentTile(pending());

  assert.equal(tile.id, 'awaiting-p1');
  assert.equal(tile.status, 'AWAITING_PARENT');
  assert.deepEqual(tile.student, { name: 'Asha Rao', admissionNumber: 'HH7A42', roomNumber: '217' });
  assert.deepEqual(tile.items, [{ productId: 'juice', name: 'Apple Juice', quantity: 2 }]);
  assert.equal(tile.pendingOrder._id, 'p1', 'the order rides along for the WhatsApp message');
});

test('the notified line says where from, who and when, in IST', () => {
  const at = '2026-09-22T06:42:00.000Z';
  assert.equal(parentNotifiedLabel({ at, via: 'KIOSK', by: null }), 'Parent notified via WhatsApp from the kiosk · 22 Sept, 12:12 pm');
  assert.equal(parentNotifiedLabel({ at, via: 'CARETAKER', by: 'Meena' }), 'Parent notified via WhatsApp by Meena · 22 Sept, 12:12 pm');
  assert.equal(parentNotifiedLabel(null), '');
});

const LINK = 'https://wa.me/919876543210?text=hi';

test('a tap records the notification, opens WhatsApp, and hands back the record', async () => {
  const record = { at: '2026-09-22T06:42:00.000Z', via: 'CARETAKER', by: 'Meena' };
  const calls = [];
  const opened = [];
  const result = await notifyParent({
    orderId: 'p1',
    link: LINK,
    post: async (url) => { calls.push(url); return { data: { parentNotified: record } }; },
    open: (link) => { opened.push(link); return true; },
  });

  assert.deepEqual(calls, ['/pending-orders/p1/parent-notified']);
  assert.deepEqual(opened, [LINK]);
  assert.deepEqual(result, { outcome: 'notified', parentNotified: record });
});

test('WhatsApp opens before the record comes back, while the tap is still running', () => {
  const opened = [];
  notifyParent({ orderId: 'p1', link: LINK, post: () => new Promise(() => {}), open: (link) => opened.push(link) });
  assert.equal(opened.length, 1);
});

test('somebody else got there first: the button locks with their record', async () => {
  const record = { at: '2026-09-22T06:42:00.000Z', via: 'KIOSK', by: null };
  const result = await notifyParent({
    orderId: 'p1',
    link: LINK,
    post: async () => { throw { response: { status: 409, data: { code: 'PARENT_ALREADY_NOTIFIED', parentNotified: record } } }; },
    open: () => true,
  });
  assert.deepEqual(result, { outcome: 'notified', parentNotified: record });
});

test('a record that did not go through comes back as failed, with the reason', async () => {
  const result = await notifyParent({
    orderId: 'p1',
    link: LINK,
    post: async () => { throw { response: { status: 409, data: { code: 'ORDER_NOT_WAITING', message: 'This order is no longer waiting for the parent.' } } }; },
    open: () => true,
  });
  assert.deepEqual(result, { outcome: 'failed', message: 'This order is no longer waiting for the parent.' });
});
