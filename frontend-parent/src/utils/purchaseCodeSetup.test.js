import test from 'node:test';
import assert from 'node:assert/strict';

import { purchaseCodeSetupProblem, purchaseCodeSetupSaves } from './purchaseCodeSetup.js';

const children = [
  { _id: 'a1', name: 'Aarav' },
  { _id: 'b2', name: 'Diya' },
];

const typed = (entries) => entries;

test('a matching four-digit code for every child is ready to save', () => {
  const problem = purchaseCodeSetupProblem(
    children,
    typed({ a1: { code: '4821', confirm: '4821' }, b2: { code: '1907', confirm: '1907' } })
  );

  assert.equal(problem, null);
});

test('an empty code names the child it belongs to', () => {
  const problem = purchaseCodeSetupProblem(
    children,
    typed({ a1: { code: '4821', confirm: '4821' }, b2: { code: '', confirm: '' } })
  );

  // One message for the whole form would leave a parent with four children
  // hunting for the box that is wrong.
  assert.match(problem, /Diya/);
});

test('a short code names the child and says what is wrong', () => {
  const problem = purchaseCodeSetupProblem(
    children,
    typed({ a1: { code: '48', confirm: '48' }, b2: { code: '1907', confirm: '1907' } })
  );

  assert.match(problem, /Aarav/);
  assert.match(problem, /4 digits|4-digit/i);
});

test('a retype that does not match is reported as a mismatch', () => {
  const problem = purchaseCodeSetupProblem(
    children,
    typed({ a1: { code: '4821', confirm: '4821' }, b2: { code: '1907', confirm: '1908' } })
  );

  assert.match(problem, /Diya/);
  assert.match(problem, /do not match/i);
});

test('a child with nothing typed at all is caught', () => {
  const problem = purchaseCodeSetupProblem(children, typed({}));

  assert.match(problem, /Aarav/);
});

test('with two children wrong, the first one down the screen is named', () => {
  const problem = purchaseCodeSetupProblem(
    children,
    typed({ a1: { code: '4', confirm: '4' }, b2: { code: '1', confirm: '1' } })
  );

  // The parent fixes the form from the top; naming the last one would send
  // them past the first mistake.
  assert.match(problem, /Aarav/);
  assert.doesNotMatch(problem, /Diya/);
});

test('the saves carry one request per child, in screen order', () => {
  const saves = purchaseCodeSetupSaves(
    children,
    typed({ a1: { code: '4821', confirm: '4821' }, b2: { code: '1907', confirm: '1907' } })
  );

  // The endpoint sets one child's code, so the screen's single Save is several
  // requests; this is what the page sends and in what order.
  assert.deepEqual(saves, [
    { studentId: 'a1', name: 'Aarav', password: '4821' },
    { studentId: 'b2', name: 'Diya', password: '1907' },
  ]);
});
