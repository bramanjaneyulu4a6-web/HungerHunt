import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutContext } from './checkoutMode.js';

const NATIVE_ANDROID = { native: true, sdkEnabled: false, platform: 'android' };
const NATIVE_IOS = { native: true, sdkEnabled: false, platform: 'ios' };
const WEB = { native: false, sdkEnabled: false, platform: 'web' };

describe('a typed UPI ID', () => {
  test('becomes a collect request on a phone', () => {
    assert.deepEqual(checkoutContext({ vpa: 'ashok@okhdfcbank' }, NATIVE_ANDROID), {
      checkoutMode: 'UPI_COLLECT',
      vpa: 'ashok@okhdfcbank',
    });
  });

  test('becomes a collect request in a browser too, because nothing has to be launched', () => {
    assert.deepEqual(checkoutContext({ vpa: 'ashok@okhdfcbank' }, WEB), {
      checkoutMode: 'UPI_COLLECT',
      vpa: 'ashok@okhdfcbank',
    });
  });

  test('is normalized before it leaves the app', () => {
    assert.equal(checkoutContext({ vpa: '  Ashok@YBL ' }, WEB).vpa, 'ashok@ybl');
  });

  test('wins over an app id, so a stale selection cannot redirect the payment', () => {
    assert.deepEqual(checkoutContext({ app: 'gpay', vpa: 'ashok@ybl' }, NATIVE_ANDROID), {
      checkoutMode: 'UPI_COLLECT',
      vpa: 'ashok@ybl',
    });
  });
});

describe('a chosen app', () => {
  test('opens that app directly on a phone, and says which OS is asking', () => {
    assert.deepEqual(checkoutContext({ app: 'gpay' }, NATIVE_ANDROID), {
      checkoutMode: 'UPI_INTENT',
      upiApp: 'gpay',
      deviceOS: 'ANDROID',
    });
    assert.equal(checkoutContext({ app: 'phonepe' }, NATIVE_IOS).deviceOS, 'IOS');
  });

  test('falls back to the hosted page in a browser, which has no app to open', () => {
    assert.deepEqual(checkoutContext({ app: 'gpay' }, WEB), { checkoutMode: 'REDIRECT' });
  });
});

describe('no choice at all', () => {
  test('uses the hosted page by default', () => {
    assert.deepEqual(checkoutContext(null, WEB), { checkoutMode: 'REDIRECT' });
    assert.deepEqual(checkoutContext(undefined, NATIVE_ANDROID), { checkoutMode: 'REDIRECT' });
  });

  test('uses the native SDK only where the build has asked for it', () => {
    assert.deepEqual(checkoutContext(null, { ...NATIVE_ANDROID, sdkEnabled: true }), {
      checkoutMode: 'SDK',
    });
    // The flag alone is not enough — there is no SDK in a browser.
    assert.deepEqual(checkoutContext(null, { ...WEB, sdkEnabled: true }), {
      checkoutMode: 'REDIRECT',
    });
  });
});
