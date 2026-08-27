import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'admin-test-secret';
process.env.PARENT_JWT_SECRET = 'parent-test-secret';
process.env.STUDENT_JWT_SECRET = 'student-test-secret';

const {
  signAdminToken, signParentToken, signStudentToken, signStaffToken, verifyToken,
  parentSecretIsShared, studentSecretIsShared,
} = await import('../utils/tokens.js');

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';
const STUDENT_ID = '507f191e810c19729de860ff';

describe('a token is only usable on its own side', () => {
  test('the issued staff, parent, and student tokens verify for their own roles', () => {
    assert.equal(verifyToken(signAdminToken(ADMIN_ID), 'admin')?.id, ADMIN_ID);
    assert.equal(verifyToken(signParentToken(PARENT_ID, '9999999999'), 'parent')?.id, PARENT_ID);
    assert.equal(verifyToken(signStudentToken(STUDENT_ID, '10425'), 'student')?.id, STUDENT_ID);
  });

  test('tokens do not cross identity boundaries', () => {
    const admin = signAdminToken(ADMIN_ID);
    const parent = signParentToken(PARENT_ID, '9999999999');
    const student = signStudentToken(STUDENT_ID, '10425');
    assert.equal(verifyToken(parent, 'admin'), null);
    assert.equal(verifyToken(admin, 'parent'), null);
    assert.equal(verifyToken(student, 'staff'), null);
    assert.equal(verifyToken(admin, 'student'), null);
  });

  test('a role claim cannot compensate for the wrong signing key', () => {
    const forged = jwt.sign({ id: ADMIN_ID, role: 'admin' }, process.env.PARENT_JWT_SECRET);
    assert.equal(verifyToken(forged, 'admin'), null);
  });

  test('a token signed with the right key but wrong role is refused', () => {
    const wrongRole = jwt.sign({ id: ADMIN_ID, role: 'parent' }, process.env.JWT_SECRET);
    assert.equal(verifyToken(wrongRole, 'admin'), null);
  });

  test('roleless tokens are no longer accepted anywhere', () => {
    const roleless = jwt.sign({ id: ADMIN_ID }, process.env.JWT_SECRET, { expiresIn: '1d' });
    assert.equal(verifyToken(roleless, 'admin'), null);
    assert.equal(verifyToken(roleless, 'staff'), null);
    assert.equal(verifyToken(roleless, 'parent'), null);
    assert.equal(verifyToken(roleless, 'student'), null);
  });
});

describe('shared-secret fallback remains explicit', () => {
  test('parents still work when their dedicated secret is missing', () => {
    const saved = process.env.PARENT_JWT_SECRET;
    delete process.env.PARENT_JWT_SECRET;
    try {
      const token = signParentToken(PARENT_ID, '9999999999');
      assert.equal(parentSecretIsShared(), true);
      assert.equal(verifyToken(token, 'parent')?.id, PARENT_ID);
      assert.equal(verifyToken(token, 'admin'), null);
    } finally {
      process.env.PARENT_JWT_SECRET = saved;
    }
  });

  test('student fallback also keeps its role boundary', () => {
    const saved = process.env.STUDENT_JWT_SECRET;
    delete process.env.STUDENT_JWT_SECRET;
    try {
      const token = signStudentToken(STUDENT_ID, '10425');
      assert.equal(studentSecretIsShared(), true);
      assert.equal(verifyToken(token, 'student')?.id, STUDENT_ID);
      assert.equal(verifyToken(token, 'staff'), null);
    } finally {
      process.env.STUDENT_JWT_SECRET = saved;
    }
  });
});

describe('student sessions and staff roles', () => {
  test('student sessions expire after 450 seconds', () => {
    const { exp, iat, admissionNumber } = jwt.decode(signStudentToken(STUDENT_ID, '10425'));
    assert.equal(exp - iat, 450);
    assert.equal(admissionNumber, '10425');
  });

  test('staff verification accepts every current staff role', () => {
    for (const role of ['admin', 'warehouse', 'caretaker']) {
      assert.equal(verifyToken(signStaffToken(ADMIN_ID, role), 'staff')?.role, role);
    }
  });

  test('the retired cashier role cannot be signed or verified', () => {
    assert.throws(() => signStaffToken(ADMIN_ID, 'cashier'), /Unknown staff role/);
    const stale = jwt.sign({ id: ADMIN_ID, role: 'cashier' }, process.env.JWT_SECRET);
    assert.equal(verifyToken(stale, 'staff'), null);
  });
});
