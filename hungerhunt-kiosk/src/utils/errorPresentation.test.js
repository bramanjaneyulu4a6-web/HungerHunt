import { describe, expect, test } from 'vitest';
import { ERROR_PRESENTATIONS, presentError } from './errorPresentation';

const responseError = (status, data) => ({ response: { status, data } });

describe('semantic error presentation', () => {
  test.each([
    ['KIOSK_WALLET_EMPTY', ERROR_PRESENTATIONS.EMPTY],
    ['KIOSK_ACTIVE_ORDER', ERROR_PRESENTATIONS.BLOCKED],
    ['CODE_LOCKED', ERROR_PRESENTATIONS.LOCKED],
    ['PRODUCT_LIMIT', ERROR_PRESENTATIONS.LIMIT_REACHED],
  ])('uses the stable backend code %s', (code, expected) => {
    expect(presentError(responseError(400, { code, message: 'Backend copy' })).presentation).toBe(expected);
  });

  test('distinguishes a normal wrong PIN from a legacy code update', () => {
    expect(presentError(responseError(400, { message: 'Wrong purchase code' })).presentation)
      .toBe(ERROR_PRESENTATIONS.SECURITY);
    expect(presentError(responseError(400, {
      message: "Wrong purchase code. If this student's code was set before codes became 4 digits, their parent needs to set a new one in the app.",
    })).presentation).toBe(ERROR_PRESENTATIONS.CODE_UPDATE);
  });

  test('maps approval conflicts and expiry to stale data with a status stamp', () => {
    const changed = presentError(responseError(409, {
      message: 'This order changed while approval was being processed. Refresh and try again.',
    }));
    const expired = presentError(responseError(410, {
      message: 'This request expired before it was answered.',
    }));

    expect(changed).toMatchObject({ presentation: ERROR_PRESENTATIONS.STALE_DATA, stamp: 'UPDATED' });
    expect(expired).toMatchObject({ presentation: ERROR_PRESENTATIONS.STALE_DATA, stamp: 'EXPIRED' });
  });

  test('maps stock, wallet and connection fallbacks without losing raw copy', () => {
    expect(presentError(responseError(400, { message: 'Only 2 in stock.' })).presentation)
      .toBe(ERROR_PRESENTATIONS.INSUFFICIENT_STOCK);
    expect(presentError(responseError(400, { message: 'Insufficient pocket money balance!' })).presentation)
      .toBe(ERROR_PRESENTATIONS.INSUFFICIENT_FUNDS);

    const offline = presentError({ request: {}, message: 'Network Error' });
    expect(offline.presentation).toBe(ERROR_PRESENTATIONS.CONNECTION);
    expect(offline.rawMessage).toBe('Network Error');
  });
});
