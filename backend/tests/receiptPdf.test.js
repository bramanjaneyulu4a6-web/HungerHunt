// The two lines on a recharge receipt that name how the money arrived. Pulled
// out of the drawing code so they can be read as text rather than as a PDF —
// what matters is the wording, not where on the page it lands.
//
// Both read receipt.payment.upiLabel, which the controller composes. Neither
// maps an app id or masks an address itself; a second copy of those rules is
// exactly how the PDF and the in-app view came to disagree before.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { PassThrough } from 'node:stream';

const { itemDescription, paymentModeLine, renderReceiptPdf, halfSheetScale, RECEIPT_SPACE } =
  await import('../utils/receiptPdf.js');

// A filled-in receipt, only so something can be rendered. Every field the
// renderer reads is present, because an absent one would throw and read here
// as a page-geometry failure.
const sampleReceipt = {
  receiptNumber: 'GMS16090001',
  date: '2026-09-16T04:30:00.000Z',
  amount: 500,
  amountInWords: 'Five Hundred Rupees Only',
  previousBalance: 120,
  newBalance: 620,
  kind: 'RECHARGE',
  mode: 'CASH',
  student: {
    name: 'Test Student',
    admissionNumber: '990001',
    className: '6',
    section: 'A',
    roomNumber: 'H1',
  },
  parent: { name: 'Test Parent', phone: '9000000021' },
  receivedBy: { name: 'Office' },
  company: { name: 'GRAARR SERVICES', address: '120/3-M-1-S, SAINATH NAGAR\nKURNOOL' },
};

const upiReceipt = (payment) => ({ mode: 'UPI', payment });

describe('paymentModeLine', () => {
  test('names the app the parent chose in our own picker', () => {
    assert.equal(paymentModeLine(upiReceipt({ upiLabel: 'Paytm' })), 'UPI (Paytm)');
  });

  test('names a typed UPI ID exactly as the controller masked it', () => {
    assert.equal(
      paymentModeLine(upiReceipt({ upiLabel: 'as***@okhdfcbank' })),
      'UPI (as***@okhdfcbank)'
    );
  });

  test('says plain UPI when the app was chosen out of our sight', () => {
    assert.equal(paymentModeLine(upiReceipt({ upiLabel: null })), 'UPI');
    assert.equal(paymentModeLine(upiReceipt({})), 'UPI');
    assert.equal(paymentModeLine({ mode: 'UPI' }), 'UPI');
  });

  test('says where a cash recharge was taken', () => {
    assert.equal(paymentModeLine({ mode: 'CASH' }), 'Cash — at school office');
  });
});

describe('itemDescription', () => {
  test('quotes the order reference, which is what the office can look up', () => {
    assert.equal(
      itemDescription(upiReceipt({ merchantOrderId: 'HH-TOPUP-124', upiLabel: 'Paytm' })),
      'Wallet Recharge (UPI — HH-TOPUP-124)'
    );
  });

  test('falls back to the app name rather than naming the wrong app', () => {
    // Before, a Paytm recharge with no order reference printed "PhonePe" here.
    assert.equal(
      itemDescription(upiReceipt({ upiLabel: 'Paytm' })),
      'Wallet Recharge (UPI — Paytm)'
    );
  });

  test('says only UPI when there is neither a reference nor a known app', () => {
    assert.equal(itemDescription(upiReceipt({})), 'Wallet Recharge (UPI)');
  });

  test('marks a cash recharge as cash', () => {
    assert.equal(itemDescription({ mode: 'CASH' }), 'Wallet Recharge (Cash)');
  });
});

/* The sheet the receipt prints on. The office wants the document in the top
 * half of an A4 page so the rest can be torn or folded off, which is a claim
 * about geometry — so it is checked as geometry here, and the rendered page
 * box is checked against the file the browser actually prints. */
describe('the half sheet', () => {
  const A4_PORTRAIT = { width: 595.28, height: 841.89 };

  test('scales the receipt to exactly half the page height', () => {
    const scale = halfSheetScale(A4_PORTRAIT.width);
    const drawnHeight = RECEIPT_SPACE.height * scale;

    // Half the sheet, not merely within it: the fold is a fixed line on the
    // paper and the receipt has to meet it.
    assert.ok(
      Math.abs(drawnHeight - A4_PORTRAIT.height / 2) < 0.5,
      `receipt is ${drawnHeight}pt tall, half the sheet is ${A4_PORTRAIT.height / 2}pt`
    );
  });

  test('fills the width it is given', () => {
    const scale = halfSheetScale(A4_PORTRAIT.width);
    assert.ok(Math.abs(RECEIPT_SPACE.width * scale - A4_PORTRAIT.width) < 0.01);
  });

  test('renders onto a portrait A4 page', async () => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolve) => sink.on('end', resolve));

    renderReceiptPdf(sampleReceipt, sink);
    await done;

    const pdf = Buffer.concat(chunks).toString('latin1');
    const box = pdf.match(/\/MediaBox\s*\[([^\]]+)\]/);

    assert.ok(box, 'no MediaBox in the rendered PDF');

    const [, , width, height] = box[1].trim().split(/\s+/).map(Number);

    // Portrait: the page is taller than it is wide. A landscape page would
    // still hold the receipt, but there would be no bottom half to tear.
    assert.ok(Math.abs(width - A4_PORTRAIT.width) < 1, `page is ${width}pt wide`);
    assert.ok(Math.abs(height - A4_PORTRAIT.height) < 1, `page is ${height}pt tall`);
  });
});
