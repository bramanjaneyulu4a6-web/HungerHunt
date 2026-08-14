// A parent token lasts seven days, and until now that was unconditional. If a
// phone was lost or a password shared, resetting it changed what the next login
// needed and nothing about the sessions already open: those kept working, on
// that phone, for the rest of their week. There was no way to end them.
//
// tokenVersion is that way. Every token carries the number its account was at
// when it was issued, protectParent compares the two on every request, and a
// reset moves the account's — which retires every token stamped with the old
// one at once.
//
// No database: Parent.exists is stubbed to answer as Mongo would for a single
// stored account whose version the test chooses.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Parent = (await import('../models/Parent.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const PARENT_ID = '507f1f77bcf86cd799439011';
const PHONE = '9876543210';

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Answers the liveness query the way Mongo would, for one stored account at the
// given version. The two filter shapes protectParent builds are both handled
// here, because which one it builds is part of what is being tested: a token at
// version 0 has to match a row that has no tokenVersion field at all.
const storedAtVersion = (version) => {
  mock.method(Parent, 'exists', async (filter) => {
    if (String(filter._id) !== PARENT_ID) return null;

    if (filter.tokenVersion !== undefined) {
      return filter.tokenVersion === version ? { _id: PARENT_ID } : null;
    }

    // The $or form, which matches a stored 0 and a stored nothing alike.
    return version === 0 || version === undefined ? { _id: PARENT_ID } : null;
  });
};

// The dashboard is just a route behind protectParent; any of them would do.
const callDashboard = (token) =>
  fetch(base + '/api/parent/dashboard', {
    headers: { Authorization: `Bearer ${token}` },
  });

// Past the gate, the controller looks the parent up for real. Stubbed so a
// reply of 200 means the session was accepted and nothing else.
beforeEach(() => {
  mock.method(Parent, 'findById', () => ({
    populate: async () => ({ _id: PARENT_ID, studentIds: [] }),
  }));
});

describe('a session lasts until the account says otherwise', () => {
  test('a token at the account version is accepted', async () => {
    storedAtVersion(0);
    const res = await callDashboard(signParentToken(PARENT_ID, PHONE, 0));
    assert.equal(res.status, 200);
  });

  test('a token from before a reset is refused after it', async () => {
    const beforeReset = signParentToken(PARENT_ID, PHONE, 0);

    storedAtVersion(0);
    assert.equal((await callDashboard(beforeReset)).status, 200, 'good before the reset');

    // What resetPassword does to the row.
    storedAtVersion(1);
    assert.equal((await callDashboard(beforeReset)).status, 401, 'still good after it');
  });

  test('the token issued after the reset works', async () => {
    storedAtVersion(1);
    const res = await callDashboard(signParentToken(PARENT_ID, PHONE, 1));
    assert.equal(res.status, 200);
  });

  test('and the refusal signs the app out rather than looking like a glitch', async () => {
    storedAtVersion(1);
    const res = await callDashboard(signParentToken(PARENT_ID, PHONE, 0));

    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'AUTH_REQUIRED');
  });

  test('a deleted account takes its live sessions with it', async () => {
    mock.method(Parent, 'exists', async () => null);

    const res = await callDashboard(signParentToken(PARENT_ID, PHONE, 0));
    assert.equal(res.status, 401);
  });
});

describe('nobody is signed out by this arriving', () => {
  // Tokens already in circulation carry no v, and the accounts they belong to
  // have no tokenVersion. Both read as 0, so they agree — which is the only
  // reason this could ship without every parent having to log in again.
  test('a token with no version claim is accepted by an account with no version', async () => {
    storedAtVersion(undefined); // the field has never been written
    const noClaim = jwt.sign(
      { id: PARENT_ID, phone: PHONE, role: 'parent' },
      process.env.PARENT_JWT_SECRET,
      { expiresIn: '7d' }
    );

    assert.equal((await callDashboard(noClaim)).status, 200);
  });

  test('and the query it asks tolerates the field being absent', async () => {
    let asked;
    mock.method(Parent, 'exists', async (filter) => {
      asked = filter;
      return { _id: PARENT_ID };
    });

    await callDashboard(signParentToken(PARENT_ID, PHONE, 0));

    assert.ok(asked.$or, 'version 0 must not demand the field exists');
    assert.deepEqual(
      asked.$or,
      [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }]
    );
  });

  test('but once moved, the version is asked for exactly', async () => {
    let asked;
    mock.method(Parent, 'exists', async (filter) => {
      asked = filter;
      return { _id: PARENT_ID };
    });

    await callDashboard(signParentToken(PARENT_ID, PHONE, 3));

    assert.equal(asked.tokenVersion, 3);
    assert.equal(asked.$or, undefined, 'a moved version must not match a missing field');
  });
});

describe('resetting the password is what moves it', () => {
  const resetTo = (password, token = 'raw-token') =>
    fetch(`${base}/api/parent/reset-password/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

  const accountAwaitingReset = (tokenVersion) => {
    const doc = {
      _id: PARENT_ID,
      tokenVersion,
      password: 'old-hash',
      save: async function () { return this; },
    };

    mock.method(Parent, 'findOne', async () => doc);
    return doc;
  };

  test('a successful reset bumps the version, ending the other sessions', async () => {
    const doc = accountAwaitingReset(0);

    const res = await resetTo('a-good-password');

    assert.equal(res.status, 200);
    assert.equal(doc.tokenVersion, 1);
  });

  test('an account that has never had one bumps from nothing to 1', async () => {
    const doc = accountAwaitingReset(undefined);

    await resetTo('a-good-password');

    assert.equal(doc.tokenVersion, 1);
  });

  test('a rejected reset leaves every session alone', async () => {
    const doc = accountAwaitingReset(4);

    const res = await resetTo('short'); // fails validation before the account is touched

    assert.equal(res.status, 400);
    assert.equal(doc.tokenVersion, 4);
  });

  test('an expired or unknown reset link changes nothing', async () => {
    mock.method(Parent, 'findOne', async () => null);

    const res = await resetTo('a-good-password');
    assert.equal(res.status, 400);
  });

  test('the parent is told their other devices were signed out', async () => {
    accountAwaitingReset(0);

    const res = await resetTo('a-good-password');
    const { message } = await res.json();

    assert.match(message, /signed out/i);
  });
});

describe('logging in stamps the version the account is at', () => {
  test('so the new token outlives the reset that ended the old ones', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('the-password', 4);

    mock.method(Parent, 'findOne', async () => ({
      _id: PARENT_ID,
      phone: PHONE,
      password: hash,
      tokenVersion: 7,
      studentIds: [],
    }));

    const res = await fetch(base + '/api/parent/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPhoneNumber: PHONE, password: 'the-password' }),
    });

    assert.equal(res.status, 200);

    const { token } = await res.json();
    assert.equal(jwt.decode(token).v, 7);
  });
});
