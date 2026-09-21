import { describe, expect, test, vi } from 'vitest';

import { notifyParent } from './notifyParent';

const LINK = 'https://wa.me/919876543210?text=hi';

describe('notifyParent', () => {
  test('records the tap for this order and opens WhatsApp', async () => {
    const post = vi.fn(() => Promise.resolve({ data: {} }));
    const open = vi.fn(() => true);

    await expect(notifyParent({ orderId: 'o1', link: LINK, post, open })).resolves.toBe('notified');
    expect(post).toHaveBeenCalledWith('/pending-orders/o1/parent-notified');
    expect(open).toHaveBeenCalledWith(LINK);
  });

  // Opened in the same tick as the tap, not after the request comes back:
  // a browser only lets a click open a new tab while the click is running.
  test('opens WhatsApp before the record has come back', () => {
    const post = vi.fn(() => new Promise(() => {}));
    const open = vi.fn(() => true);

    notifyParent({ orderId: 'o1', link: LINK, post, open });
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('an order somebody already notified counts as notified', async () => {
    const post = vi.fn(() => Promise.reject({ response: { status: 409, data: { code: 'PARENT_ALREADY_NOTIFIED' } } }));

    await expect(notifyParent({ orderId: 'o1', link: LINK, post, open: () => true })).resolves.toBe('notified');
  });

  test('a record that did not go through is reported, so the button can come back', async () => {
    const post = vi.fn(() => Promise.reject(new Error('Network Error')));

    await expect(notifyParent({ orderId: 'o1', link: LINK, post, open: () => true })).resolves.toBe('failed');
  });

  test('nothing is recorded or opened without an order and a link', async () => {
    const post = vi.fn();
    const open = vi.fn();

    await expect(notifyParent({ orderId: '', link: LINK, post, open })).resolves.toBe('failed');
    await expect(notifyParent({ orderId: 'o1', link: '', post, open })).resolves.toBe('failed');
    expect(post).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
