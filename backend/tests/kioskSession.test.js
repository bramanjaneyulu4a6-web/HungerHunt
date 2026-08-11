// The kiosk's open front door: a session from an admission number, and the
// model fields that carry it. No database — model calls are stubbed.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

describe('the Student schema carries the kiosk fields', () => {
  test('admissionNumber is a unique, sparse, trimmed string', () => {
    const path = Student.schema.path('admissionNumber');
    assert.ok(path, 'admissionNumber must exist on the schema');
    assert.equal(path.instance, 'String');
    assert.equal(path.options.unique, true);
    assert.equal(
      path.options.sparse,
      true,
      'sparse: existing rows have no number and must not collide on null'
    );
    assert.equal(path.options.trim, true);
  });

  test('lockout fields default to unlocked', () => {
    const doc = new Student({});
    assert.equal(doc.purchaseCodeAttempts, 0);
    assert.equal(doc.purchaseCodeLockedUntil, null);
  });
});
