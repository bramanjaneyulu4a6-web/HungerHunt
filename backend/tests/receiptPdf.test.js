// The two lines on a recharge receipt that name how the money arrived. Pulled
// out of the drawing code so they can be read as text rather than as a PDF —
// what matters is the wording, not where on the page it lands.
//
// Both read receipt.payment.upiLabel, which the controller composes. Neither
// maps an app id or masks an address itself; a second copy of those rules is
// exactly how the PDF and the in-app view came to disagree before.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { itemDescription, paymentModeLine } = await import('../utils/receiptPdf.js');

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
