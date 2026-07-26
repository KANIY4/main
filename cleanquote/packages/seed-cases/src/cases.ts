import type { QuoteCalculationInput } from '@cleanquote/types';
import { CALCULATION_SCHEMA_VERSION } from '@cleanquote/types';

import {
  ABSENCE_ALLOWANCE_PCT,
  AU_CALENDAR,
  GST,
  GUARDRAILS,
  ON_COSTS,
  OVERHEADS,
  PROFILES,
  SCENARIOS,
} from './shared';

/**
 * The five demonstration cases from the product specification.
 *
 * They serve three purposes at once: development seed data, a regression corpus
 * for the pricing engine, and the fixtures behind the web app's demo mode. Each
 * one is a realistic shape of work rather than a toy — a case that never hits a
 * guardrail or never carries a risk would not tell us anything.
 *
 * These are development fixtures. They are never loaded into a production tenant.
 */

export interface SeedCase {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** What this case is meant to exercise, so a failing assertion is diagnosable. */
  readonly exercises: readonly string[];
  readonly input: QuoteCalculationInput;
}

const base = {
  calculationSchemaVersion: CALCULATION_SCHEMA_VERSION,
  currency: 'AUD',
  rounding: { increment: '0.01', mode: 'half_up' } as const,
  calendar: AU_CALENDAR,
  labourProfiles: PROFILES,
  onCostRules: ON_COSTS,
  absenceAllowancePct: ABSENCE_ALLOWANCE_PCT,
  overheadRules: OVERHEADS,
  scenarios: SCENARIOS,
  guardrails: GUARDRAILS,
  tax: GST,
};

// ---------------------------------------------------------------------------
// Case 1 — recurring multi-floor office
// ---------------------------------------------------------------------------

