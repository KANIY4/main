import {
  auditStore,
  rateCardStore,
  tenancyStore,
  withSystem,
  withUser,
  type Queryable,
} from '@cleanquote/database';
import {
  STARTER_ABSENCE_ALLOWANCE_PCT,
  STARTER_GUARDRAILS,
  STARTER_ON_COSTS,
  STARTER_OVERHEADS,
  STARTER_SCENARIOS,
} from '@cleanquote/pricing-engine';

/**
 * Organisation creation and onboarding.
 *
 * Quick Start applies a coherent set of starter assumptions so a new company can
 * price something within minutes. Every one of those values is written to
 * `organisation_setting_provenance` marked `system_starter_default` and
 * unconfirmed, so the product can always answer "where did this number come
 * from, and has anyone actually agreed to it?".
 *
 * These are starting points, not benchmarks, and the interface says so.
 */

export interface OnboardingInput {
  readonly companyName: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly taxLabel: string;
  readonly taxRatePct: string;
  readonly primaryServiceRegion?: string | null;
  readonly companySize?: string | null;
  readonly primaryServiceCategories?: readonly string[];
  readonly labourModel?: 'employee' | 'subcontractor' | 'mixed';
  readonly defaultLabourCost: string;
  readonly minimumGrossMarginPct: string;
  readonly quoteValidityDays: number;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly contactAddress?: string | null;
  readonly path: 'quick_start' | 'advanced';
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length >= 2 ? base : 'org';
}

export interface OnboardingResult {
  readonly organisationId: string;
  readonly rateCardId: string;
  readonly slug: string;
}

/**
 * Creates the organisation, its settings, its first rate card and its scenarios.
 *
 * Runs in one system-level transaction. A half-created tenant — an organisation
 * with no owner, or a rate card with no labour rates — is not a state the
 * product can recover from, so it is not a state that is allowed to exist.
 */
export async function createOrganisationWithOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<OnboardingResult> {
  return withSystem(async (db) => {
    let slug = slugify(input.companyName);
    if (!(await tenancyStore.slugIsAvailable(db, slug))) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const { organisationId } = await tenancyStore.createOrganisation(db, {
      name: input.companyName,
      slug,
      countryCode: input.countryCode,
      currencyCode: input.currencyCode,
      ownerUserId: userId,
    });

    // Values the user actually typed.
    await tenancyStore.updateSettings(
      db,
      organisationId,
      {
        tax_label: input.taxLabel,
        tax_code: input.taxLabel.toUpperCase().slice(0, 10),
        tax_rate_pct: input.taxRatePct,
        default_quote_validity_days: input.quoteValidityDays,
        primary_service_region: input.primaryServiceRegion ?? null,
        company_size: input.companySize ?? null,
        primary_service_categories: [...(input.primaryServiceCategories ?? [])],
        labour_model: input.labourModel ?? 'employee',
        contact_email: input.contactEmail ?? null,
        contact_phone: input.contactPhone ?? null,
        contact_address: input.contactAddress ?? null,
        onboarding_path: input.path,
      },
      { source: 'user_entered', userId },
    );

    // Values the product supplied. Marked as system defaults and unconfirmed.
    await tenancyStore.updateSettings(
      db,
      organisationId,
      {
        absence_allowance_pct: STARTER_ABSENCE_ALLOWANCE_PCT,
        weeks_per_year: '52.1775',
        rounding_increment: '0.01',
        rounding_mode: 'half_up',
        default_contingency_pct: '3',
        discount_approval_threshold_pct: '10',
        approval_required_below_margin_pct: input.minimumGrossMarginPct,
        starter_settings_applied: true,
      },
      { source: 'system_starter_default', userId: null },
    );

    const rateCardId = await seedStarterRateCard(db, {
      organisationId,
      defaultLabourCost: input.defaultLabourCost,
      labourModel: input.labourModel ?? 'employee',
    });

    await rateCardStore.upsertMarginRules(db, organisationId, {
      min_gross_margin_pct: input.minimumGrossMarginPct,
      min_contribution_margin_pct: STARTER_GUARDRAILS.minContributionMarginPct ?? null,
      min_hourly_recovery: null,
      min_charge_per_visit: null,
      min_annual_contract_value: null,
      min_mobilisation_charge: null,
    });

    for (const scenario of STARTER_SCENARIOS) {
      await rateCardStore.upsertScenarioConfig(db, organisationId, {
        key: scenario.key,
        label: scenario.label,
        basisType: scenario.pricingBasis.type,
        basisValue:
          scenario.pricingBasis.type === 'margin'
            ? scenario.pricingBasis.targetMarginPct
            : scenario.pricingBasis.markupPct,
        contingencyPct: scenario.contingencyPct,
        riskMultiplier: scenario.riskContingencyMultiplier,
        productivityMultiplier: String(scenario.productivityMultiplier),
        supervisionMultiplier: String(scenario.supervisionMultiplier),
        rationale: scenario.rationale ?? null,
      });
    }

    if (input.path === 'quick_start') {
      await tenancyStore.updateSettings(
        db,
        organisationId,
        { onboarding_completed_at: new Date() },
        { source: 'user_entered', userId },
      );
    }

    await auditStore.writeAudit(db, {
      organisationId,
      actorUserId: userId,
      action: 'organisation.created',
      entityType: 'organisation',
      entityId: organisationId,
      after: { name: input.companyName, path: input.path },
    });

    return { organisationId, rateCardId, slug };
  });
}

