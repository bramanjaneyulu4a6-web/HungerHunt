import OrderingSettings from '../models/OrderingSettings.js';
import { businessPeriodStart } from './businessTime.js';

const withSession = (query, session) => (session ? query.session(session) : query);

export const effectivePeriodStart = async (
  limitType,
  { now = new Date(), session = null } = {}
) => {
  const naturalStart = businessPeriodStart(limitType, now);
  if (limitType !== 'WEEKLY') return naturalStart;

  const row = await withSession(
    OrderingSettings.findOne({ key: 'ordering' }).select('weeklyResetAt').lean(),
    session
  );
  const resetAt = row?.weeklyResetAt ? new Date(row.weeklyResetAt) : null;

  return resetAt && resetAt > naturalStart && resetAt <= now ? resetAt : naturalStart;
};