export const recurringOffice: SeedCase = {
  id: 'recurring-office',
  title: 'Riverside Corporate Park — three-floor office, five nights',
  summary:
    'A 2,400 m² office over three floors with mixed carpet and hard flooring, 140 workstations, six amenity blocks and two kitchens. Night cleaning, five nights, with a monthly periodical programme.',
  exercises: [
    'productivity-driven and staffing-driven labour in one quote',
    'supervision derived as a percentage of routine hours',
    'periodical work on a separate frequency from routine work',
    'public holidays removed from the serviced year',
  ],
  input: {
    ...base,
    labourLines: [
      {
        id: 'floors-carpet',
        kind: 'productivity',
        label: 'Vacuum carpeted open plan and offices',
        category: 'routine',
        labourProfileCode: 'cleaner_night',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 1650,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 800 },
        factors: { furnitureDensity: 1.15, traffic: 1.1 },
      },
      {
        id: 'floors-hard',
        kind: 'productivity',
        label: 'Dust mop and spot mop hard flooring',
        category: 'routine',
        labourProfileCode: 'cleaner_night',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 750,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 900 },
        factors: { traffic: 1.15 },
      },
      {
        id: 'amenities',
        kind: 'productivity',
        label: 'Service amenity blocks',
        category: 'routine',
        labourProfileCode: 'cleaner_night',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 24,
        quantityUnit: 'fixture',
        productivity: { method: 'minutes_per_unit', value: 4 },
        factors: { soil: 1.1 },
      },
      {
        id: 'kitchens',
        kind: 'productivity',
        label: 'Kitchens and breakout areas',
        category: 'routine',
        labourProfileCode: 'cleaner_night',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 2,
        quantityUnit: 'each',
        productivity: { method: 'minutes_per_unit', value: 15 },
        factors: { soil: 1.2 },
      },
      {
        id: 'workstations',
        kind: 'productivity',
        label: 'Workstation bins and high-touch points',
        category: 'routine',
        labourProfileCode: 'cleaner_night',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 140,
        quantityUnit: 'each',
        productivity: { method: 'minutes_per_unit', value: 0.25 },
      },
      {
        id: 'supervision',
        kind: 'percent_of_labour',
        label: 'Site supervision and quality auditing',
        category: 'supervision',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'weekly', daysPerWeek: 5 },
        percentOfHours: '9',
      },
      {
        id: 'periodical-carpet',
        kind: 'productivity',
        label: 'Periodical carpet extraction',
        category: 'periodical',
        labourProfileCode: 'specialist',
        schedule: { pattern: 'quarterly' },
        quantity: 1650,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 110 },
      },
      {
        id: 'periodical-hard-floor',
        kind: 'productivity',
        label: 'Periodical hard floor scrub and reseal',
        category: 'periodical',
        labourProfileCode: 'specialist',
        schedule: { pattern: 'biannual' },
        quantity: 750,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 90 },
      },
      {
        id: 'initial-clean',
        kind: 'staffing',
        label: 'Initial detail clean at handover',
        category: 'initial_clean',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'one_off' },
        cleanersPerShift: 4,
        hoursPerShift: 8,
      },
    ],
    costLines: [
      {
        id: 'chemicals',
        label: 'Chemicals and dilution system',
        category: 'chemicals',
        method: 'per_month',
        amount: '185',
      },
      {
        id: 'consumables',
        label: 'Cleaning consumables',
        category: 'consumables',
        method: 'per_month',
        amount: '240',
      },
      {
        id: 'equipment',
        label: 'Machinery allocation and depreciation',
        category: 'equipment',
        method: 'per_month',
        amount: '310',
      },
      {
        id: 'vehicle',
        label: 'Vehicle and travel',
        category: 'vehicle',
        method: 'per_occurrence',
        amount: '11.50',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
      },
      {
        id: 'waste',
        label: 'Waste removal',
        category: 'waste',
        method: 'per_month',
        amount: '160',
      },
      {
        id: 'mobilisation-equipment',
        label: 'Site equipment set-up',
        category: 'equipment',
        method: 'one_off',
        amount: '2400',
      },
      {
        id: 'induction',
        label: 'Site induction and access cards',
        category: 'induction',
        method: 'one_off',
        amount: '480',
      },
    ],
    risks: [
      {
        id: 'r-window',
        code: 'short_cleaning_window',
        label: 'The cleaning window may be shorter than the four hours assumed',
        probability: 0.3,
        impactAmount: '6800',
        mitigation: 'Confirm building access hours in writing before mobilisation.',
        status: 'open',
      },
      {
        id: 'r-turnover',
        code: 'staff_turnover',
        label: 'Night shift turnover in this precinct runs above average',
        probability: 0.35,
        impactAmount: '4200',
        mitigation: 'Budget a deeper relief pool for the first quarter.',
        status: 'open',
      },
    ],
    contract: { termMonths: 36, quoteValidityDays: 30 },
    optionalServices: [
      {
        id: 'day-porter',
        label: 'Day porter, four hours daily',
        annualPrice: '48500',
        annualCost: '31200',
      },
      {
        id: 'window-internal',
        label: 'Internal glass, quarterly',
        annualPrice: '4800',
        annualCost: '2900',
      },
    ],
    dataCompleteness: {
      measurementVerifiedRatio: 0.85,
      aiFactsConfirmedRatio: 0.9,
      missingInformationCount: 2,
      walkthroughCompleted: true,
    },
    strategicContext: {
      priceSensitivity: 'medium',
      incumbentDissatisfaction: 'some',
      routeDensity: 'clustered',
      capacityAvailable: 'normal',
      contractAttractiveness: 'high',
      salesStage: 'shortlisted',
      historicalWinRatePct: '34',
    },
  },
};

// ---------------------------------------------------------------------------
// Case 2 — high-traffic childcare facility
// ---------------------------------------------------------------------------

