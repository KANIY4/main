import { describe, expect, it } from "vitest";

import { RecurrenceError, expandRecurrence } from "../rules/recurrence.js";
import { localWallTimeToUtc, zoneOffsetMinutes } from "../rules/timezone.js";
import type { RecurrenceRule } from "../scheduling.js";

const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const SYDNEY = "Australia/Sydney";

function weeklyRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    frequency: "weekly",
    weekdays: [1, 3, 5],
    startDate: "2026-08-03",
    endDate: null,
    startTimeLocal: "06:00:00",
    durationMinutes: 180,
    ...overrides,
  };
}

const baseOptions = {
  shiftTemplateId: TEMPLATE_ID,
  timeZone: SYDNEY,
  rangeStart: "2026-08-03",
  rangeEnd: "2026-08-09",
};

describe("expandRecurrence", () => {
  it("produces one occurrence per selected weekday in range", () => {
    const occurrences = expandRecurrence(weeklyRule(), baseOptions);
    expect(occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-07",
    ]);
  });

  it("is idempotent: the same range yields identical occurrence keys", () => {
    const first = expandRecurrence(weeklyRule(), baseOptions);
    const second = expandRecurrence(weeklyRule(), baseOptions);
    expect(second.map((o) => o.occurrenceKey)).toEqual(first.map((o) => o.occurrenceKey));
  });

  it("produces unique occurrence keys", () => {
    const keys = expandRecurrence(weeklyRule({ frequency: "daily" }), baseOptions).map(
      (occurrence) => occurrence.occurrenceKey,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stops at the rule end date even when the range runs longer", () => {
    const occurrences = expandRecurrence(weeklyRule({ endDate: "2026-08-05" }), baseOptions);
    expect(occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      "2026-08-03",
      "2026-08-05",
    ]);
  });

  it("emits every second week for a fortnightly rule", () => {
    const occurrences = expandRecurrence(weeklyRule({ frequency: "fortnightly", weekdays: [1] }), {
      ...baseOptions,
      rangeEnd: "2026-09-01",
    });
    expect(occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      "2026-08-03",
      "2026-08-17",
      "2026-08-31",
    ]);
  });

  it("keeps the local start time across the DST transition", () => {
    // Sydney moves to daylight saving on 4 October 2026.
    const occurrences = expandRecurrence(weeklyRule({ frequency: "daily" }), {
      ...baseOptions,
      rangeStart: "2026-10-03",
      rangeEnd: "2026-10-05",
    });
    const utcInstants = occurrences.map((occurrence) => occurrence.scheduledStart.toISOString());
    expect(utcInstants).toEqual([
      "2026-10-02T20:00:00.000Z", // 3 October, 06:00 AEST (UTC+10)
      "2026-10-03T19:00:00.000Z", // 4 October, 06:00 AEDT — clocks moved at 02:00
      "2026-10-04T19:00:00.000Z", // 5 October, 06:00 AEDT (UTC+11)
    ]);
  });

  it("computes the end instant from the duration", () => {
    const [first] = expandRecurrence(weeklyRule(), baseOptions);
    expect(first).toBeDefined();
    const durationMs = first!.scheduledEnd.getTime() - first!.scheduledStart.getTime();
    expect(durationMs).toBe(180 * 60_000);
  });

  it("rejects a weekly rule with no weekdays", () => {
    expect(() => expandRecurrence(weeklyRule({ weekdays: [] }), baseOptions)).toThrow(
      RecurrenceError,
    );
  });

  it("rejects a backwards range", () => {
    expect(() =>
      expandRecurrence(weeklyRule(), { ...baseOptions, rangeEnd: "2026-08-01" }),
    ).toThrow(RecurrenceError);
  });

  it("refuses to expand beyond the occurrence ceiling", () => {
    expect(() =>
      expandRecurrence(weeklyRule({ frequency: "daily" }), {
        ...baseOptions,
        rangeEnd: "2030-08-09",
      }),
    ).toThrow(RecurrenceError);
  });
});

describe("timezone helpers", () => {
  it("reports the Sydney offset either side of the transition", () => {
    expect(zoneOffsetMinutes(SYDNEY, new Date("2026-08-09T00:00:00Z"))).toBe(600);
    expect(zoneOffsetMinutes(SYDNEY, new Date("2026-12-09T00:00:00Z"))).toBe(660);
  });

  it("converts a local wall time to the matching UTC instant", () => {
    const instant = localWallTimeToUtc("2026-08-09", "06:00:00", SYDNEY);
    expect(instant.toISOString()).toBe("2026-08-08T20:00:00.000Z");
  });
});
