// Phase 2 of the auth fix: tokens now say which side they belong to, and the
// two sides are signed with different keys. This covers verifyToken directly —
// the role claim, the secret split, and the dated grace period that keeps
// already-issued tokens working until they expire on their own.
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'admin-test-secret';
process.env.PARENT_JWT_SECRET = 'parent-test-secret';

const {
  signAdminToken, signParentToken, verifyToken, parentSecretChangeover,
} = await import('../utils/tokens.js');

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';

const FUTURE = '2999-01-01T00:00:00Z'; // grace still open
const PAST = '2000-01-01T00:00:00Z';   // grace closed

const setGrace = (when) => { process.env.LEGACY_TOKEN_GRACE_UNTIL = when; };
afterEach(() => { delete process.env.LEGACY_TOKEN_GRACE_UNTIL; });

// Signed the way the old code signed them: one secret, no role.
const legacyToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

describe('a token is only usable on its own side', () => {
  test('an admin token verifies as admin', () => {
    setGrace(FUTURE);
    const payload = verifyToken(signAdminToken(ADMIN_ID), 'admin');
    assert.equal(payload?.id, ADMIN_ID);
    assert.equal(payload.role, 'admin');
  });

  test('a parent token verifies as parent', () => {
    setGrace(FUTURE);
    const payload = verifyToken(signParentToken(PARENT_ID, '9999999999'), 'parent');
    assert.equal(payload?.id, PARENT_ID);
    assert.equal(payload.role, 'parent');
  });

  test('a parent token is not accepted as an admin token', () => {
    setGrace(FUTURE);
    assert.equal(verifyToken(signParentToken(PARENT_ID, '9999999999'), 'admin'), null);
  });

  test('an admin token is not accepted as a parent token', () => {
    setGrace(FUTURE);
    assert.equal(verifyToken(signAdminToken(ADMIN_ID), 'parent'), null);
  });

  test('a role claim alone does not help without the right secret', () => {
    setGrace(FUTURE);
    // Correct claim, but signed with the parent key and offered as an admin.
    const forged = jwt.sign({ id: ADMIN_ID, role: 'admin' }, process.env.PARENT_JWT_SECRET);
    assert.equal(verifyToken(forged, 'admin'), null);
  });

  test('the right secret alone does not help without the right role', () => {
    setGrace(FUTURE);
    const wrongRole = jwt.sign({ id: ADMIN_ID, role: 'parent' }, process.env.JWT_SECRET);
    assert.equal(verifyToken(wrongRole, 'admin'), null);
  });
});

describe('tokens issued before the role claim existed', () => {
  test('are accepted on both sides during the grace period', () => {
    setGrace(FUTURE);
    // This is why protectAdmin still checks the Admin collection: within the
    // window a legacy parent token is indistinguishable from a legacy admin one.
    assert.ok(verifyToken(legacyToken({ id: ADMIN_ID }), 'admin'));
    assert.ok(verifyToken(legacyToken({ id: PARENT_ID, phone: '9' }), 'parent'));
  });

  test('are refused once the grace period has passed', () => {
    setGrace(PAST);
    assert.equal(verifyToken(legacyToken({ id: ADMIN_ID }), 'admin'), null);
    assert.equal(verifyToken(legacyToken({ id: PARENT_ID, phone: '9' }), 'parent'), null);
  });

  test('newly issued tokens still work after the grace period', () => {
    setGrace(PAST);
    assert.ok(verifyToken(signAdminToken(ADMIN_ID), 'admin'));
    assert.ok(verifyToken(signParentToken(PARENT_ID, '9'), 'parent'));
  });
});

describe('when PARENT_JWT_SECRET is not set', () => {
  const withSharedSecret = (fn) => {
    const saved = process.env.PARENT_JWT_SECRET;
    delete process.env.PARENT_JWT_SECRET;
    try { fn(); } finally { process.env.PARENT_JWT_SECRET = saved; }
  };

  test('parents can still sign in, and the role claim still separates them', () => {
    setGrace(PAST); // no legacy leniency propping this up
    withSharedSecret(() => {
      const parentToken = signParentToken(PARENT_ID, '9');
      assert.ok(verifyToken(parentToken, 'parent'), 'parent login must keep working');
      assert.equal(verifyToken(parentToken, 'admin'), null, 'role must still separate them');
      assert.equal(verifyToken(signAdminToken(ADMIN_ID), 'parent'), null);
    });
  });

  // The two settings are ordered: introducing the second key invalidates every
  // parent token signed with the first, and the legacy window is the only thing
  // that carries them across. So the window is a deadline for setting the key,
  // and which side of it you are on is what the startup warning reports.
  describe('the changeover it reports', () => {
    test('is free while the legacy window is open', () => {
      setGrace(FUTURE);
      withSharedSecret(() => {
        const { pending, free } = parentSecretChangeover();
        assert.equal(pending, true, 'the key is not set, so a changeover is outstanding');
        assert.equal(free, true, 'inside the window, old-key parent tokens still verify');
      });
    });

    test('costs every parent their session once it has closed', () => {
      setGrace(PAST);
      withSharedSecret(() => {
        const { pending, free } = parentSecretChangeover();
        assert.equal(pending, true);
        assert.equal(free, false, 'outside the window nothing carries the old key');
      });
    });

    // Not a hypothetical: it is exactly what these two report either side of
    // the date, and it is the reason to set the key before it rather than after.
    test('and that is what actually happens to a token signed with the old key', () => {
      const oldKeyParentToken = jwt.sign(
        { id: PARENT_ID, phone: '9', role: 'parent' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      setGrace(FUTURE);
      assert.ok(verifyToken(oldKeyParentToken, 'parent'), 'free: still accepted');

      setGrace(PAST);
      assert.equal(verifyToken(oldKeyParentToken, 'parent'), null, 'costly: refused');
    });
  });

  test('reports nothing outstanding once the key is set', () => {
    setGrace(FUTURE);
    assert.equal(parentSecretChangeover().pending, false);
  });
});
