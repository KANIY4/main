import type {
  CalendarAssumptions,
  LabourBreakdown,
  LabourCategory,
  LabourLine,
  LabourLineResult,
  LabourProfile,
  OnCostRule,
  QuoteCalculationInput,
  ScenarioConfig,
} from '@cleanquote/types';

import type {
  Decimal} from './decimal.js';
import {
  dec,
  fromPct,
  hours,
  money,
  ONE,
  PricingError,
  safeDivide,
  sum,
  ZERO,
} from './decimal.js';
import { occurrencesPerYear } from './schedule.js';

/** Categories whose hours are scaled by the scenario's supervision multiplier. */
const SUPERVISION_CATEGORIES: ReadonlySet<LabourCategory> = new Set(['supervision', 'management']);

/** Categories that are always billed once, at mobilisation, regardless of schedule. */
const ONE_OFF_CATEGORIES: ReadonlySet<LabourCategory> = new Set(['mobilisation', 'initial_clean']);

interface HoursStage {
  readonly line: LabourLine;
  readonly occurrences: Decimal;
  readonly productiveHours: Decimal;
  readonly oneOff: boolean;
}

function scenarioMultiplier(category: LabourCategory, scenario: ScenarioConfig): Decimal {
  return SUPERVISION_CATEGORIES.has(category)
    ? dec(scenario.supervisionMultiplier)
    : dec(scenario.productivityMultiplier);
}

function isOneOff(line: LabourLine): boolean {
  return line.schedule.pattern === 'one_off' || ONE_OFF_CATEGORIES.has(line.category);
}

/** Raw production hours for a single occurrence, before scenario scaling. */
function hoursPerOccurrence(line: LabourLine): Decimal {
  switch (line.kind) {
    case 'productivity': {
      const quantity = dec(line.quantity);
      if (quantity.isNegative()) {
        throw new PricingError('INVALID_PRODUCTIVITY', `Line ${line.id} has a negative quantity`, {
          lineId: line.id,
        });
      }
      let base: Decimal;
      if (line.productivity.method === 'units_per_hour') {
        const rate = dec(line.productivity.value);
        if (rate.lte(0)) {
          throw new PricingError(
            'INVALID_PRODUCTIVITY',
            `Line ${line.id} has a units_per_hour productivity of ${rate.toString()}; it must be greater than zero`,
            { lineId: line.id },
          );
        }
        base = quantity.div(rate);
      } else {
        const minutes = dec(line.productivity.value);
        if (minutes.isNegative()) {
          throw new PricingError(
            'INVALID_PRODUCTIVITY',
            `Line ${line.id} has a negative minutes_per_unit value`,
            { lineId: line.id },
          );
        }
        base = quantity.mul(minutes).div(60);
      }

      const f = line.factors ?? {};
      return base
        .mul(f.difficulty ?? 1)
        .mul(f.soil ?? 1)
        .mul(f.traffic ?? 1)
        .mul(f.furnitureDensity ?? 1)
        .mul(f.access ?? 1)
        .mul(f.compliance ?? 1);
    }

    case 'staffing': {
      const cleaners = dec(line.cleanersPerShift);
      const shiftHours = dec(line.hoursPerShift);
      if (cleaners.isNegative() || shiftHours.isNegative()) {
        throw new PricingError(
          'INVALID_PRODUCTIVITY',
          `Line ${line.id} has negative staffing values`,
          { lineId: line.id },
        );
      }
      return cleaners.mul(shiftHours);
    }

    case 'percent_of_labour':
      // Derived in a second pass once the basis hours are known.
      return ZERO;

    default: {
      const exhaustive: never = line;
      throw new PricingError('INVALID_PRODUCTIVITY', `Unsupported labour line kind`, {
        line: exhaustive,
      });
    }
  }
}

function computeHours(
  lines: readonly LabourLine[],
  calendar: CalendarAssumptions,
  scenario: ScenarioConfig,
): HoursStage[] {
  const direct: HoursStage[] = lines
    .filter((line) => line.kind !== 'percent_of_labour')
    .map((line) => {
      const occurrences = occurrencesPerYear(line.schedule, calendar);
      const productiveHours = hoursPerOccurrence(line)
        .mul(occurrences)
        .mul(scenarioMultiplier(line.category, scenario));
      return { line, occurrences, productiveHours, oneOff: isOneOff(line) };
    });

  const derived: HoursStage[] = lines
    .filter((line): line is Extract<LabourLine, { kind: 'percent_of_labour' }> => {
      return line.kind === 'percent_of_labour';
    })
    .map((line) => {
      const basisCategories = new Set<LabourCategory>(line.basisCategories ?? ['routine']);
      const basisHours = sum(
        direct
          .filter((stage) => basisCategories.has(stage.line.category) && !stage.oneOff)
          .map((stage) => stage.productiveHours),
      );
      const productiveHours = basisHours
        .mul(fromPct(line.percentOfHours))
        .mul(scenarioMultiplier(line.category, scenario));
      return {
        line,
        occurrences: occurrencesPerYear(line.schedule, calendar),
        productiveHours,
        oneOff: isOneOff(line),
      };
    });

  // Preserve the caller's ordering so the UI trace matches the rate card.
  const byId = new Map<string, HoursStage>([...direct, ...derived].map((s) => [s.line.id, s]));
  return lines.map((line) => {
    const stage = byId.get(line.id);
    if (!stage) {
      throw new PricingError('INVALID_PRODUCTIVITY', `Duplicate labour line id: ${line.id}`);
    }
    return stage;
  });
}

