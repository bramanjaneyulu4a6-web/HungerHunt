import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { effectivePeriodStart } = await import('../utils/effectivePeriodStart.js');

afterEach(() => mock.restoreAll());

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.session = () => query;
  query.lean = () => query;
  return query;
};

test('a reset inside the current week becomes the weekly boundary', async () => {
  const resetAt = new Date('2026-10-01T01:00:00+05:30');
  mock.method(OrderingSettings, 'findOne', () => queryFor({ weeklyResetAt: resetAt }));

  const start = await effectivePeriodStart('WEEKLY', {
    now: new Date('2026-10-02T12:00:00+05:30'),
  });

  assert.equal(start.getTime(), resetAt.getTime());
});

test('an old reset cannot move a later natural Sunday boundary backwards', async () => {
  mock.method(OrderingSettings, 'findOne', () =>
    queryFor({ weeklyResetAt: new Date('2026-09-20T01:00:00+05:30') })
  );

  const start = await effectivePeriodStart('WEEKLY', {
    now: new Date('2026-10-02T12:00:00+05:30'),
  });

  assert.equal(start.toISOString(), new Date('2026-09-27T00:00:00+05:30').toISOString());
});

test('daily and monthly periods do not read or use the weekly reset', async () => {
  const read = mock.method(OrderingSettings, 'findOne', () => queryFor(null));

  const daily = await effectivePeriodStart('DAILY', {
    now: new Date('2026-10-02T12:00:00+05:30'),
  });
  const monthly = await effectivePeriodStart('MONTHLY', {
    now: new Date('2026-10-02T12:00:00+05:30'),
  });

  assert.equal(daily.toISOString(), new Date('2026-10-02T00:00:00+05:30').toISOString());
  assert.equal(monthly.toISOString(), new Date('2026-10-01T00:00:00+05:30').toISOString());
  assert.equal(read.mock.callCount(), 0);
});
