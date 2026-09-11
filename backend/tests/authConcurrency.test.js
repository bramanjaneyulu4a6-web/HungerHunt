import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createAuthGate, BUSY_MESSAGE, RETRY_AFTER_SECONDS } from '../middleware/authConcurrency.js';

/* The gate exists because signing in is CPU work, not database work: bcryptjs
   costs ~64ms of event loop per login and cannot be parallelised away. Left
   ungated, 200 parents interleave and every one of them waits ~13 seconds with
   no error — and a parent staring at a spinner taps Login again, which adds
   more hashing to the thing that is already the bottleneck.

   So the queue is bounded and the overflow is told to come back. What makes
   that safe is that a refusal costs nothing: it happens before any hashing and
   before the database is touched at all.

   Every test carries a timeout. A gate that leaks a slot does not fail loudly,
   it simply stops letting anybody through — a hang is the symptom, so it has
   to be an assertion rather than a stuck suite. */

const MAX_CONCURRENT = 2;
const MAX_QUEUED = 3;

// One barrier every in-flight handler waits on, so a single call releases them
// all. (Handing each handler its own resolver is what hung the first version
// of this file: only the most recent one could ever be released.)
let openBarrier;
let barrier;
const resetBarrier = () => {
  barrier = new Promise((resolve) => { openBarrier = resolve; });
};
resetBarrier();

let handlerCalls = 0;

const gate = createAuthGate({ maxConcurrent: MAX_CONCURRENT, maxQueued: MAX_QUEUED, name: 'test' });
const app = express();
app.post('/login', gate, async (req, res) => {
  handlerCalls += 1;
  await barrier;
  res.json({ ok: true });
});

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fires a request and exposes whether it has answered yet, which is the whole
// question here: refusals come back immediately, admitted ones do not.
const fire = () => {
  const tracked = { answered: false, response: null };
  tracked.done = fetch(`${base}/login`, { method: 'POST' }).then((response) => {
    tracked.answered = true;
    tracked.response = response;
    return response;
  });
  return tracked;
};

test('a burst past the queue is refused, and refused cheaply', { timeout: 10_000 }, async () => {
  handlerCalls = 0;
  resetBarrier();

  const ADMITTED = MAX_CONCURRENT + MAX_QUEUED; // 2 running + 3 waiting
  const TOTAL = 9;
  const all = Array.from({ length: TOTAL }, fire);

  await delay(250); // long enough for every refusal to land, nothing to finish

  const refused = all.filter((r) => r.answered);
  assert.equal(refused.length, TOTAL - ADMITTED, 'wrong number of requests bounced');

  for (const r of refused) {
    assert.equal(r.response.status, 503);
    assert.equal(r.response.headers.get('retry-after'), String(RETRY_AFTER_SECONDS));
    assert.equal((await r.response.json()).message, BUSY_MESSAGE);
  }

  // The property the whole design rests on: a refused request never reached
  // the handler, so it cost no password hashing and no database call.
  assert.equal(handlerCalls, MAX_CONCURRENT, 'a refused request must not reach the handler');

  openBarrier();
  await Promise.all(all.map((r) => r.done));
});

test('finishing a request hands its slot to the next in line', { timeout: 10_000 }, async () => {
  handlerCalls = 0;
  resetBarrier();

  const all = Array.from({ length: MAX_CONCURRENT + MAX_QUEUED }, fire);
  await delay(250);

  assert.equal(handlerCalls, MAX_CONCURRENT, 'only maxConcurrent may hash at once');
  assert.equal(all.filter((r) => r.answered).length, 0, 'nothing inside the queue should bounce');

  openBarrier();
  const responses = await Promise.all(all.map((r) => r.done));

  // Everyone queued was eventually served, not dropped.
  assert.equal(handlerCalls, MAX_CONCURRENT + MAX_QUEUED);
  for (const response of responses) assert.equal(response.status, 200);
});

test('the gate recovers completely once the burst passes', { timeout: 10_000 }, async () => {
  resetBarrier();
  openBarrier(); // nothing is slow any more

  for (let i = 0; i < 3; i += 1) {
    const response = await fetch(`${base}/login`, { method: 'POST' });
    assert.equal(response.status, 200, 'the gate stayed shut after the burst drained');
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test('parents and staff are told to come back in a moment, not that it broke', () => {
  assert.equal(BUSY_MESSAGE, 'Please try again in a few seconds.');
  assert.equal(RETRY_AFTER_SECONDS, 3);
});

/* The failure this gate could inflict on its own. A slot handed out and never
   given back does not raise anything — it just shrinks the gate, one abandoned
   request at a time, until nobody gets through at all. And abandoned requests
   are precisely what a slow launch produces: parents closing the tab because
   it felt stuck. Releasing on 'close' as well as 'finish' is what prevents it,
   so the guarantee is pinned here. */
test('a parent who gives up mid-request hands the slot back', { timeout: 10_000 }, async () => {
  handlerCalls = 0;
  resetBarrier();

  // Fill every running slot with requests that will be abandoned, not answered.
  const aborters = Array.from({ length: MAX_CONCURRENT }, () => new AbortController());
  const abandoned = aborters.map((controller) =>
    fetch(`${base}/login`, { method: 'POST', signal: controller.signal }).catch(() => 'aborted')
  );

  await delay(200);
  assert.equal(handlerCalls, MAX_CONCURRENT, 'the slow requests should hold every slot');

  for (const controller of aborters) controller.abort();
  await Promise.all(abandoned);
  await delay(200);

  // If the slots leaked, this request queues behind them forever and the
  // test's timeout is what fails.
  openBarrier();
  const response = await fetch(`${base}/login`, { method: 'POST' });
  assert.equal(response.status, 200, 'slots were not returned after the clients hung up');
});
