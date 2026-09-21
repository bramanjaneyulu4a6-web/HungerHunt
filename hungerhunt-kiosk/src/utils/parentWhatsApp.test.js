import { describe, expect, test } from 'vitest';

import { PARENT_APP_URL, approvalWhatsAppLink, composeApprovalMessage, whatsAppNumber } from './parentWhatsApp';

const ORDER = {
  items: [
    { name: "Lay's Classic", quantity: 2, price: 20 },
    { name: 'Frooti', quantity: 1, price: 12.5 },
  ],
  totalAmount: 52.5,
  expiresAt: '2026-09-22T09:45:00.000Z',
};

describe('the parent\'s number', () => {
  test('a stored ten-digit mobile gains the Indian country code', () => {
    expect(whatsAppNumber('9000000021')).toBe('919000000021');
  });

  test('a leading 0, a +91 or spacing are all read as the same number', () => {
    expect(whatsAppNumber('09000000021')).toBe('919000000021');
    expect(whatsAppNumber('+91 90000 00021')).toBe('919000000021');
  });

  test('anything else makes no link rather than a wrong one', () => {
    expect(whatsAppNumber('')).toBe('');
    expect(whatsAppNumber(null)).toBe('');
    expect(whatsAppNumber('12345')).toBe('');
  });
});

describe('the message', () => {
  const message = composeApprovalMessage({ studentName: 'Ravi Kumar', order: ORDER });

  test('names the child and lists every line, priced as the server priced it', () => {
    expect(message).toContain('Your child *Ravi Kumar* has just placed an order');
    expect(message).toContain("1. Lay's Classic — 2 × ₹20 = ₹40");
    expect(message).toContain('2. Frooti — ₹12.50');
    expect(message).toContain('*Total: ₹52.50*');
  });

  test('asks them to accept or decline in the app, and by when', () => {
    expect(message).toMatch(/open the Hunger Hunt app to review this order and \*accept\* or \*decline\* it before 22 Sept.*3:15/);
    expect(message).toContain('Nothing has been charged yet.');
  });
});

describe('when the room caretaker reviews it', () => {
  const message = composeApprovalMessage({ studentName: 'Ravi Kumar', order: ORDER, caretakerReviews: true });

  test('still lists the cart and total', () => {
    expect(message).toContain("1. Lay's Classic — 2 × ₹20 = ₹40");
    expect(message).toContain('*Total: ₹52.50*');
  });

  test('says the caretaker decides and the parent can view it, not answer it', () => {
    expect(message).toContain('The room caretaker will review this order');
    expect(message).toContain('Contact the caretaker for any changes');
    expect(message).not.toMatch(/\*accept\* or \*decline\*/);
  });
});

describe('the parent app link', () => {
  test('ends both messages, on a line of its own so WhatsApp can open it', () => {
    for (const caretakerReviews of [false, true]) {
      const message = composeApprovalMessage({ studentName: 'Ravi', order: ORDER, caretakerReviews });
      expect(message.endsWith(`Open the Hunger Hunt parent app:\n${PARENT_APP_URL}`)).toBe(true);
    }
  });

  test('defaults to the live parent web app', () => {
    expect(PARENT_APP_URL).toBe('https://hunger-hunt-parent.vercel.app');
  });
});

describe('the link', () => {
  test('is addressed to the parent with the message typed out', () => {
    const link = approvalWhatsAppLink({ parentPhone: '9000000021', studentName: 'Ravi', order: ORDER });
    expect(link.startsWith('https://wa.me/919000000021?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(
      composeApprovalMessage({ studentName: 'Ravi', order: ORDER })
    );
  });

  test('is not made without a usable number or an order to describe', () => {
    expect(approvalWhatsAppLink({ parentPhone: null, studentName: 'Ravi', order: ORDER })).toBe('');
    expect(approvalWhatsAppLink({ parentPhone: '9000000021', studentName: 'Ravi', order: { items: [] } })).toBe('');
  });
});