export const childcareFacility: SeedCase = {
  id: 'childcare-facility',
  title: 'Bright Beginnings Early Learning — daytime touch-point and nightly clean',
  summary:
    'Eight classrooms, amenities and a commercial kitchen. Child-safe chemistry, a daytime touch-point round and a full nightly clean, five days.',
  exercises: [
    'two labour rounds on the same site at different times of day',
    'compliance factors raising production hours',
    'a day porter priced as a fixed staffing commitment',
    'a compliance qualifier that requires human review',
  ],
  input: {
    ...base,
    labourLines: [
      {
        id: 'classrooms',
        kind: 'productivity',
        label: 'Classroom clean and sanitise',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 8,
        quantityUnit: 'each',
        productivity: { method: 'minutes_per_unit', value: 14 },
        factors: { soil: 1.25, compliance: 1.15 },
      },
      {
        id: 'amenities',
        kind: 'productivity',
        label: 'Child and staff amenities',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 14,
        quantityUnit: 'fixture',
        productivity: { method: 'minutes_per_unit', value: 6 },
        factors: { soil: 1.3, compliance: 1.15 },
      },
      {
        id: 'kitchen',
        kind: 'productivity',
        label: 'Commercial kitchen clean',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        quantity: 1,
        quantityUnit: 'each',
        productivity: { method: 'minutes_per_unit', value: 30 },
        factors: { soil: 1.35, compliance: 1.2 },
      },
      {
        id: 'daytime-touchpoint',
        kind: 'staffing',
        label: 'Daytime touch-point round',
        category: 'day_porter',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 5, serviceOnPublicHolidays: false },
        cleanersPerShift: 1,
        hoursPerShift: 2.5,
      },
      {
        id: 'supervision',
        kind: 'percent_of_labour',
        label: 'Supervision and compliance auditing',
        category: 'supervision',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'weekly', daysPerWeek: 5 },
        percentOfHours: '12',
        basisCategories: ['routine', 'day_porter'],
      },
    ],
    costLines: [
      {
        id: 'chemicals',
        label: 'Child-safe chemical programme',
        category: 'chemicals',
        method: 'per_month',
        amount: '265',
      },
      {
        id: 'consumables',
        label: 'Consumables',
        category: 'consumables',
        method: 'per_month',
        amount: '190',
      },
      {
        id: 'training',
        label: 'Child-safe handling training',
        category: 'training',
        method: 'per_year',
        amount: '1800',
      },
      {
        id: 'checks',
        label: 'Working-with-children checks',
        category: 'security_checks',
        method: 'per_year',
        amount: '640',
      },
      {
        id: 'equipment',
        label: 'Colour-coded equipment set',
        category: 'equipment',
        method: 'one_off',
        amount: '1450',
      },
    ],
    risks: [
      {
        id: 'r-illness',
        code: 'outbreak_response',
        label: 'Gastro or hand-foot-and-mouth outbreak requiring additional sanitisation',
        probability: 0.45,
        impactAmount: '5200',
        mitigation: 'Price a standing outbreak-response rate rather than absorbing it.',
        status: 'open',
      },
      {
        id: 'r-access',
        code: 'restricted_access',
        label: 'Daytime work must fit around children being present',
        probability: 0.6,
        impactAmount: '2600',
        status: 'open',
      },
    ],
    contract: { termMonths: 24, quoteValidityDays: 30 },
    dataCompleteness: {
      measurementVerifiedRatio: 0.6,
      aiFactsConfirmedRatio: 0.75,
      missingInformationCount: 4,
      walkthroughCompleted: true,
    },
    strategicContext: {
      priceSensitivity: 'high',
      relationshipStrength: 'weak',
      routeDensity: 'adjacent',
      labourAvailability: 'normal',
      salesStage: 'final_negotiation',
    },
  },
};

// ---------------------------------------------------------------------------
// Case 3 — GMP manufacturing site
// ---------------------------------------------------------------------------

