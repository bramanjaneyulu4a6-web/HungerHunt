import test from 'node:test';
import assert from 'node:assert/strict';

import {
  admissionNumberFieldProps,
  normalizeAdmissionNumber,
  sanitizeAdmissionNumberInput,
} from '../src/utils/admissionNumber.js';

test('normalizes admission numbers for storage and kiosk use', () => {
  assert.equal(normalizeAdmissionNumber(' hh7a42 '), 'HH7A42');
  assert.equal(normalizeAdmissionNumber(null), '');
  assert.equal(sanitizeAdmissionNumberInput(' hh-7 a42! '), 'HH7A42');
  assert.equal(sanitizeAdmissionNumberInput('abcdefgh9'), 'ABCDEFGH');
});

test('the admin field exposes the shared length and character constraints', () => {
  assert.deepEqual(admissionNumberFieldProps, {
    type: 'text',
    inputMode: 'text',
    pattern: '[A-Za-z0-9]{4,8}',
    minLength: 4,
    maxLength: 8,
    autoCapitalize: 'characters',
    autoComplete: 'off',
  });
});
