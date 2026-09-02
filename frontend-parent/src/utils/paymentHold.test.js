import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimBackgroundRefresh,
  holdBackgroundRefresh,
  onBackgroundRefreshResumed,
} from './paymentHold.js';

test('a page may refresh freely when no payment is on screen', () => {
  assert.equal(claimBackgroundRefresh(), true);
});

test('an open payment holds the refresh off and runs it on release', () => {
  let refreshes = 0;
  const stop = onBackgroundRefreshResumed(() => { refreshes += 1; });
  const release = holdBackgroundRefresh();

  // The parent's own "Order approved" push, arriving mid-confirmation.
  assert.equal(claimBackgroundRefresh(), false);
  assert.equal(refreshes, 0, 'the card must not be refreshed away yet');

  release();
  assert.equal(refreshes, 1, 'the page catches up once the payment is done');

  stop();
});

test('a payment nobody interrupted leaves no refresh behind', () => {
  let refreshes = 0;
  const stop = onBackgroundRefreshResumed(() => { refreshes += 1; });

  holdBackgroundRefresh()();
  assert.equal(refreshes, 0);

  stop();
});

test('the last payment to close is the one that lets the refresh through', () => {
  let refreshes = 0;
  const stop = onBackgroundRefreshResumed(() => { refreshes += 1; });
  const releaseFirst = holdBackgroundRefresh();
  const releaseSecond = holdBackgroundRefresh();

  assert.equal(claimBackgroundRefresh(), false);
  releaseFirst();
  assert.equal(refreshes, 0, 'a second payment is still on screen');

  releaseSecond();
  assert.equal(refreshes, 1);

  stop();
});

test('releasing twice does not strand the next payment', () => {
  const release = holdBackgroundRefresh();
  release();
  release();

  const stillHeld = holdBackgroundRefresh();
  assert.equal(claimBackgroundRefresh(), false, 'the count must not have gone negative');
  stillHeld();
});
