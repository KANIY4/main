import type { CalendarAssumptions, ServiceSchedule } from '@cleanquote/types';

import { dec, Decimal, PricingError, ZERO } from './decimal';

/**
 * Reduces any schedule to occurrences per year.
 *
 * This single function is why monthly value is never "weekly x 4". Every recurring
 * figure in the engine is derived from the annual occurrence count and the organisation's
 * calendar assumptions, so a 5-day contract annualises to 260.89 visits, not 260.
 */
export function occurrencesPerYear(
  schedule: ServiceSchedule,
  calendar: CalendarAssumptions,
): Decimal {
  const weeks = dec(calendar.weeksPerYear);
  const months = dec(calendar.monthsPerYear);

  switch (schedule.pattern) {
    case 'one_off':
      return dec(1);

    case 'weekly': {
      const daysPerWeek = schedule.daysPerWeek ?? 5;
      if (daysPerWeek <= 0 || daysPerWeek > 7) {
        throw new PricingError(
          'INVALID_SCHEDULE',
          `Weekly schedule needs daysPerWeek between 1 and 7, received ${daysPerWeek}`,
          { schedule },
        );
      }
      const visitsPerDay = schedule.visitsPerServiceDay ?? 1;
      if (visitsPerDay <= 0) {
        throw new PricingError(
          'INVALID_SCHEDULE',
          `visitsPerServiceDay must be greater than zero, received ${visitsPerDay}`,
          { schedule },
        );
      }

      let servicedDays = dec(daysPerWeek).mul(weeks);
      if (schedule.serviceOnPublicHolidays === false) {
        // `publicHolidayServiceDayFraction` is the share of the year's public holidays
        // that actually land on a day this contract is serviced.
        const lostDays = dec(calendar.publicHolidaysPerYear).mul(
          calendar.publicHolidayServiceDayFraction,
        );
        servicedDays = Decimal.max(servicedDays.minus(lostDays), ZERO);
      }
      return servicedDays.mul(visitsPerDay);
    }

    case 'fortnightly':
      return weeks.div(2);

    case 'monthly':
      return months.mul(schedule.timesPerMonth ?? 1);

    case 'quarterly':
      return dec(4);

    case 'biannual':
      return dec(2);

    case 'annual':
      return dec(1);

    case 'on_demand':
      // Budgeted call-outs, not a contractual count. The caller flags this as an
      // assumption; pricing zero call-outs is legitimate (fully reactive, priced ad hoc).
      return dec(schedule.budgetedCallOutsPerYear ?? 0);

    case 'custom_per_year': {
      const value = schedule.occurrencesPerYear;
      if (value === undefined || value < 0) {
        throw new PricingError(
          'INVALID_SCHEDULE',
          'custom_per_year schedule requires a non-negative occurrencesPerYear',
          { schedule },
        );
      }
      return dec(value);
    }

    default: {
      const exhaustive: never = schedule.pattern;
      throw new PricingError('INVALID_SCHEDULE', `Unsupported schedule pattern: ${exhaustive}`);
    }
  }
}

/** One-off work is excluded from recurring value and billed at mobilisation. */
export function isOneOffSchedule(schedule: ServiceSchedule): boolean {
  return schedule.pattern === 'one_off';
}
