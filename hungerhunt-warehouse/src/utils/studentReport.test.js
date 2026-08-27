import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDENT_ISSUE_OPTIONS,
  buildReportBody,
  issueNeedsItems,
  selectionProblem,
  setItemCount,
} from './studentReport.js';

describe('the four things a student can say', () => {
  test('offers exactly the handover options, in order', () => {
    assert.deepEqual(
      STUDENT_ISSUE_OPTIONS.map(([value]) => value),
      ['WRONG_ITEM', 'MISSING_ITEM', 'QUALITY_ISSUE', 'OTHER']
    );
  });

  test('only OTHER skips the item picker', () => {
    assert.equal(issueNeedsItems('WRONG_ITEM'), true);
    assert.equal(issueNeedsItems('MISSING_ITEM'), true);
    assert.equal(issueNeedsItems('QUALITY_ISSUE'), true);
    assert.equal(issueNeedsItems('OTHER'), false);
  });
});

describe('choosing affected items', () => {
  test('a count is capped at what the order held', () => {
    const selection = setItemCount({}, 'juice', 5, 2);
    assert.equal(selection.juice, 2);
  });

  test('a count of zero removes the item from the selection', () => {
    const selection = setItemCount({ juice: 1, chips: 1 }, 'juice', 0, 2);
    assert.deepEqual(selection, { chips: 1 });
  });

  test('a negative count is treated as zero', () => {
    const selection = setItemCount({ juice: 2 }, 'juice', -3, 2);
    assert.deepEqual(selection, {});
  });
});

describe('what may be sent', () => {
  const note = 'The juice bottles in my box are mango, not apple.';

  test('an item category with nothing selected is not sendable', () => {
    assert.ok(selectionProblem('WRONG_ITEM', {}, note));
    assert.equal(selectionProblem('WRONG_ITEM', { juice: 1 }, note), null);
  });

  test('OTHER is sendable with only a note', () => {
    assert.equal(selectionProblem('OTHER', {}, note), null);
  });

  test('a note below the minimum is not sendable', () => {
    assert.ok(selectionProblem('OTHER', {}, 'bad'));
  });

  test('the body carries items only for item categories', () => {
    assert.deepEqual(buildReportBody('MISSING_ITEM', { chips: 1 }, `  ${note}  `), {
      category: 'MISSING_ITEM',
      note,
      items: [{ productId: 'chips', quantity: 1 }],
    });
    assert.deepEqual(buildReportBody('OTHER', { chips: 1 }, note), {
      category: 'OTHER',
      note,
    });
  });
});
