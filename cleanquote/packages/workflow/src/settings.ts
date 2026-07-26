import { auditStore, rateCardStore, tenancyStore, withUser } from '@cleanquote/database';

/**
 * Rate-card and organisation settings.
 *
 * Editing a rate card changes what future quotes are priced against. It does
 * not — and must not — reprice anything already calculated: every quote binds
 * to a rate card version at creation, and a sent version is sealed. That is
 * enforced in the schema; this module simply never tries to work around it.
 */

export async function updateLabourProfile(input: {
  userId: string;
  organisationId: string;
  code: string;
  label: string;
  baseHourlyRate: string;
  engagement: string;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    const rateCard = await rateCardStore.getDefaultRateCard(db, input.organisationId);
    if (!rateCard) throw new Error('This organisation has no rate card yet.');

    const before = await rateCardStore.getRateCardContents(db, rateCard.id);
    const previous = before.labourProfiles.find((profile) => profile.code === input.code);

    await rateCardStore.upsertLabourProfile(db, {
      organisationId: input.organisationId,
      rateCardId: rateCard.id,
      code: input.code,
      label: input.label,
      baseHourlyRate: input.baseHourlyRate,
      engagement: input.engagement,
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'rate_card.labour_profile_updated',
      entityType: 'rate_card',
      entityId: rateCard.id,
      before: previous ? { rate: previous.base_hourly_rate } : undefined,
      after: { code: input.code, rate: input.baseHourlyRate },
    });
  });
}

/**
 * The commercial floors and the approval thresholds.
 *
 * These are two different things stored in two places — a floor is enforced by
 * the engine on every calculation, a threshold decides who has to sign off —
 * and this is the one screen where changing both together makes sense.
 */
export async function updateCommercialRules(input: {
  userId: string;
  organisationId: string;
  minGrossMarginPct: string | null;
  minHourlyRecovery: string | null;
  minChargePerVisit: string | null;
  approvalBelowMarginPct: string | null;
  approvalAboveAnnualValue: string | null;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    const before = await rateCardStore.getMarginRules(db, input.organisationId);

    await rateCardStore.upsertMarginRules(db, input.organisationId, {
      min_gross_margin_pct: input.minGrossMarginPct,
      min_contribution_margin_pct: before?.min_contribution_margin_pct ?? null,
      min_hourly_recovery: input.minHourlyRecovery,
      min_charge_per_visit: input.minChargePerVisit,
      min_annual_contract_value: before?.min_annual_contract_value ?? null,
      min_mobilisation_charge: before?.min_mobilisation_charge ?? null,
    });

    await tenancyStore.updateSettings(
      db,
      input.organisationId,
      {
        approval_required_below_margin_pct: input.approvalBelowMarginPct,
        approval_required_above_annual_value: input.approvalAboveAnnualValue,
      },
      { source: 'user_entered', userId: input.userId },
    );

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'organisation.commercial_rules_updated',
      entityType: 'organisation',
      entityId: input.organisationId,
      before: before ? { minGrossMarginPct: before.min_gross_margin_pct } : undefined,
      after: {
        minGrossMarginPct: input.minGrossMarginPct,
        approvalBelowMarginPct: input.approvalBelowMarginPct,
        approvalAboveAnnualValue: input.approvalAboveAnnualValue,
      },
    });
  });
}

/**
 * Marks a starter value as reviewed.
 *
 * The value itself does not change. What changes is that it stops being an
 * unconfirmed product default and becomes a number somebody in the business
 * looked at and accepted — which is the only thing that entitles it to be
 * treated as the organisation's own figure.
 */
export async function confirmStarterValue(input: {
  userId: string;
  organisationId: string;
  settingKey: string;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    await db.query(
      `update public.organisation_setting_provenance
       set source = 'user_entered',
           is_system_default = false,
           confirmed_by_user_id = $3,
           confirmed_at = now()
       where organisation_id = $1 and setting_key = $2`,
      [input.organisationId, input.settingKey, input.userId],
    );

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'organisation.starter_value_confirmed',
      entityType: 'organisation',
      entityId: input.organisationId,
      after: { settingKey: input.settingKey },
    });
  });
}

export async function readRateCard(userId: string, organisationId: string) {
  return withUser(userId, async (db) => {
    const rateCard = await rateCardStore.getDefaultRateCard(db, organisationId);
    if (!rateCard) return undefined;

    const [contents, marginRules, scenarios, organisation] = await Promise.all([
      rateCardStore.getRateCardContents(db, rateCard.id),
      rateCardStore.getMarginRules(db, organisationId),
      rateCardStore.listScenarioConfigs(db, organisationId),
      tenancyStore.getOrganisation(db, organisationId),
    ]);
    return {
      rateCard,
      ...contents,
      marginRules,
      scenarios,
      currency: organisation?.currency_code ?? 'AUD',
    };
  });
}

export async function readProvenance(userId: string, organisationId: string) {
  return withUser(userId, async (db) => tenancyStore.listProvenance(db, organisationId));
}
