import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_UPI_PROVIDERS,
  demoAmountProblem,
  makeUpiReference,
} from './demoUpi.js';

test('the demo offers the three requested UPI apps', () => {
  assert.deepEqual(
    DEMO_UPI_PROVIDERS.map(({ id }) => id),
    ['phonepe', 'gpay', 'paytm']
  );
});

test('demo payments accept only whole rupees in the supported range', () => {
  assert.equal(demoAmountProblem(1), '');
  assert.equal(demoAmountProblem('20000'), '');
  assert.match(demoAmountProblem(0), /between 1 and 20,000/);
  assert.match(demoAmountProblem(20001), /between 1 and 20,000/);
  assert.match(demoAmountProblem('1.5'), /between 1 and 20,000/);
});

test('UPI references use a conventional twelve-digit format', () => {
  assert.equal(makeUpiReference(1234567890123), '234567890123');
});