export const gmpManufacturing: SeedCase = {
  id: 'gmp-manufacturing',
  title: 'Meridian Pharma — GMP production and controlled areas',
  summary:
    'Production zones, change rooms and controlled-access areas under GMP procedures. Documented cleaning, gowning, restricted shift windows and specialist equipment.',
  exercises: [
    'compliance factors of real magnitude on production hours',
    'documentation and training carried as recurring direct cost',
    'a high risk register driving contingency',
    'a premium recommendation from low labour availability and isolation',
  ],
  input: {
    ...base,
    labourLines: [
      {
        id: 'production-zones',
        kind: 'productivity',
        label: 'Production zone clean under GMP procedure',
        category: 'routine',
        labourProfileCode: 'specialist',
        schedule: { pattern: 'weekly', daysPerWeek: 6, serviceOnPublicHolidays: false },
        quantity: 1850,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 180 },
        factors: { compliance: 1.45, access: 1.2, soil: 1.15 },
      },
      {
        id: 'change-rooms',
        kind: 'productivity',
        label: 'Gowning and change rooms',
        category: 'routine',
        labourProfileCode: 'specialist',
        schedule: { pattern: 'weekly', daysPerWeek: 6, serviceOnPublicHolidays: false },
        quantity: 6,
        quantityUnit: 'each',
        productivity: { method: 'minutes_per_unit', value: 18 },
        factors: { compliance: 1.4 },
      },
      {
        id: 'documentation',
        kind: 'staffing',
        label: 'Batch documentation and cleaning records',
        category: 'management',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'weekly', daysPerWeek: 6 },
        cleanersPerShift: 1,
        hoursPerShift: 0.75,
      },
      {
        id: 'supervision',
        kind: 'percent_of_labour',
        label: 'GMP supervision',
        category: 'supervision',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'weekly', daysPerWeek: 6 },
        percentOfHours: '15',
      },
      {
        id: 'shutdown-clean',
        kind: 'staffing',
        label: 'Quarterly shutdown deep clean',
        category: 'periodical',
        labourProfileCode: 'specialist',
        schedule: { pattern: 'quarterly' },
        cleanersPerShift: 6,
        hoursPerShift: 10,
      },
    ],
    costLines: [
      {
        id: 'chemicals',
        label: 'Validated chemical programme',
        category: 'chemicals',
        method: 'per_month',
        amount: '640',
      },
      {
        id: 'consumables',
        label: 'Controlled-area consumables and gowning',
        category: 'consumables',
        method: 'per_month',
        amount: '880',
      },
      {
        id: 'equipment',
        label: 'Dedicated controlled-area equipment',
        category: 'equipment',
        method: 'per_month',
        amount: '520',
      },
      {
        id: 'training',
        label: 'GMP training and requalification',
        category: 'training',
        method: 'per_year',
        amount: '7400',
      },
      {
        id: 'testing',
        label: 'Environmental swab testing programme',
        category: 'testing',
        method: 'per_year',
        amount: '5200',
      },
      {
        id: 'induction',
        label: 'Site induction and security clearance',
        category: 'security_checks',
        method: 'per_year',
        amount: '2100',
      },
      {
        id: 'mobilisation',
        label: 'Procedure documentation and validation',
        category: 'certification',
        method: 'one_off',
        amount: '11500',
      },
    ],
    risks: [
      {
        id: 'r-shutdown',
        code: 'shift_restriction',
        label: 'Cleaning windows may be cut short by production overruns',
        probability: 0.5,
        impactAmount: '18000',
        mitigation: 'Agree a minimum guaranteed access window in the contract.',
        status: 'open',
      },
      {
        id: 'r-audit',
        code: 'audit_failure',
        label: 'A failed client audit would require rectification at our cost',
        probability: 0.2,
        impactAmount: '25000',
        mitigation: 'Monthly internal audit against the client procedure.',
        status: 'open',
      },
      {
        id: 'r-labour',
        code: 'specialist_labour_supply',
        label: 'Cleared specialist operators are scarce in this region',
        probability: 0.55,
        impactAmount: '14000',
        status: 'open',
      },
    ],
    contract: { termMonths: 36, quoteValidityDays: 45 },
    dataCompleteness: {
      measurementVerifiedRatio: 0.45,
      aiFactsConfirmedRatio: 0.55,
      missingInformationCount: 7,
      walkthroughCompleted: true,
    },
    strategicContext: {
      priceSensitivity: 'low',
      labourAvailability: 'scarce',
      routeDensity: 'isolated',
      capacityAvailable: 'stretched',
      contractAttractiveness: 'medium',
      salesStage: 'shortlisted',
    },
  },
};

// ---------------------------------------------------------------------------
// Case 4 — ad-hoc window cleaning
// ---------------------------------------------------------------------------

