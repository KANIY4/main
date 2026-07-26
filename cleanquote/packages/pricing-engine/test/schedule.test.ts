import type { CalendarAssumptions } from '@cleanquote/types';
import { DEFAULT_CALENDAR } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { PricingError } from '../src/decimal';
import { isOneOffSchedule, occurrencesPerYear } from '../src/schedule';

const calendar: CalendarAssumptions = {
  weeksPerYear: 52,
  monthsPerYear: 12,
  publicHolidaysPerYear: 10,
  publicHolidayServiceDayFraction: 1,
};

describe('occurrencesPerYear', () => {
  it('annualises a five-day weekly contract from the calendar rather than assuming 52', () => {
    expect(
      occurrencesPerYear({ pattern: 'weekly', daysPerWeek: 5 }, DEFAULT_CALENDAR).toFixed(4),
    ).toBe('260.8875');
  });

  it('counts each visit of a split shift separately', () => {
    const result = occurrencesPerYear(
      { pattern: 'weekly', daysPerWeek: 5, visitsPerServiceDay: 2 },
      calendar,
    );
    expect(result.toString()).toBe('520');
  });

  it('removes public holidays when the contract is not serviced on them', () => {
    const result = occurrencesPerYear(
      { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
      calendar,
    );
    expect(result.toString()).toBe('250');
  });

  it('only removes the share of public holidays that fall on a serviced day', () => {
    const weekendOnly: CalendarAssumptions = {
      ...calendar,
      publicHolidayServiceDayFraction: 0.2,
    };
    const result = occurrencesPerYear(
      { pattern: 'weekly', daysPerWeek: 2, serviceOnPublicHolidays: false },
      weekendOnly,
    );
    expect(result.toString()).toBe('102');
  });

  it('never returns a negative occurrence count when holidays exceed serviced days', () => {
    const absurd: CalendarAssumptions = { ...calendar, publicHolidaysPerYear: 5000 };
    const result = occurrencesPerYear(
      { pattern: 'weekly', daysPerWeek: 1, serviceOnPublicHolidays: false },
      absurd,
    );
    expect(result.toString()).toBe('0');
  });

  it.each([
    ['one_off' as const, {}, '1'],
    ['fortnightly' as const, {}, '26'],
    ['monthly' as const, {}, '12'],
    ['monthly' as const, { timesPerMonth: 2 }, '24'],
    ['quarterly' as const, {}, '4'],
    ['biannual' as const, {}, '2'],
    ['annual' as const, {}, '1'],
    ['on_demand' as const, { budgetedCallOutsPerYear: 6 }, '6'],
    ['on_demand' as const, {}, '0'],
    ['custom_per_year' as const, { occurrencesPerYear: 17 }, '17'],
  ])('resolves the %s pattern', (pattern, extra, expected) => {
    expect(occurrencesPerYear({ pattern, ...extra }, calendar).toString()).toBe(expected);
  });

  it('rejects a weekly schedule with more than seven service days', () => {
    expect(() => occurrencesPerYear({ pattern: 'weekly', daysPerWeek: 8 }, calendar)).toThrow(
      PricingError,
    );
  });

  it('rejects a weekly schedule with zero service days', () => {
    expect(() => occurrencesPerYear({ pattern: 'weekly', daysPerWeek: 0 }, calendar)).toThrow(
      /daysPerWeek between 1 and 7/,
    );
  });

  it('rejects a weekly schedule with zero visits per service day', () => {
    expect(() =>
      occurrencesPerYear({ pattern: 'weekly', daysPerWeek: 5, visitsPerServiceDay: 0 }, calendar),
    ).toThrow(/visitsPerServiceDay/);
  });

  it('rejects a custom schedule without an occurrence count', () => {
    expect(() => occurrencesPerYear({ pattern: 'custom_per_year' }, calendar)).toThrow(
      /non-negative occurrencesPerYear/,
    );
  });
});

describe('isOneOffSchedule', () => {
  it('identifies a one-off schedule', () => {
    expect(isOneOffSchedule({ pattern: 'one_off' })).toBe(true);
  });

  it('does not treat an annual schedule as one-off', () => {
    expect(isOneOffSchedule({ pattern: 'annual' })).toBe(false);
  });
});
