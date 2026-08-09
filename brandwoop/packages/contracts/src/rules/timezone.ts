/**
 * Timezone helpers built on the runtime's IANA database.
 *
 * Shifts are scheduled in a site's local wall time. Storing only UTC would
 * silently move a 6am shift by an hour across a DST boundary, so the local
 * time is the input and the UTC instant is derived.
 */

function partsToUtcMillis(parts: Intl.DateTimeFormatPart[]): number {
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };
  return Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour") % 24,
    lookup("minute"),
    lookup("second"),
  );
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Minutes that the zone is ahead of UTC at the given instant. */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const asUtc = partsToUtcMillis(formatterFor(timeZone).formatToParts(instant));
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Converts a local wall time in `timeZone` to the matching UTC instant.
 *
 * Two passes settle the offset: the first guess uses the offset at the naive
 * instant, the second re-reads the offset at the corrected instant, which is
 * what changes across a DST transition.
 */
export function localWallTimeToUtc(
  isoLocalDate: string,
  isoLocalTime: string,
  timeZone: string,
): Date {
  const naive = Date.parse(`${isoLocalDate}T${isoLocalTime}Z`);
  if (Number.isNaN(naive)) {
    throw new RangeError(`Invalid local date-time: ${isoLocalDate}T${isoLocalTime}`);
  }

  const firstGuess = new Date(naive - zoneOffsetMinutes(timeZone, new Date(naive)) * 60_000);
  const refinedOffset = zoneOffsetMinutes(timeZone, firstGuess);
  return new Date(naive - refinedOffset * 60_000);
}

/** Local calendar date (YYYY-MM-DD) for an instant, in the given zone. */
export function localDateIn(timeZone: string, instant: Date): string {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(isoDate: string, days: number): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
