import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadySent, hasSentToken, markSent, takeSent } from './pushTokenStore.js';

/* Node has no localStorage. This stands in the smallest one that behaves like
   a browser's for the store's purposes: string values, and the option of
   throwing on every call, which Safari private mode and a full quota both do. */
const installFakeStorage = (t, { broken = false } = {}) => {
  const values = new Map();
  const storage = {
    getItem: (key) => {
      if (broken) throw new Error('storage unavailable');
      return values.has(key) ? values.get(key) : null;
    },
    setItem: (key, value) => {
      if (broken) throw new Error('storage unavailable');
      values.set(key, String(value));
    },
    removeItem: (key) => {
      if (broken) throw new Error('storage unavailable');
      values.delete(key);
    },
  };
  globalThis.localStorage = storage;
  t.after(() => {
    delete globalThis.localStorage;
  });
  return storage;
};

test('a token is not "sent" until it has been marked so', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');

  assert.equal(alreadySent('device-abc'), false);
  markSent('device-abc');
  assert.equal(alreadySent('device-abc'), true);
  assert.equal(hasSentToken(), true);
});

test('registration belongs to the current signed-in parent', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  localStorage.setItem('parentToken', 'jwt-two');
  assert.equal(hasSentToken(), false);
});

test('the mark survives a fresh module load, which is what a page reload is', async (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  // A reload gives the app a brand-new module instance with no memory of
  // this one. Importing under a cache-busting query is the closest Node gets.
  const fresh = await import(`./pushTokenStore.js?reload=${Date.now()}`);
  assert.equal(fresh.alreadySent('device-abc'), true);
});

test('a different token for the same session is unsent', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  assert.equal(alreadySent('device-xyz'), false);
});

test('the same token under a new sign-in is unsent, so the device follows the parent', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  localStorage.setItem('parentToken', 'jwt-two');
  assert.equal(alreadySent('device-abc'), false);
});

test('takeSent hands back the token once and forgets it', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  assert.equal(takeSent(), 'device-abc');
  assert.equal(takeSent(), null);
  assert.equal(alreadySent('device-abc'), false);
});

test('with no session a token never counts as sent, but can still be withdrawn', (t) => {
  installFakeStorage(t);

  markSent('device-abc');
  assert.equal(alreadySent('device-abc'), false);
  assert.equal(takeSent(), 'device-abc');
});

test('withdrawing does not need the session that sent it — expiry clears that first', (t) => {
  installFakeStorage(t);
  localStorage.setItem('parentToken', 'jwt-one');
  markSent('device-abc');

  localStorage.removeItem('parentToken');
  assert.equal(takeSent(), 'device-abc');
});

test('storage that throws degrades to "never sent" rather than breaking push', (t) => {
  installFakeStorage(t, { broken: true });

  assert.doesNotThrow(() => markSent('device-abc'));
  assert.equal(alreadySent('device-abc'), false);
  assert.equal(takeSent(), null);
});
