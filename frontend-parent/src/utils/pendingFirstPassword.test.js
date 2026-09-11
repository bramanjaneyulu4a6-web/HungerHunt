import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPendingFirstPasswordPhone,
  pendingFirstPasswordPhone,
  setPendingFirstPasswordPhone,
} from './pendingFirstPassword.js';

beforeEach(() => clearPendingFirstPasswordPhone());

test('a phone handed over by the sign-in screen can be read back', () => {
  setPendingFirstPasswordPhone('9876543210');

  assert.equal(pendingFirstPasswordPhone(), '9876543210');
});

test('nothing is being set up until a screen says so', () => {
  assert.equal(pendingFirstPasswordPhone(), '');
});

test('finishing or abandoning setup leaves nothing behind', () => {
  setPendingFirstPasswordPhone('9876543210');
  clearPendingFirstPasswordPhone();

  assert.equal(pendingFirstPasswordPhone(), '');
});

/* The reason this module exists rather than a sessionStorage key. A parent who
   reloads the page mid-setup — during the SMS code or while choosing a
   password — has to start again from the phone number, because no account
   exists until /parent/first-password lands and a half-finished attempt is not
   something to resume. Module state gives that for free: a reload loads a new
   copy of the module with nothing in it. Any web storage would survive the
   reload and put the parent back in the middle of a verification whose token
   is gone. */
test('the phone is not written to storage that would survive a reload', () => {
  const writes = [];
  const recorder = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, value]),
    removeItem: (key) => writes.push(['remove', key]),
  };

  const saved = {
    session: globalThis.sessionStorage,
    local: globalThis.localStorage,
  };

  Object.defineProperty(globalThis, 'sessionStorage', { value: recorder, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: recorder, configurable: true });

  try {
    setPendingFirstPasswordPhone('9876543210');
    assert.equal(pendingFirstPasswordPhone(), '9876543210');
    clearPendingFirstPasswordPhone();

    assert.deepEqual(writes, []);
  } finally {
    Object.defineProperty(globalThis, 'sessionStorage', { value: saved.session, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: saved.local, configurable: true });
  }
});

afterEach(() => clearPendingFirstPasswordPhone());
