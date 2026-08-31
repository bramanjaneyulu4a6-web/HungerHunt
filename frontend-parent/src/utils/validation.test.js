import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emailProblem,
  passwordProblem,
  phoneProblem,
  purchaseCodeProblem,
} from './validation.js';

test('parent passwords enforce the documented minimum', () => {
  assert.match(passwordProblem(''), /enter a password/i);
  assert.match(passwordProblem('12345'), /at least 6/i);
  assert.equal(passwordProblem('123456'), null);
});

test('purchase codes are exactly four digits', () => {
  assert.equal(purchaseCodeProblem('1234'), null);
  assert.match(purchaseCodeProblem('12345'), /4-digit|4 digits/i);
  assert.match(purchaseCodeProblem('12a4'), /numbers only/i);
});

test('phone numbers match the school record format', () => {
  assert.equal(phoneProblem('9876543210'), null);
  assert.match(phoneProblem('+91 9876543210'), /10-digit/i);
  assert.match(phoneProblem('987654321'), /10-digit/i);
});

test('email validation catches missing and malformed addresses', () => {
  assert.equal(emailProblem('parent@example.com'), null);
  assert.match(emailProblem('parent@school'), /valid email/i);
  assert.match(emailProblem(''), /email address/i);
});
