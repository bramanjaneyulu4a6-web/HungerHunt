import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { reminderPlan, cutoffOn, nextPassAt, reminderMessage } = await import(
  '../utils/approvalReminders.js'
);

const now = new Date('2026-09-24T06:30:00Z'); // 12:00 IST
const open = { status: 'PENDING', expiresAt: new Date('2026-09-24T18:29:59Z') };

describe('reminderPlan', () => {
  test('an open request with nothing queued is reminded', () => {
    assert.equal(reminderPlan({ request: open, now, queuedReminder: null }).action, 'SEND');
  });

  test('PROCESSING still counts as open', () => {
    const request = { ...open, status: 'PROCESSING' };
    assert.equal(reminderPlan({ request, now, queuedReminder: null }).action, 'SEND');
  });

  for (const status of ['APPROVED', 'REJECTED', 'EXPIRED']) {
    test(`a ${status} request is finished`, () => {
      const plan = reminderPlan({ request: { ...open, status }, now, queuedReminder: null });
      assert.equal(plan.action, 'DONE');
    });
  }

  test('a request past its deadline is finished even before EXPIRED is written', () => {
    const request = { ...open, expiresAt: new Date('2026-09-24T06:00:00Z') };
    assert.equal(reminderPlan({ request, now, queuedReminder: null }).action, 'DONE');
  });

  test('a missing request is finished', () => {
    assert.equal(reminderPlan({ request: null, now, queuedReminder: null }).action, 'DONE');
  });

  test('an undelivered reminder already waiting means no second one is queued', () => {
    const plan = reminderPlan({ request: open, now, queuedReminder: { _id: 'row' } });
    assert.equal(plan.action, 'SKIP');
  });
});

describe('cutoffOn', () => {
  test('17:00 is 17:00 IST on the business date of now', () => {
    assert.equal(cutoffOn(now, '17:00').toISOString(), '2026-09-24T11:30:00.000Z');
  });

  test('a late-evening UTC instant still uses the IST date', () => {
    const lateUtc = new Date('2026-09-23T20:00:00Z'); // 01:30 IST on the 24th
    assert.equal(cutoffOn(lateUtc, '17:00').toISOString(), '2026-09-24T11:30:00.000Z');
  });

  test('rejects malformed times', () => {
    assert.throws(() => cutoffOn(now, '5pm'));
    assert.throws(() => cutoffOn(now, '25:00'));
  });
});

describe('nextPassAt', () => {
  const cutoff = cutoffOn(now, '17:00');

  test('passes at 12, 14 and 16 IST, then stops', () => {
    const at14 = nextPassAt({ now, everyMinutes: 120, cutoff });
    assert.equal(at14.toISOString(), '2026-09-24T08:30:00.000Z');

    const at16 = nextPassAt({ now: at14, everyMinutes: 120, cutoff });
    assert.equal(at16.toISOString(), '2026-09-24T10:30:00.000Z');

    assert.equal(nextPassAt({ now: at16, everyMinutes: 120, cutoff }), null);
  });

  test('a pass landing exactly on the cutoff still runs', () => {
    const at15 = new Date('2026-09-24T09:30:00Z');
    assert.equal(nextPassAt({ now: at15, everyMinutes: 120, cutoff }).toISOString(), cutoff.toISOString());
  });
});

describe('reminderMessage', () => {
  test('parent-answered wording names the child and amount', () => {
    const { title, body } = reminderMessage({
      student: { name: 'Asha', requiresParentApproval: true, caretakerMayApprove: false },
      totalAmount: 70,
    });
    assert.equal(title, 'Reminder: approval needed');
    assert.match(body, /Asha's ₹70 order/);
  });

  test('caretaker-reviewed wording says the caretaker will review', () => {
    const { title } = reminderMessage({
      student: { name: 'Asha', requiresParentApproval: true, caretakerMayApprove: true },
      totalAmount: 70,
    });
    assert.equal(title, 'Reminder: order for the caretaker to review');
  });
});
