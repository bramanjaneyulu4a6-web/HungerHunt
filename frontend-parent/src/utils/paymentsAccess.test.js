import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsVisible, upiOffer } from './paymentsAccess.js';

/* The rule that protects the families on the roll. The build flag says the
   checkout code is in this bundle at all; the server says whether THIS
   account may use it. Until the server has answered, the answer is no. */

describe('paymentsVisible', () => {
  test('stays hidden until the server has answered', () => {
    assert.equal(paymentsVisible(true, null), false);
    assert.equal(paymentsVisible(true, undefined), false);
  });

  test('shows the checkout once the server allows this account', () => {
    assert.equal(paymentsVisible(true, true), true);
  });

  test('stays hidden for an account the server bars', () => {
    assert.equal(paymentsVisible(true, false), false);
  });

  test('stays hidden when the build ships without payments, whatever the server says', () => {
    assert.equal(paymentsVisible(false, true), false);
    assert.equal(paymentsVisible(false, null), false);
  });

  // A failed request must read as "no", never as "probably fine".
  test('treats a non-boolean answer as no', () => {
    assert.equal(paymentsVisible(true, 'true'), false);
    assert.equal(paymentsVisible(true, 1), false);
  });
});

/* What the order sheet offers. The bug this replaces: "this parent may not
   pay" was folded into "show the simulated checkout", so an ordinary parent
   tapping Pay was answered with a fabricated confirmation and a made-up
   reference for a payment that never happened, and the order stayed pending. */

describe('upiOffer', () => {
  const LIVE_BUILD = { demoEnabled: false };

  test('offers no UPI at all to a parent who may not pay', () => {
    assert.deepEqual(upiOffer({ ...LIVE_BUILD, canPay: false }), {
      upiEnabled: false,
      demo: false,
    });
  });

  test('offers no UPI while the answer is still unknown', () => {
    assert.deepEqual(upiOffer({ ...LIVE_BUILD, canPay: null }), {
      upiEnabled: false,
      demo: false,
    });
  });

  test('offers the live gateway to an allowlisted parent', () => {
    assert.deepEqual(upiOffer({ ...LIVE_BUILD, canPay: true }), {
      upiEnabled: true,
      demo: false,
    });
  });

  test('offers the simulated checkout only where the build asked for one', () => {
    assert.deepEqual(upiOffer({ demoEnabled: true, canPay: false }), {
      upiEnabled: true,
      demo: true,
    });
  });

  // The invariant. demo must follow the build and nothing else — never the
  // account — or a real parent is shown a payment that did not happen.
  test('never turns on the demo because a parent may not pay', () => {
    for (const canPay of [null, undefined, false, true]) {
      assert.equal(upiOffer({ ...LIVE_BUILD, canPay }).demo, false);
    }
  });
});
