import type { LabourLine, OnCostRule } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { dec, PricingError } from '../src/decimal.js';
import { computeLabour, effectiveHourlyCost } from '../src/labour.js';
import { CLEANER, baseInput, scenario } from './helpers/fixtures.js';

describe('effectiveHourlyCost', () => {
  const cascade: OnCostRule[] = [
    {
      code: 'super',
      label: 'Superannuation',
      method: 'percent',
      value: '11.5',
      appliesTo: 'base',
      order: 10,
    },
    {
      code: 'workers_comp',
      label: 'Workers compensation',
      method: 'percent',
      value: '3.5',
      appliesTo: 'base',
      order: 20,
    },
    {
      code: 'payroll_tax',
      label: 'Payroll tax',
      method: 'percent',
      value: '4.85',
      appliesTo: 'running_total',
      order: 30,
    },
    {
      code: 'uniform',
      label: 'Uniform allowance',
      method: 'per_paid_hour',
      value: '0.35',
      appliesTo: 'base',
      order: 40,
    },
  ];

  it('applies percentage on-costs to the base rate when appliesTo is base', () => {
    const result = effectiveHourlyCost(dec('30'), CLEANER, [cascade[0]!]);
    expect(result.toString()).toBe('33.45');
  });

  it('levies a running-total on-cost on the amounts added before it', () => {
    // 30 + 3.45 (super) + 1.05 (workers comp) = 34.50; payroll tax of 4.85% = 1.67325.
    const result = effectiveHourlyCost(dec('30'), CLEANER, cascade.slice(0, 3));
    expect(result.toString()).toBe('36.17325');
  });

  it('respects rule order rather than array order', () => {
    const reversed = [...cascade].reverse();
    expect(effectiveHourlyCost(dec('30'), CLEANER, reversed).toString()).toBe(
      effectiveHourlyCost(dec('30'), CLEANER, cascade).toString(),
    );
  });

  it('adds per-hour on-costs as a flat amount', () => {
    const result = effectiveHourlyCost(dec('30'), CLEANER, cascade);
    expect(result.toString()).toBe('36.52325');
  });

  it('skips on-costs that do not apply to the engagement type', () => {
    const subcontractor = { ...CLEANER, engagement: 'subcontractor' as const };
    const employeeOnly: OnCostRule[] = [{ ...cascade[0]!, appliesToEngagements: ['employee'] }];
    expect(effectiveHourlyCost(dec('30'), subcontractor, employeeOnly).toString()).toBe('30');
  });

  it('excludes fixed annual on-costs from the hourly rate', () => {
    const fixed: OnCostRule[] = [
      {
        code: 'licences',
        label: 'Licences',
        method: 'fixed_per_year',
        value: '5000',
        appliesTo: 'base',
        order: 1,
      },
    ];
    expect(effectiveHourlyCost(dec('30'), CLEANER, fixed).toString()).toBe('30');
  });
});

