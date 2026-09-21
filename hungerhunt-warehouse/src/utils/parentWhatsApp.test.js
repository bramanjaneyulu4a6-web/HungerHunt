import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARENT_APP_URL,
  composeCaretakerReviewMessage,
  composeParentApprovalMessage,
  notifyParentWhatsAppLink,
  whatsAppNumber,
} from './parentWhatsApp.js';

const ORDER = {
  items: [
    { name: "Lay's Classic", quantity: 2, price: 20 },
    { name: 'Frooti', quantity: 1, price: 12.5 },
  ],
  totalAmount: 52.5,
  expiresAt: '2026-09-22T18:29:59.000Z',
  studentId: { name: 'Ravi Kumar' },
  parentId: { phone: '9000000021' },
  caretakerMayAnswer: true,
};

describe("the caretaker's WhatsApp to the parent", () => {
  const message = composeCaretakerReviewMessage({ studentName: 'Ravi Kumar', order: ORDER });

  test('names the child and lists the cart and total', () => {
    assert.match(message, /Your child \*Ravi Kumar\* has just placed an order/);
    assert.match(message, /1\. Lay's Classic — 2 × ₹20 = ₹40/);
    assert.match(message, /2\. Frooti — ₹12\.50/);
    assert.match(message, /\*Total: ₹52\.50\*/);
  });

  test('says the caretaker reviews it, by when, and how to take it back', () => {
    assert.match(message, /The room caretaker will review this order before 22 Sept, 11:59 pm/);
    assert.match(message, /Contact the caretaker for any changes/);
  });

  test('ends with the parent app link on a line of its own', () => {
    assert.ok(message.endsWith(`Open the Hunger Hunt parent app:\n${PARENT_APP_URL}`));
    assert.equal(PARENT_APP_URL, 'https://hunger-hunt-parent.vercel.app');
  });
});

describe('when the parent still answers it', () => {
  const message = composeParentApprovalMessage({ studentName: 'Ravi Kumar', order: ORDER });

  test('asks the parent to accept or decline, by when, and links the app', () => {
    assert.match(message, /\*Hunger Hunt — order waiting for your approval\*/);
    assert.match(message, /\*accept\* or \*decline\* it before 22 Sept, 11:59 pm\./);
    assert.match(message, /\*Total: ₹52\.50\*/);
    assert.ok(message.endsWith(`Open the Hunger Hunt parent app:\n${PARENT_APP_URL}`));
  });
});

describe('the link', () => {
  const textOf = (link) => decodeURIComponent(link.split('?text=')[1]);

  test("is addressed to the parent's number with the caretaker-review message", () => {
    const link = notifyParentWhatsAppLink(ORDER);
    assert.ok(link.startsWith('https://wa.me/919000000021?text='));
    assert.equal(textOf(link), composeCaretakerReviewMessage({ studentName: 'Ravi Kumar', order: ORDER }));
  });

  test('carries the accept-or-decline message when the order is still the parent\'s', () => {
    const order = { ...ORDER, caretakerMayAnswer: false };
    assert.equal(textOf(notifyParentWhatsAppLink(order)), composeParentApprovalMessage({ studentName: 'Ravi Kumar', order }));
  });

  test('is not made without a usable number', () => {
    assert.equal(notifyParentWhatsAppLink({ ...ORDER, parentId: null }), '');
    assert.equal(notifyParentWhatsAppLink({ ...ORDER, parentId: { phone: '123' } }), '');
    assert.equal(whatsAppNumber('+91 90000 00021'), '919000000021');
  });
});