/**
 * Applies the on-cost cascade to a base hourly rate.
 *
 * Order matters: a payroll tax that is levied on wages *including* superannuation must
 * carry a higher `order` and `appliesTo: 'running_total'`. `fixed_per_year` rules are
 * excluded here and allocated across lines afterwards.
 */
export function effectiveHourlyCost(
  baseRate: Decimal,
  profile: LabourProfile,
  rules: readonly OnCostRule[],
): Decimal {
  const applicable = rules
    .filter((rule) => rule.method !== 'fixed_per_year')
    .filter(
      (rule) =>
        !rule.appliesToEngagements ||
        rule.appliesToEngagements.length === 0 ||
        rule.appliesToEngagements.includes(profile.engagement),
    )
    .slice()
    .sort((a, b) => a.order - b.order);

  let running = baseRate;
  for (const rule of applicable) {
    if (rule.method === 'percent') {
      const basis = rule.appliesTo === 'base' ? baseRate : running;
      running = running.plus(basis.mul(fromPct(rule.value)));
    } else {
      running = running.plus(dec(rule.value));
    }
  }
  return running;
}

export function computeLabour(
  input: QuoteCalculationInput,
  scenario: ScenarioConfig,
): LabourBreakdown {
  const profiles = new Map(input.labourProfiles.map((p) => [p.code, p]));
  const absenceUplift = ONE.plus(fromPct(input.absenceAllowancePct));
  const stages = computeHours(input.labourLines, input.calendar, scenario);

  interface Priced {
    stage: HoursStage;
    profile: LabourProfile;
    paidHours: Decimal;
    baseRate: Decimal;
    effectiveRate: Decimal;
    baseCost: Decimal;
    onCost: Decimal;
  }

  const priced: Priced[] = stages.map((stage) => {
    const profile = profiles.get(stage.line.labourProfileCode);
    if (!profile) {
      throw new PricingError(
        'UNKNOWN_LABOUR_PROFILE',
        `Labour line "${stage.line.id}" references unknown profile "${stage.line.labourProfileCode}"`,
        { lineId: stage.line.id, profileCode: stage.line.labourProfileCode },
      );
    }
    const paidHours = stage.productiveHours.mul(absenceUplift);
    const baseRate = dec(profile.baseHourlyRate).mul(ONE.plus(fromPct(stage.line.rateLoadingPct)));
    const effectiveRate = effectiveHourlyCost(baseRate, profile, input.onCostRules);
    return {
      stage,
      profile,
      paidHours,
      baseRate,
      effectiveRate,
      baseCost: paidHours.mul(baseRate),
      onCost: paidHours.mul(effectiveRate.minus(baseRate)),
    };
  });

  // Fixed annual on-costs (uniform allowance, licence fees) are spread across the lines
  // that use an affected profile, in proportion to paid hours.
  const fixedRules = input.onCostRules.filter((rule) => rule.method === 'fixed_per_year');
  const fixedAllocation = new Map<string, Decimal>();
  for (const rule of fixedRules) {
    const eligible = priced.filter(
      (p) =>
        !rule.appliesToEngagements ||
        rule.appliesToEngagements.length === 0 ||
        rule.appliesToEngagements.includes(p.profile.engagement),
    );
    const totalHours = sum(eligible.map((p) => p.paidHours));
    if (totalHours.isZero()) continue;
    const amount = dec(rule.value);
    for (const p of eligible) {
      const share = amount.mul(p.paidHours).div(totalHours);
      const key = p.stage.line.id;
      fixedAllocation.set(key, (fixedAllocation.get(key) ?? ZERO).plus(share));
    }
  }

  const lines: LabourLineResult[] = priced.map((p) => {
    const allocated = fixedAllocation.get(p.stage.line.id) ?? ZERO;
    const onCostAmount = p.onCost.plus(allocated);
    const totalCost = p.baseCost.plus(onCostAmount);
    return {
      lineId: p.stage.line.id,
      label: p.stage.line.label,
      category: p.stage.line.category,
      occurrencesPerYear: hours(p.stage.occurrences),
      productiveHoursPerYear: hours(p.stage.productiveHours),
      paidHoursPerYear: hours(p.paidHours),
      baseRate: money(p.baseRate, 4),
      effectiveHourlyCost: money(safeDivide(totalCost, p.paidHours), 4),
      baseCost: money(p.baseCost),
      onCostAmount: money(onCostAmount),
      totalCost: money(totalCost),
      oneOff: p.stage.oneOff,
    };
  });

  const recurring = priced.filter((p) => !p.stage.oneOff);
  const oneOff = priced.filter((p) => p.stage.oneOff);
  const lineTotal = (p: Priced) =>
    p.baseCost.plus(p.onCost).plus(fixedAllocation.get(p.stage.line.id) ?? ZERO);

  const recurringCost = sum(recurring.map(lineTotal));
  const oneOffCost = sum(oneOff.map(lineTotal));
  const recurringPaidHours = sum(recurring.map((p) => p.paidHours));
  const totalCost = recurringCost.plus(oneOffCost);
  const totalPaidHours = recurringPaidHours.plus(sum(oneOff.map((p) => p.paidHours)));

  return {
    lines,
    recurringProductiveHoursPerYear: hours(sum(recurring.map((p) => p.stage.productiveHours))),
    recurringPaidHoursPerYear: hours(recurringPaidHours),
    oneOffPaidHours: hours(sum(oneOff.map((p) => p.paidHours))),
    recurringCost: money(recurringCost),
    oneOffCost: money(oneOffCost),
    totalCost: money(totalCost),
    onCostTotal: money(sum(priced.map((p) => p.onCost)).plus(sum([...fixedAllocation.values()]))),
    blendedHourlyCost: money(safeDivide(totalCost, totalPaidHours), 4),
  };
}
