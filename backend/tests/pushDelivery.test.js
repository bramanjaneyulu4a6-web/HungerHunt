// A notification is now something the system owes until FCM accepts it, not
// something it mentions once to a console. These tests pin the ledger down:
// written before the first try, retried with backoff through an outage,
// finished per-device so nobody hears the same alert twice, handed over when a
// new device registers, and honestly marked GAVE_UP when the window closes.
//
// No database and no Firebase: the models are stubbed, and FCM sits behind the
// transport seam in utils/pushTransport.js, faked per test.
import test, { beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const Parent = (await import('../models/Parent.js')).default;
const PushOutbox = (await import('../models/PushOutbox.js')).default;
const { transport } = await import('../utils/pushTransport.js');
const { sendToParent, deliverDuePushes, flushQueuedPushes } =
  await import('../utils/sendNotification.js');

const PARENT_ID = '507f1f77bcf86cd799439011';

const parentWithDevices = (tokens = [{ token: 'phone-1', platform: 'android' }]) => ({
  _id: PARENT_ID,
  pushTokens: tokens,
  fcmToken: null,
});

// Stands in for the Mongo document: plain data plus the save() the delivery
// logic writes its outcome through. Tests read the fields afterwards.
const makeRow = (overrides = {}) => {
  const row = {
    parentId: PARENT_ID,
    title: 'Purchase Alert',
    body: 'Asha spent ₹40',
    data: { type: 'TRANSACTION' },
    status: 'PENDING',
    attempts: 0,
    deliveredTokens: [],
    nextAttemptAt: new Date(),
    retryUntil: new Date(Date.now() + 60 * 60 * 1000),
    purgeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    save: async function () { return this; },
    ...overrides,
  };
  return row;
};

// sendToParent's first act is writing the row; capturing it here is how each
// test gets hold of the document the delivery logic then writes its story on.
const captureOutboxWrite = () => {
  const created = [];
  mock.method(PushOutbox, 'create', async (doc) => {
    const row = makeRow(doc);
    created.push(row);
    return row;
  });
  return created;
};

const fcmAccepts = () => mock.method(transport, 'send', async () => 'message-id');

const fcmDownFor = (tokens) =>
  mock.method(transport, 'send', async (message) => {
    if (tokens.includes(message.token)) {
      const err = new Error('unavailable');
      err.code = 'messaging/internal-error';
      throw err;
    }
    return 'message-id';
  });

const fcmSaysTokenDead = (token) =>
  mock.method(transport, 'send', async (message) => {
    if (message.token === token) {
      const err = new Error('gone');
      err.errorInfo = { code: 'messaging/registration-token-not-registered' };
      throw err;
    }
    return 'message-id';
  });

beforeEach(() => {
  mock.method(transport, 'enabled', () => true);
  mock.method(Parent, 'updateOne', async () => ({ modifiedCount: 1 }));
});

afterEach(() => mock.restoreAll());

describe('a notification is written down before it is attempted', () => {
  test('success: the row records FCM accepting every device', async () => {
    const created = captureOutboxWrite();
    fcmAccepts();

    await sendToParent(
      parentWithDevices([
        { token: 'phone-1', platform: 'android' },
        { token: 'browser-1', platform: 'web' },
      ]),
      'Purchase Alert', 'Asha spent ₹40', { type: 'TRANSACTION' }
    );

    assert.equal(created.length, 1);
    assert.equal(created[0].status, 'SENT');
    assert.deepEqual(created[0].deliveredTokens, ['phone-1', 'browser-1']);
  });

  test('failure: the row stays PENDING with a retry scheduled, not a log line', async () => {
    const created = captureOutboxWrite();
    fcmDownFor(['phone-1']);

    await sendToParent(parentWithDevices(), 'Purchase Alert', 'body', {});

    const row = created[0];
    assert.equal(row.status, 'PENDING');
    assert.equal(row.attempts, 1);
    assert.ok(row.nextAttemptAt > new Date(), 'a next attempt must be scheduled');
    assert.match(String(row.lastError), /internal-error/);
  });

  test('the caller is never failed by any of it', async () => {
    mock.method(PushOutbox, 'create', async () => { throw new Error('outbox down'); });

    await assert.doesNotReject(
      sendToParent(parentWithDevices(), 'Purchase Alert', 'body', {})
    );
  });

  test('push disabled leaves the row waiting, so a fixed deploy delivers it', async () => {
    const created = captureOutboxWrite();
    mock.method(transport, 'enabled', () => false);

    await sendToParent(parentWithDevices(), 'Purchase Alert', 'body', {});

    assert.equal(created[0].status, 'PENDING');
    assert.match(created[0].lastError, /transport disabled/);
  });
});

describe('the sweep finishes what the moment of sending could not', () => {
  const sweepFinds = (row) => {
    // First claim returns the row, second finds nothing due — one row swept.
    let claimed = false;
    mock.method(PushOutbox, 'findOneAndUpdate', async () => {
      if (claimed) return null;
      claimed = true;
      return row;
    });
  };

  test('a due row is retried and marked SENT when FCM accepts', async () => {
    const row = makeRow({ attempts: 1 });
    sweepFinds(row);
    mock.method(Parent, 'findById', async () => parentWithDevices());
    fcmAccepts();

    await deliverDuePushes();

    assert.equal(row.status, 'SENT');
    assert.equal(row.attempts, 2);
  });

  test('a retry only sends to devices not already reached', async () => {
    // The phone heard about it the first time; only the browser is still owed.
    const row = makeRow({ deliveredTokens: ['phone-1'] });
    sweepFinds(row);
    mock.method(Parent, 'findById', async () =>
      parentWithDevices([
        { token: 'phone-1', platform: 'android' },
        { token: 'browser-1', platform: 'web' },
      ])
    );

    const sent = [];
    mock.method(transport, 'send', async (message) => {
      sent.push(message.token);
      return 'message-id';
    });

    await deliverDuePushes();

    assert.deepEqual(sent, ['browser-1'], 'the phone must not get the alert twice');
    assert.equal(row.status, 'SENT');
  });

  test('past the retry window the row is honestly GAVE_UP, not retried forever', async () => {
    const row = makeRow({ retryUntil: new Date(Date.now() - 1000), attempts: 6 });
    sweepFinds(row);
    mock.method(Parent, 'findById', async () => parentWithDevices());
    fcmDownFor(['phone-1']);

    await deliverDuePushes();

    assert.equal(row.status, 'GAVE_UP');
  });

  test('a parent deleted since the alert was queued closes the row', async () => {
    const row = makeRow();
    sweepFinds(row);
    mock.method(Parent, 'findById', async () => null);

    await deliverDuePushes();

    assert.equal(row.status, 'GAVE_UP');
    assert.match(row.lastError, /no longer exists/);
  });

  test('a dead device is pruned and does not block the row finishing', async () => {
    const row = makeRow();
    sweepFinds(row);
    mock.method(Parent, 'findById', async () =>
      parentWithDevices([
        { token: 'phone-old', platform: 'android' },
        { token: 'phone-new', platform: 'android' },
      ])
    );
    fcmSaysTokenDead('phone-old');

    const pruned = mock.method(Parent, 'updateOne', async () => ({ modifiedCount: 1 }));

    await deliverDuePushes();

    assert.equal(row.status, 'SENT', 'one live device reached is a finished row');
    assert.deepEqual(row.deliveredTokens, ['phone-new']);
    assert.equal(pruned.mock.callCount(), 1, 'the dead token must be removed');
  });

  test('claiming a row pushes its next attempt forward, so a second sweep skips it', async () => {
    let claimFilter, claimUpdate;
    mock.method(PushOutbox, 'findOneAndUpdate', async (filter, update) => {
      claimFilter = filter;
      claimUpdate = update;
      return null; // nothing due; only the claim's shape is under test
    });

    await deliverDuePushes();

    assert.equal(claimFilter.status, 'PENDING');
    assert.ok(claimFilter.nextAttemptAt.$lte instanceof Date);
    assert.ok(
      claimUpdate.$set.nextAttemptAt > new Date(),
      'the claim itself must reschedule, or two sweepers double-send'
    );
  });
});

describe('a new device collects what it missed', () => {
  test('registering flushes the pending backlog to it', async () => {
    const missed = makeRow({ deliveredTokens: [] });
    mock.method(PushOutbox, 'find', () => ({
      sort: () => ({ limit: async () => [missed] }),
    }));
    mock.method(Parent, 'findById', async () =>
      parentWithDevices([{ token: 'fresh-install', platform: 'ios' }])
    );

    const sent = [];
    mock.method(transport, 'send', async (message) => {
      sent.push(message.token);
      return 'message-id';
    });

    await flushQueuedPushes(PARENT_ID);

    assert.deepEqual(sent, ['fresh-install']);
    assert.equal(missed.status, 'SENT');
  });

  test('an empty backlog does not even look the parent up', async () => {
    mock.method(PushOutbox, 'find', () => ({
      sort: () => ({ limit: async () => [] }),
    }));
    const looked = mock.method(Parent, 'findById', async () => null);

    await flushQueuedPushes(PARENT_ID);

    assert.equal(looked.mock.callCount(), 0);
  });

  test('a flush that breaks is contained, never thrown at registration', async () => {
    mock.method(PushOutbox, 'find', () => { throw new Error('outbox down'); });

    await assert.doesNotReject(flushQueuedPushes(PARENT_ID));
  });
});

describe('what was already true stays true', () => {
  test('web devices get data-only messages, native gets a notification block', async () => {
    captureOutboxWrite();
    const shapes = {};
    mock.method(transport, 'send', async (message) => {
      shapes[message.token] = message;
      return 'message-id';
    });

    await sendToParent(
      parentWithDevices([
        { token: 'phone-1', platform: 'android' },
        { token: 'browser-1', platform: 'web' },
      ]),
      'Title', 'Body', { type: 'RECHARGE', amount: 500 }
    );

    assert.ok(shapes['phone-1'].notification, 'native draws from the notification block');
    assert.equal(shapes['browser-1'].notification, undefined, 'web must be data-only or it draws twice');
    assert.equal(shapes['browser-1'].data.title, 'Title');
    assert.equal(shapes['browser-1'].data.amount, '500', 'FCM data values must be strings');
  });

  test('a legacy single-token parent is still reachable', async () => {
    const created = captureOutboxWrite();
    fcmAccepts();

    await sendToParent(
      { _id: PARENT_ID, pushTokens: [], fcmToken: 'legacy-token' },
      'Title', 'Body', {}
    );

    assert.deepEqual(created[0].deliveredTokens, ['legacy-token']);
    assert.equal(created[0].status, 'SENT');
  });
});