describe('computeLabour', () => {
  it('derives annual hours from a staffing model', () => {
    const result = computeLabour(baseInput(), scenario());
    expect(result.recurringProductiveHoursPerYear).toBe('520.0000');
    expect(result.recurringCost).toBe('15600.00');
  });

  it('derives annual hours from a productivity benchmark', () => {
    const line: LabourLine = {
      id: 'floors',
      kind: 'productivity',
      label: 'Vacuum open plan',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'weekly', daysPerWeek: 5 },
      quantity: 1000,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 250 },
    };
    const result = computeLabour(baseInput({ labourLines: [line] }), scenario());
    // 1000 / 250 = 4 hours a visit, 260 visits a year.
    expect(result.recurringProductiveHoursPerYear).toBe('1040.0000');
  });

  it('multiplies production hours by every adjustment factor', () => {
    const line: LabourLine = {
      id: 'floors',
      kind: 'productivity',
      label: 'Vacuum open plan',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: 1000,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 250 },
      factors: { soil: 1.2, traffic: 1.1, access: 1.25 },
    };
    const result = computeLabour(baseInput({ labourLines: [line] }), scenario());
    // 4 x 1.2 x 1.1 x 1.25 = 6.6
    expect(result.recurringProductiveHoursPerYear).toBe('6.6000');
  });

  it('converts a minutes-per-unit benchmark into hours', () => {
    const line: LabourLine = {
      id: 'toilets',
      kind: 'productivity',
      label: 'Service toilet pans',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: 30,
      quantityUnit: 'fixture',
      productivity: { method: 'minutes_per_unit', value: 6 },
    };
    const result = computeLabour(baseInput({ labourLines: [line] }), scenario());
    expect(result.recurringProductiveHoursPerYear).toBe('3.0000');
  });

  it('derives supervision as a percentage of routine hours', () => {
    const supervision: LabourLine = {
      id: 'supervision',
      kind: 'percent_of_labour',
      label: 'Site supervision',
      category: 'supervision',
      labourProfileCode: 'supervisor',
      schedule: { pattern: 'weekly', daysPerWeek: 5 },
      percentOfHours: '10',
    };
    const result = computeLabour(baseInput({ labourLines: [supervision] }), scenario());
    expect(result.recurringProductiveHoursPerYear).toBe('0.0000');

    const withRoutine = computeLabour(
      baseInput({ labourLines: [...baseInput().labourLines, supervision] }),
      scenario(),
    );
    // 10% of the 520 routine hours.
    const supervisionLine = withRoutine.lines.find((l) => l.lineId === 'supervision');
    expect(supervisionLine?.productiveHoursPerYear).toBe('52.0000');
  });

  it('grosses productive hours up to paid hours using the absence allowance', () => {
    const result = computeLabour(baseInput({ absenceAllowancePct: '12' }), scenario());
    expect(result.recurringProductiveHoursPerYear).toBe('520.0000');
    expect(result.recurringPaidHoursPerYear).toBe('582.4000');
    expect(result.recurringCost).toBe('17472.00');
  });

  it('applies a rate loading to the line without changing the profile rate', () => {
    const weekend: LabourLine = { ...baseInput().labourLines[0]!, rateLoadingPct: '50' };
    const result = computeLabour(baseInput({ labourLines: [weekend] }), scenario());
    expect(result.recurringCost).toBe('23400.00');
  });

  it('scales routine hours by the scenario productivity multiplier', () => {
    const lean = computeLabour(baseInput(), scenario({ productivityMultiplier: 0.95 }));
    expect(lean.recurringProductiveHoursPerYear).toBe('494.0000');
  });

  it('scales supervision by the supervision multiplier, not the productivity multiplier', () => {
    const supervision: LabourLine = {
      id: 'supervision',
      kind: 'percent_of_labour',
      label: 'Site supervision',
      category: 'supervision',
      labourProfileCode: 'supervisor',
      schedule: { pattern: 'weekly', daysPerWeek: 5 },
      percentOfHours: '10',
    };
    const result = computeLabour(
      baseInput({ labourLines: [...baseInput().labourLines, supervision] }),
      scenario({ productivityMultiplier: 1, supervisionMultiplier: 1.5 }),
    );
    const line = result.lines.find((l) => l.lineId === 'supervision');
    expect(line?.productiveHoursPerYear).toBe('78.0000');
  });

  it('separates one-off mobilisation labour from recurring labour', () => {
    const initialClean: LabourLine = {
      id: 'initial',
      kind: 'staffing',
      label: 'Initial deep clean',
      category: 'initial_clean',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'one_off' },
      cleanersPerShift: 4,
      hoursPerShift: 8,
    };
    const result = computeLabour(
      baseInput({ labourLines: [...baseInput().labourLines, initialClean] }),
      scenario(),
    );
    expect(result.recurringCost).toBe('15600.00');
    expect(result.oneOffCost).toBe('960.00');
    expect(result.oneOffPaidHours).toBe('32.0000');
  });

  it('allocates fixed annual on-costs across lines in proportion to paid hours', () => {
    const second: LabourLine = {
      id: 'periodical',
      kind: 'staffing',
      label: 'Monthly periodical',
      category: 'periodical',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'weekly', daysPerWeek: 5 },
      cleanersPerShift: 1,
      hoursPerShift: 1,
    };
    const rules: OnCostRule[] = [
      {
        code: 'licences',
        label: 'Licences and registrations',
        method: 'fixed_per_year',
        value: '900',
        appliesTo: 'base',
        order: 1,
      },
    ];
    const result = computeLabour(
      baseInput({ labourLines: [...baseInput().labourLines, second], onCostRules: rules }),
      scenario(),
    );
    // 520 and 260 paid hours -> a 2:1 split of the 900.
    expect(result.lines.find((l) => l.lineId === 'nightly')?.onCostAmount).toBe('600.00');
    expect(result.lines.find((l) => l.lineId === 'periodical')?.onCostAmount).toBe('300.00');
  });

  it('rejects a labour line pointing at an unknown rate-card profile', () => {
    const orphan: LabourLine = { ...baseInput().labourLines[0]!, labourProfileCode: 'ghost' };
    expect(() => computeLabour(baseInput({ labourLines: [orphan] }), scenario())).toThrow(
      PricingError,
    );
  });

  it('rejects a zero productivity rate rather than dividing by zero', () => {
    const line: LabourLine = {
      id: 'bad',
      kind: 'productivity',
      label: 'Broken benchmark',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: 100,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 0 },
    };
    expect(() => computeLabour(baseInput({ labourLines: [line] }), scenario())).toThrow(
      /greater than zero/,
    );
  });

  it('rejects a negative quantity', () => {
    const line: LabourLine = {
      id: 'bad',
      kind: 'productivity',
      label: 'Negative area',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: -100,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 250 },
    };
    expect(() => computeLabour(baseInput({ labourLines: [line] }), scenario())).toThrow(
      /negative quantity/,
    );
  });
});