export const windowCleaning: SeedCase = {
  id: 'window-cleaning',
  title: 'Aldgate House — internal and external glass, four elevations',
  summary:
    'A one-off external and internal glass clean across four elevations. Rope access above level three, ground-level water-fed pole below. AR-assisted glass measurement.',
  exercises: [
    'a genuinely one-off quote with no recurring value',
    'subcontracted high-access labour on different on-cost rules',
    'height-access risk and equipment cost',
    'the minimum charge guardrail binding on a small job',
  ],
  input: {
    ...base,
    labourLines: [
      {
        id: 'glass-low',
        kind: 'productivity',
        label: 'Ground to level three, water-fed pole',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'one_off' },
        quantity: 420,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 55 },
        factors: { soil: 1.2 },
      },
      {
        id: 'glass-high',
        kind: 'productivity',
        label: 'Level four and above, rope access',
        category: 'routine',
        labourProfileCode: 'high_access',
        schedule: { pattern: 'one_off' },
        quantity: 560,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 32 },
        factors: { access: 1.25 },
      },
      {
        id: 'glass-internal',
        kind: 'productivity',
        label: 'Internal glass and partitions',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'one_off' },
        quantity: 310,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 70 },
      },
      {
        id: 'supervision',
        kind: 'percent_of_labour',
        label: 'Height-safety supervision',
        category: 'supervision',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'one_off' },
        percentOfHours: '18',
      },
    ],
    costLines: [
      {
        id: 'access-equipment',
        label: 'Rope access equipment and rigging',
        category: 'high_access_equipment',
        method: 'one_off',
        amount: '2850',
      },
      {
        id: 'permits',
        label: 'Height work permits and notifications',
        category: 'certification',
        method: 'one_off',
        amount: '620',
      },
      {
        id: 'travel',
        label: 'Travel and parking',
        category: 'vehicle',
        method: 'one_off',
        amount: '340',
      },
      {
        id: 'consumables',
        label: 'Purified water and consumables',
        category: 'consumables',
        method: 'one_off',
        amount: '210',
      },
    ],
    risks: [
      {
        id: 'r-weather',
        code: 'weather_delay',
        label: 'High wind may abort rope access on the day',
        probability: 0.4,
        impactAmount: '3200',
        mitigation: 'Contract a weather-abort rate rather than absorbing the mobilisation.',
        status: 'open',
      },
      {
        id: 'r-measure',
        code: 'unverified_measurement',
        label: 'Glass area came from AR capture and has not been verified',
        probability: 0.35,
        impactAmount: '1800',
        mitigation: 'Verify the two largest elevations before the price is released.',
        status: 'open',
      },
    ],
    contract: { termMonths: 1, quoteValidityDays: 14 },
    dataCompleteness: {
      measurementVerifiedRatio: 0.25,
      aiFactsConfirmedRatio: 0.5,
      missingInformationCount: 3,
      walkthroughCompleted: true,
    },
    strategicContext: {
      priceSensitivity: 'high',
      routeDensity: 'adjacent',
      crossSellPotential: 'high',
      salesStage: 'early',
    },
  },
};

// ---------------------------------------------------------------------------
// Case 5 — tender submission with incomplete information
// ---------------------------------------------------------------------------

