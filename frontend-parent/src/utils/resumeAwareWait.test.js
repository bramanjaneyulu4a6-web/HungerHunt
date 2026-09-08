import test from 'node:test';
import assert from 'node:assert/strict';
import { wait } from './resumeAwareWait.js';

/* Node has no document, so these tests stand in a minimal one: just enough
   Page Visibility API for the util to subscribe to, plus a dispatch helper
   playing the part of the OS bringing the app back to the foreground. */
const installFakeDocument = (t, visibilityState) => {
  const listeners = new Set();
  const doc = {
    visibilityState,
    addEventListener(type, fn) {
      if (type === 'visibilitychange') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.delete(fn);
    },
    changeVisibility(state) {
      this.visibilityState = state;
      [...listeners].forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
  globalThis.document = doc;
  t.after(() => {
    delete globalThis.document;
  });
  return doc;
};

test('resolves after the given delay when nothing interrupts', async () => {
  const start = Date.now();
  await wait(50);
  assert.ok(Date.now() - start >= 40, 'must not resolve before the delay');
});

test('an abort releases the wait immediately', async () => {
  const controller = new AbortController();
  const start = Date.now();
  setTimeout(() => controller.abort(), 10);
  await wait(5000, controller.signal);
  assert.ok(Date.now() - start < 1000, 'abort must cut the wait short');
});

test('the app returning to the foreground releases the wait immediately', async (t) => {
  const doc = installFakeDocument(t, 'hidden');
  const start = Date.now();
  const waited = wait(5000);
  doc.changeVisibility('visible');
  await waited;
  assert.ok(
    Date.now() - start < 1000,
    'the poll must not sit out a frozen timer after the parent returns from their UPI app'
  );
});

test('going hidden does not release the wait early', async (t) => {
  const doc = installFakeDocument(t, 'visible');
  const start = Date.now();
  const waited = wait(100);
  doc.changeVisibility('hidden');
  await waited;
  assert.ok(Date.now() - start >= 90, 'backgrounding must not trigger an early poll');
});

test('watches for the foreground only while waiting, and lets go after', async (t) => {
  const doc = installFakeDocument(t, 'hidden');

  const waited = wait(20);
  assert.equal(doc.listenerCount(), 1, 'the wait must be subscribed while pending');
  await waited;
  assert.equal(doc.listenerCount(), 0, 'a finished wait must unsubscribe');

  const controller = new AbortController();
  const aborted = wait(5000, controller.signal);
  controller.abort();
  await aborted;
  assert.equal(doc.listenerCount(), 0, 'an aborted wait must unsubscribe too');
});
