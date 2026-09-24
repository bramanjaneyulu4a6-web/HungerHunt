import test from 'node:test';
import assert from 'node:assert/strict';

import { activeOrderPresentation } from '../utils/activeOrdersExportPdf.js';

test('marks parent-approval requests for yellow treatment', () => {
  assert.deepEqual(activeOrderPresentation('AWAITING_PARENT'), {
    label: 'Awaiting parent approval',
    awaitingParentApproval: true,
  });
});

test('labels approved new orders as confirmed without approval highlighting', () => {
  assert.deepEqual(activeOrderPresentation('PENDING'), {
    label: 'Confirmed',
    awaitingParentApproval: false,
  });
});
