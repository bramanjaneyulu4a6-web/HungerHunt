import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mongoConnectOptions,
  MAX_POOL_DEFAULT,
  MIN_POOL_DEFAULT,
  SCRIPT_MAX_POOL,
  scriptConnectOptions,
} from '../config/mongoPool.js';

test('defaults size the pool for the shared Atlas tier', () => {
  const options = mongoConnectOptions({});
  assert.equal(options.maxPoolSize, MAX_POOL_DEFAULT);
  assert.equal(options.minPoolSize, MIN_POOL_DEFAULT);
});

test('a warm floor of connections is kept open', () => {
  // The whole point of minPoolSize here: without it every idle stretch drops
  // the pool to zero and the next parent pays a fresh TLS handshake.
  assert.ok(mongoConnectOptions({}).minPoolSize > 0);
});

test('a request waiting for a connection eventually gives up', () => {
  // Driver default is 0, meaning wait forever. Under a login burst that turns
  // a slow request into one that never answers at all.
  const { waitQueueTimeoutMS } = mongoConnectOptions({});
  assert.ok(waitQueueTimeoutMS > 0);
});

/* Measured, not chosen. A 200-parent sign-in burst congests the event loop for
   ~13s on bcryptjs alone, and checkout is timed in wall clock, so anything
   near that turns slow logins into 500s. This is the regression that a load
   test caught and a unit test could not have. */
test('the wait is longer than a login burst starves the event loop', () => {
  assert.ok(mongoConnectOptions({}).waitQueueTimeoutMS >= 20_000);
});

test('the wait is tunable when a real pool problem needs flushing out', () => {
  assert.equal(mongoConnectOptions({ MONGO_WAIT_QUEUE_MS: '5000' }).waitQueueTimeoutMS, 5000);
});

test('server selection still gives Atlas time to answer', () => {
  assert.equal(mongoConnectOptions({}).serverSelectionTimeoutMS, 10_000);
});

test('both pool bounds are tunable from the environment', () => {
  const options = mongoConnectOptions({ MONGO_MAX_POOL: '40', MONGO_MIN_POOL: '8' });
  assert.equal(options.maxPoolSize, 40);
  assert.equal(options.minPoolSize, 8);
});

/* The dashboard is edited under pressure, mid-incident, by someone who only
   means to shrink the pool. The driver REFUSES to connect when minPoolSize
   exceeds maxPoolSize, so left unclamped that edit is not a smaller pool —
   it is a backend that will not boot. */
test('a max below the min clamps instead of refusing to connect', () => {
  const options = mongoConnectOptions({ MONGO_MAX_POOL: '3' });
  assert.equal(options.maxPoolSize, 3);
  assert.equal(options.minPoolSize, 3);
});

test('junk and non-positive values fall back to the defaults', () => {
  for (const bad of ['0', '-5', 'twenty', '', '3.5']) {
    const options = mongoConnectOptions({ MONGO_MAX_POOL: bad });
    assert.equal(options.maxPoolSize, MAX_POOL_DEFAULT, `MONGO_MAX_POOL=${bad}`);
  }
});

/* Scripts and the reconcile cron share one small Atlas tier with the live
   service. A background sweep that opens a web-service-sized pool spends the
   cluster's budget on work no parent is waiting for. */
test('scripts take a deliberately small pool', () => {
  const options = scriptConnectOptions();
  assert.equal(options.maxPoolSize, SCRIPT_MAX_POOL);
  assert.ok(SCRIPT_MAX_POOL < MAX_POOL_DEFAULT);
});

test('scripts keep no warm connections', () => {
  // A script connects, works and exits. A floor would just be sockets held
  // open against the cluster's cap for no benefit.
  assert.ok(!scriptConnectOptions().minPoolSize);
});