async function seedStarterRateCard(
  db: Queryable,
  input: { organisationId: string; defaultLabourCost: string; labourModel: string },
): Promise<string> {
  const rateCardId = await rateCardStore.createRateCard(db, {
    organisationId: input.organisationId,
    name: 'Starter rate card',
    isDefault: true,
  });

  const base = Number(input.defaultLabourCost);
  const engagement = input.labourModel === 'subcontractor' ? 'subcontractor' : 'employee';

  // Cleaner, night cleaner and supervisor, derived from the one rate the user
  // gave us. Every derived figure is visible and editable in the rate card.
  const profiles = [
    { code: 'cleaner', label: 'Cleaner', rate: base },
    { code: 'cleaner_night', label: 'Cleaner (night)', rate: base * 1.1 },
    { code: 'supervisor', label: 'Site supervisor', rate: base * 1.35 },
    { code: 'specialist', label: 'Specialist operator', rate: base * 1.5 },
  ];

  for (const profile of profiles) {
    await rateCardStore.upsertLabourProfile(db, {
      organisationId: input.organisationId,
      rateCardId,
      code: profile.code,
      label: profile.label,
      baseHourlyRate: profile.rate.toFixed(4),
      engagement,
    });
  }

  for (const rule of STARTER_ON_COSTS) {
    await rateCardStore.upsertOnCostRule(db, {
      organisationId: input.organisationId,
      rateCardId,
      code: rule.code,
      label: rule.label,
      method: rule.method,
      value: rule.value,
      appliesTo: rule.appliesTo,
      sortOrder: rule.order,
      appliesToEngagements: rule.appliesToEngagements ?? [],
    });
  }

  for (const rule of STARTER_OVERHEADS) {
    await rateCardStore.upsertOverheadRule(db, {
      organisationId: input.organisationId,
      rateCardId,
      code: rule.code,
      label: rule.label,
      method: rule.method,
      value: rule.value,
    });
  }

  return rateCardId;
}

// ---------------------------------------------------------------------------
// Onboarding completeness
// ---------------------------------------------------------------------------

export interface SetupGap {
  readonly key: string;
  readonly label: string;
  readonly why: string;
  readonly severity: 'blocking' | 'important' | 'optional';
  readonly href: string;
}

/**
 * What is still missing before this organisation can quote confidently.
 *
 * `blocking` means a quote cannot be priced at all. `important` means it can be
 * priced but the number carries an assumption nobody has agreed to — which is
 * exactly the failure the product exists to prevent.
 */
export async function assessSetup(
  userId: string,
  organisationId: string,
): Promise<{ gaps: SetupGap[]; unconfirmedStarterCount: number }> {
  return withUser(userId, async (db) => {
    const [settings, rateCard, margins, scenarios, provenance] = await Promise.all([
      tenancyStore.getSettings(db, organisationId),
      rateCardStore.getDefaultRateCard(db, organisationId),
      rateCardStore.getMarginRules(db, organisationId),
      rateCardStore.listScenarioConfigs(db, organisationId),
      tenancyStore.listProvenance(db, organisationId),
    ]);

    const gaps: SetupGap[] = [];

    if (!rateCard) {
      gaps.push({
        key: 'rate_card',
        label: 'No rate card',
        why: 'Nothing can be priced without labour rates.',
        severity: 'blocking',
        href: '/settings/rate-card',
      });
    } else {
      const contents = await rateCardStore.getRateCardContents(db, rateCard.id);
      if (contents.labourProfiles.length === 0) {
        gaps.push({
          key: 'labour_rates',
          label: 'The rate card has no labour rates',
          why: 'Labour is the largest component of every cleaning quote.',
          severity: 'blocking',
          href: '/settings/rate-card',
        });
      }
      if (contents.overheadRules.length === 0) {
        gaps.push({
          key: 'overhead',
          label: 'No overhead recovery configured',
          why: 'Without it, quotes recover direct cost only and quietly lose money.',
          severity: 'important',
          href: '/settings/rate-card',
        });
      }
    }

    if (scenarios.length < 3) {
      gaps.push({
        key: 'scenarios',
        label: 'Fewer than three pricing strategies',
        why: 'Scenario comparison needs all three configured.',
        severity: 'blocking',
        href: '/settings/rate-card',
      });
    }

    if (!margins?.min_gross_margin_pct) {
      gaps.push({
        key: 'min_margin',
        label: 'No minimum gross margin',
        why: 'Nothing stops a quote being sent below a sustainable margin.',
        severity: 'important',
        href: '/settings/rate-card',
      });
    }

    if (!settings?.contact_email) {
      gaps.push({
        key: 'contact',
        label: 'No company contact details',
        why: 'Proposals carry your contact details for the client to reply to.',
        severity: 'important',
        href: '/settings/organisation',
      });
    }

    if (!settings?.brand_name && !settings?.primary_colour) {
      gaps.push({
        key: 'branding',
        label: 'No branding applied',
        why: 'Proposals will use the default appearance.',
        severity: 'optional',
        href: '/settings/organisation',
      });
    }

    const unconfirmedStarterCount = provenance.filter(
      (row) => row.is_system_default && row.confirmed_at === null,
    ).length;

    if (unconfirmedStarterCount > 0) {
      gaps.push({
        key: 'starter_assumptions',
        label: `${unconfirmedStarterCount} starter assumption(s) not yet confirmed`,
        why: 'These are the product’s starting points, not your numbers, and not market benchmarks. Review and confirm each one.',
        severity: 'important',
        href: '/settings/assumptions',
      });
    }

    return { gaps, unconfirmedStarterCount };
  });
}
