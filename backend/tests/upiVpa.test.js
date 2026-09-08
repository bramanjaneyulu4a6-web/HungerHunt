// A UPI ID typed by a parent, on its way to PhonePe and later onto a receipt.
// Two jobs, and they are deliberately separate: decide whether the string is
// even a UPI address before spending a provider call on it, and shorten it for
// a receipt that gets forwarded around.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { isValidVpa, maskVpa, normalizeVpa } = await import('../utils/upiVpa.js');

describe('normalizeVpa', () => {
  test('trims and lowercases, because handles are case-insensitive', () => {
    assert.equal(normalizeVpa('  Ashok@OKHDFCBank '), 'ashok@okhdfcbank');
  });

  test('answers empty for anything that is not a string', () => {
    assert.equal(normalizeVpa(null), '');
    assert.equal(normalizeVpa(12345), '');
    assert.equal(normalizeVpa(undefined), '');
  });
});

describe('isValidVpa', () => {
  test('accepts the shapes parents actually type', () => {
    for (const vpa of [
      'ashok@okhdfcbank',
      '9876543210@ybl',
      'ashok.kamma@oksbi',
      'ashok-kamma@axl',
      'ashok_k1@paytm',
    ]) {
      assert.equal(isValidVpa(vpa), true, `${vpa} should be accepted`);
    }
  });

  test('rejects strings missing either side of the @', () => {
    for (const vpa of ['ashok', '@okhdfcbank', 'ashok@', 'ashok@@ybl', '']) {
      assert.equal(isValidVpa(vpa), false, `${vpa} should be rejected`);
    }
  });

  test('rejects a handle that is not a bank handle', () => {
    // Digits lead a handle nowhere real, and a dot means someone typed an
    // email address into the UPI field.
    assert.equal(isValidVpa('ashok@1ybl'), false);
    assert.equal(isValidVpa('ashok@gmail.com'), false);
  });

  test('rejects characters that would let a payload be smuggled through', () => {
    assert.equal(isValidVpa('ashok ok@ybl'), false);
    assert.equal(isValidVpa('ashok"@ybl'), false);
    assert.equal(isValidVpa('ashok/../@ybl'), false);
  });

  test('rejects a local part longer than NPCI allows', () => {
    assert.equal(isValidVpa(`${'a'.repeat(257)}@ybl`), false);
  });

  test('normalizes before judging, so a pasted UPI ID with stray case passes', () => {
    assert.equal(isValidVpa('  Ashok@YBL '), true);
  });
});

describe('maskVpa', () => {
  test('keeps the first two characters and the whole handle', () => {
    assert.equal(maskVpa('ashok@okhdfcbank'), 'as***@okhdfcbank');
    assert.equal(maskVpa('9876543210@ybl'), '98***@ybl');
  });

  test('keeps only one character when the local part is too short to spare two', () => {
    assert.equal(maskVpa('abc@ybl'), 'a***@ybl');
    assert.equal(maskVpa('ab@ybl'), 'a***@ybl');
  });

  test('answers empty rather than a half-masked guess for a non-VPA', () => {
    assert.equal(maskVpa('not-a-vpa'), '');
    assert.equal(maskVpa(null), '');
  });
});
