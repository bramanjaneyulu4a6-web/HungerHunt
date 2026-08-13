const partsAt = (date, timeZone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );

const localPartsStamp = (parts) =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );

// Converts a wall-clock time in an IANA zone to an instant. The short
// iteration also handles zones with daylight-saving changes without adding a
// heavyweight date library.
const zonedLocalToUtc = (parts, timeZone) => {
  const wanted = localPartsStamp(parts);
  let candidate = wanted;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shown = localPartsStamp(partsAt(new Date(candidate), timeZone));
    const correction = wanted - shown;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate);
};

export const businessDateStart = (
  dateString,
  timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata'
) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new TypeError('Business date must use YYYY-MM-DD.');
  const [, year, month, day] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new TypeError('Business date is not a valid calendar date.');
  }
  return zonedLocalToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);
};

export const businessDateAt = (
  date = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata'
) => {
  const parts = partsAt(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

export const businessPeriodStart = (
  limitType,
  now = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata'
) => {
  const local = partsAt(now, timeZone);
  let localDay = Date.UTC(local.year, local.month - 1, local.day);

  if (limitType === 'WEEKLY') {
    // Existing policy starts weeks on Sunday; this makes that boundary occur
    // at Sunday midnight in the configured business zone, not server-local.
    localDay -= new Date(localDay).getUTCDay() * 86_400_000;
  } else if (limitType !== 'DAILY') {
    localDay = Date.UTC(local.year, local.month - 1, 1);
  }

  const target = new Date(localDay);
  return zonedLocalToUtc(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
};
