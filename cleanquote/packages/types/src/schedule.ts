/**
 * Service scheduling.
 *
 * Everything in the pricing engine is ultimately reduced to *occurrences per year*.
 * Monthly value is NEVER weekly value x 4 — it is annual value / 12, derived from the
 * annualised occurrence count. See docs/PRICING_ENGINE.md.
 */

export type SchedulePattern =
  | 'one_off'
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'biannual'
  | 'annual'
  | 'on_demand'
  | 'custom_per_year';

export interface ServiceSchedule {
  readonly pattern: SchedulePattern;
  /**
   * Weekly pattern only: number of serviced days in a week (1-7).
   * A 5-day office contract is `daysPerWeek: 5`.
   */
  readonly daysPerWeek?: number;
  /** Weekly pattern only: visits on each serviced day (e.g. 2 for a split shift). */
  readonly visitsPerServiceDay?: number;
  /** Monthly pattern only: visits per month (e.g. 2 for fortnightly-ish monthly billing). */
  readonly timesPerMonth?: number;
  /** `custom_per_year` only: explicit annual occurrence count. */
  readonly occurrencesPerYear?: number;
  /**
   * `on_demand` only: the number of call-outs to budget for per year. On-demand work is
   * priced but flagged as an assumption because the true count is not contractual.
   */
  readonly budgetedCallOutsPerYear?: number;
  /** When false, serviced days that fall on a public holiday are removed from the year. */
  readonly serviceOnPublicHolidays?: boolean;
}

/**
 * Calendar assumptions are organisation-configurable because they materially change
 * annualised value. Defaults use the true mean Gregorian year (365.2425 / 7).
 */
export interface CalendarAssumptions {
  readonly weeksPerYear: number;
  readonly monthsPerYear: number;
  /** Used only when `serviceOnPublicHolidays` is false on a weekly schedule. */
  readonly publicHolidaysPerYear: number;
  /** How many public holidays fall on a serviced weekday, as a fraction (0-1). */
  readonly publicHolidayServiceDayFraction: number;
}

export const DEFAULT_CALENDAR: CalendarAssumptions = {
  weeksPerYear: 52.1775,
  monthsPerYear: 12,
  publicHolidaysPerYear: 0,
  publicHolidayServiceDayFraction: 1,
};
