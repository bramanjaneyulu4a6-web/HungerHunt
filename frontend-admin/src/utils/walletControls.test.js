import test from 'node:test';
import assert from 'node:assert/strict';

import { walletControlStates } from './walletControls.js';

const states = (student) => Object.fromEntries(
  walletControlStates(student).map((mark) => [mark.key, mark]),
);

test('always exactly two marks: approval and limit', () => {
  assert.deepEqual(walletControlStates({}).map((mark) => mark.key), ['approval', 'limit']);
});

test('parent approval on shows the parent mark in green', () => {
  const { approval } = states({ requiresParentApproval: true });
  assert.equal(approval.glyph, 'parent');
  assert.equal(approval.tone, 'green');
  assert.equal(approval.on, true);
  assert.equal(approval.label, 'Ask parent approval: on');
});

test('caretaker approval swaps the parent mark for the C', () => {
  const { approval } = states({ requiresParentApproval: true, caretakerMayApprove: true });
  assert.equal(approval.glyph, 'caretaker');
  assert.equal(approval.on, true);
  assert.equal(approval.label, 'Ask caretaker approval: on');
});

test('caretaker approval without parent approval does not count', () => {
  const { approval } = states({ requiresParentApproval: false, caretakerMayApprove: true });
  assert.equal(approval.glyph, 'parent');
  assert.equal(approval.on, false);
  assert.equal(approval.label, 'Ask parent approval: off');
});

test('an active spending limit is yellow-orange, with the amount spelled out', () => {
  const { limit } = states({ walletControl: { enabled: true, limitAmount: 150, limitType: 'WEEKLY' } });
  assert.equal(limit.tone, 'amber');
  assert.equal(limit.on, true);
  assert.match(limit.label, /150 per week/);
});

test('no settings stored reads all off', () => {
  const { approval, limit } = states({});
  assert.deepEqual([approval.on, limit.on], [false, false]);
  assert.equal(limit.label, 'Spending limit: off');
});
