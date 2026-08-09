import type { RecurrenceRule } from "../scheduling";
import { addDays, isoWeekday, localWallTimeToUtc } from "./timezone";

export interface ShiftOccurrence {
  /** Stable per template and local start. Re-expanding cannot duplicate a shift. */
  readonly occurrenceKey: string;
  readonly localDate: string;
  readonly scheduledStart: Date;
  readonly scheduledEnd: Date;
}

export interface ExpandOptions {
  readonly shiftTemplateId: string;
  readonly timeZone: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  /** Guards a mistyped range from expanding years of shifts in one call. */
  readonly maxOccurrences?: number;
}

const DEFAULT_MAX_OCCURRENCES = 400;

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrenceError";
  }
}

function matchesFrequency(rule: RecurrenceRule, isoDate: string): boolean {
  switch (rule.frequency) {
    case "daily":
      return true;
    case "weekly":
      return rule.weekdays.includes(isoWeekday(isoDate));
    case "fortnightly": {
      const daysSinceStart = Math.round(
        (Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${rule.startDate}T00:00:00Z`)) /
          86_400_000,
      );
      const inActiveWeek = Math.floor(daysSinceStart / 7) % 2 === 0;
      return inActiveWeek && rule.weekdays.includes(isoWeekday(isoDate));
    }
    case "monthly":
      return isoDate.slice(8, 10) === rule.startDate.slice(8, 10);
  }
}

/**
 * Expands a recurrence into concrete shift occurrences for a date range.
 *
 * Expansion is deterministic and idempotent: the same template and range always
 * produce the same occurrence keys, so a repeated publish updates rather than
 * duplicates (scope section 9).
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  options: ExpandOptions,
): readonly ShiftOccurrence[] {
  if (options.rangeEnd < options.rangeStart) {
    throw new RecurrenceError("rangeEnd must not be before rangeStart");
  }
  if (rule.frequency !== "daily" && rule.frequency !== "monthly" && rule.weekdays.length === 0) {
    throw new RecurrenceError(`A ${rule.frequency} rule requires at least one weekday`);
  }

  const limit = options.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES;
  const windowStart = options.rangeStart > rule.startDate ? options.rangeStart : rule.startDate;
  const ruleEnd = rule.endDate;
  const windowEnd = ruleEnd !== null && ruleEnd < options.rangeEnd ? ruleEnd : options.rangeEnd;

  const occurrences: ShiftOccurrence[] = [];

  for (let date = windowStart; date <= windowEnd; date = addDays(date, 1)) {
    if (!matchesFrequency(rule, date)) {
      continue;
    }

    const scheduledStart = localWallTimeToUtc(date, rule.startTimeLocal, options.timeZone);
    const scheduledEnd = new Date(scheduledStart.getTime() + rule.durationMinutes * 60_000);

    occurrences.push({
      occurrenceKey: `${options.shiftTemplateId}:${date}T${rule.startTimeLocal}`,
      localDate: date,
      scheduledStart,
      scheduledEnd,
    });

    if (occurrences.length > limit) {
      throw new RecurrenceError(
        `Expansion exceeded ${limit} occurrences; narrow the range or raise maxOccurrences deliberately`,
      );
    }
  }

  return occurrences;
}
