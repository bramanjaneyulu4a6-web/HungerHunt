import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_UPI_PROVIDERS,
  demoAmountProblem,
  makeUpiReference,
  normalizeVpa,
  vpaProblem,
} from './demoUpi.js';

test('the demo offers the three requested UPI apps', () => {
  assert.deepEqual(
    DEMO_UPI_PROVIDERS.map(({ id }) => id),
    ['phonepe', 'gpay', 'paytm']
  );
});

test('demo payments accept only whole rupees in the supported range', () => {
  assert.equal(demoAmountProblem(1), '');
  assert.equal(demoAmountProblem('20000'), '');
  assert.match(demoAmountProblem(0), /between 1 and 20,000/);
  assert.match(demoAmountProblem(20001), /between 1 and 20,000/);
  assert.match(demoAmountProblem('1.5'), /between 1 and 20,000/);
});

test('UPI references use a conventional twelve-digit format', () => {
  assert.equal(makeUpiReference(1234567890123), '234567890123');
});

// The server checks the same shape before it spends a PhonePe call on it —
// this copy exists to answer while the parent is still typing, not to be the
// authority. See backend/utils/upiVpa.js.
test('a well-formed UPI ID raises no complaint', () => {
  for (const vpa of ['ashok@okhdfcbank', '9876543210@ybl', 'ashok.k-1_2@oksbi', '  Ashok@YBL ']) {
    assert.equal(vpaProblem(vpa), '', `${vpa} should be accepted`);
  }
});

test('an empty UPI ID asks for one rather than complaining about its shape', () => {
  assert.match(vpaProblem(''), /Enter your UPI ID/);
  assert.match(vpaProblem('   '), /Enter your UPI ID/);
});

test('a malformed UPI ID is described by example', () => {
  for (const vpa of ['ashok', 'ashok@gmail.com', '@ybl', 'ashok ok@ybl']) {
    assert.match(vpaProblem(vpa), /name@bank/, `${vpa} should be refused`);
  }
});

test('UPI IDs are normalized so case and stray spaces never reach the server', () => {
  assert.equal(normalizeVpa('  Ashok@OKHDFCBank '), 'ashok@okhdfcbank');
  assert.equal(normalizeVpa(null), '');
});