export const tenderSubmission: SeedCase = {
  id: 'tender-submission',
  title: 'Metro Transport Authority — seven-day interchange cleaning (tender)',
  summary:
    'A tender for a seven-day transport interchange with continuous public traffic. The documents specify seven-day service but say nothing about public holidays, and no waste volume is given.',
  exercises: [
    'seven-day service including public holidays, with a rate loading',
    'a large risk register from unanswered tender questions',
    'low input confidence pushing the recommendation to premium',
    'on-demand reactive work budgeted rather than contracted',
  ],
  input: {
    ...base,
    labourLines: [
      {
        id: 'concourse',
        kind: 'productivity',
        label: 'Concourse and platform cleaning',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 7, visitsPerServiceDay: 2 },
        quantity: 3400,
        quantityUnit: 'm2',
        productivity: { method: 'units_per_hour', value: 380 },
        factors: { traffic: 1.4, soil: 1.25 },
      },
      {
        id: 'amenities',
        kind: 'productivity',
        label: 'Public amenities',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 7, visitsPerServiceDay: 4 },
        quantity: 32,
        quantityUnit: 'fixture',
        productivity: { method: 'minutes_per_unit', value: 5 },
        factors: { soil: 1.45, traffic: 1.3 },
      },
      {
        id: 'weekend-loading',
        kind: 'staffing',
        label: 'Weekend and public holiday cover',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 2 },
        cleanersPerShift: 2,
        hoursPerShift: 6,
        rateLoadingPct: '50',
      },
      {
        id: 'day-porter',
        kind: 'staffing',
        label: 'Day porter, continuous presence',
        category: 'day_porter',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 7 },
        cleanersPerShift: 1,
        hoursPerShift: 8,
      },
      {
        id: 'supervision',
        kind: 'percent_of_labour',
        label: 'Supervision and contract reporting',
        category: 'supervision',
        labourProfileCode: 'supervisor',
        schedule: { pattern: 'weekly', daysPerWeek: 7 },
        percentOfHours: '11',
        basisCategories: ['routine', 'day_porter'],
      },
      {
        id: 'reactive',
        kind: 'staffing',
        label: 'Reactive incident response',
        category: 'reactive',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'on_demand', budgetedCallOutsPerYear: 48 },
        cleanersPerShift: 2,
        hoursPerShift: 2,
      },
    ],
    costLines: [
      {
        id: 'chemicals',
        label: 'Chemicals',
        category: 'chemicals',
        method: 'per_month',
        amount: '740',
      },
      {
        id: 'consumables',
        label: 'Client consumables supply',
        category: 'client_consumables',
        method: 'per_month',
        amount: '2900',
      },
      {
        id: 'equipment',
        label: 'Ride-on scrubber and machinery',
        category: 'equipment',
        method: 'per_month',
        amount: '1450',
      },
      {
        id: 'waste',
        label: 'Waste removal (volume not specified in tender)',
        category: 'waste',
        method: 'per_month',
        amount: '1100',
      },
      {
        id: 'reporting',
        label: 'Contract reporting platform required by tender',
        category: 'software',
        method: 'per_month',
        amount: '380',
      },
      {
        id: 'security',
        label: 'Security clearance for all staff',
        category: 'security_checks',
        method: 'per_year',
        amount: '4200',
      },
      {
        id: 'mobilisation',
        label: 'Mobilisation and initial deep clean',
        category: 'other',
        method: 'one_off',
        amount: '18500',
      },
    ],
    risks: [
      {
        id: 'r-holidays',
        code: 'public_holiday_arrangement',
        label: 'The tender specifies seven-day service but is silent on public holidays',
        probability: 0.7,
        impactAmount: '22000',
        mitigation: 'Raise as a formal clarification question before the closing date.',
        status: 'open',
      },
      {
        id: 'r-waste',
        code: 'waste_volume_unknown',
        label: 'No waste volume is stated anywhere in the tender documents',
        probability: 0.6,
        impactAmount: '14000',
        mitigation: 'Price against an assumed volume and state the assumption explicitly.',
        status: 'open',
      },
      {
        id: 'r-events',
        code: 'event_surge',
        label: 'Event-day passenger surges are referenced but not quantified',
        probability: 0.5,
        impactAmount: '16000',
        status: 'open',
      },
      {
        id: 'r-incumbent',
        code: 'legacy_underpricing',
        label: 'The incumbent rate is believed to be below sustainable cost',
        probability: 0.4,
        impactAmount: '9000',
        status: 'open',
      },
    ],
    contract: { termMonths: 60, quoteValidityDays: 90 },
    dataCompleteness: {
      // A tender read from documents with no walkthrough: nothing is verified.
      measurementVerifiedRatio: 0.1,
      aiFactsConfirmedRatio: 0.35,
      missingInformationCount: 11,
      walkthroughCompleted: false,
    },
    strategicContext: {
      priceSensitivity: 'high',
      incumbentDissatisfaction: 'high',
      capacityAvailable: 'stretched',
      labourAvailability: 'scarce',
      contractAttractiveness: 'high',
      salesStage: 'early',
    },
  },
};

export const SEED_CASES: readonly SeedCase[] = [
  recurringOffice,
  childcareFacility,
  gmpManufacturing,
  windowCleaning,
  tenderSubmission,
];

export function seedCaseById(id: string): SeedCase | undefined {
  return SEED_CASES.find((c) => c.id === id);
}
