import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PURCHASE_CODE_LENGTH,
  purchaseCodePairProblem,
  purchaseCodeProblem,
} from '../src/utils/purchaseCode.js';

test('the counter takes four digits and nothing else', () => {
  assert.equal(PURCHASE_CODE_LENGTH, 4);
  assert.equal(purchaseCodeProblem('4821'), null);
  assert.match(purchaseCodeProblem('482'), /4 digits/);
  assert.match(purchaseCodeProblem('48210'), /4 digits/);
  assert.match(purchaseCodeProblem('48a1'), /4 digits/);
});

test('an empty box is asked for rather than called invalid', () => {
  // The office has opened the dialog and typed nothing yet; "must be 4 digits"
  // would read as a complaint about a code they have not entered.
  assert.match(purchaseCodeProblem(''), /required|enter/i);
  assert.match(purchaseCodeProblem(undefined), /required|enter/i);
});

test('the retype has to match, or the office sets a code nobody knows', () => {
  assert.equal(purchaseCodePairProblem('4821', '4821'), null);
  assert.match(purchaseCodePairProblem('4821', '4822'), /do not match/i);
});

test('a bad code is reported before the mismatch it also has', () => {
  // Both are wrong here. Saying "does not match" first would have the office
  // fixing the retype to match a code the server will refuse anyway.
  assert.match(purchaseCodePairProblem('48', '21'), /4 digits/);
});
