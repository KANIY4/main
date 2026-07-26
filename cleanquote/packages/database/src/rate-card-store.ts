import { many, one, type Queryable } from './client';

/**
 * Rate cards.
 *
 * A rate card that has priced a sent quote must never change underneath it. Two
 * mechanisms hold that line together:
 *
 *  - `quote_versions.rate_card_id` records which card priced each version.
 *  - `quote_calculation_snapshots.engine_input` stores the fully resolved rates,
 *    so a sent quote reproduces exactly even if the card is later edited or
 *    superseded.
 *
 * Editing a locked card creates a new version rather than mutating the old one.
 */

export interface RateCardRow {
  id: string;
  organisation_id: string;
  name: string;
  is_default: boolean;
  version: number;
  locked_at: Date | null;
  effective_from: Date;
}

export interface LabourProfileRow {
  code: string;
  label: string;
  base_hourly_rate: string;
  engagement: string;
}

export interface OnCostRuleRow {
  code: string;
  label: string;
  method: string;
  value: string;
  applies_to: string;
  sort_order: number;
  applies_to_engagements: string[];
}

export interface OverheadRuleRow {
  code: string;
  label: string;
  method: string;
  value: string;
}

export interface MarginRulesRow {
  min_gross_margin_pct: string | null;
  min_contribution_margin_pct: string | null;
  min_hourly_recovery: string | null;
  min_charge_per_visit: string | null;
  min_annual_contract_value: string | null;
  min_mobilisation_charge: string | null;
}

export interface ScenarioConfigRow {
  scenario_key: string;
  label: string;
  pricing_basis_type: string;
  pricing_basis_value: string;
  contingency_pct: string;
  risk_contingency_multiplier: string;
  productivity_multiplier: string;
  supervision_multiplier: string;
  discount_pct: string | null;
  rationale: string | null;
}

export async function listRateCards(db: Queryable, organisationId: string): Promise<RateCardRow[]> {
  return many<RateCardRow>(
    db,
    `select id, organisation_id, name, is_default, version, locked_at, effective_from
     from public.rate_cards
     where organisation_id = $1 and deleted_at is null
     order by is_default desc, effective_from desc`,
    [organisationId],
  );
}

export async function getDefaultRateCard(
  db: Queryable,
  organisationId: string,
): Promise<RateCardRow | undefined> {
  return one<RateCardRow>(
    db,
    `select id, organisation_id, name, is_default, version, locked_at, effective_from
     from public.rate_cards
     where organisation_id = $1 and is_default and deleted_at is null`,
    [organisationId],
  );
}

export async function createRateCard(
  db: Queryable,
  input: { organisationId: string; name: string; isDefault: boolean },
): Promise<string> {
  if (input.isDefault) {
    // A single default per organisation is enforced by a partial unique index;
    // clearing the old one first turns a constraint violation into an update.
    await db.query(
      `update public.rate_cards set is_default = false
       where organisation_id = $1 and is_default and deleted_at is null`,
      [input.organisationId],
    );
  }
  const row = await one<{ id: string }>(
    db,
    `insert into public.rate_cards (organisation_id, name, is_default)
     values ($1, $2, $3)
     returning id`,
    [input.organisationId, input.name, input.isDefault],
  );
  if (!row) throw new Error('Failed to create the rate card.');
  return row.id;
}

export async function getRateCardContents(
  db: Queryable,
  rateCardId: string,
): Promise<{
  labourProfiles: LabourProfileRow[];
  onCostRules: OnCostRuleRow[];
  overheadRules: OverheadRuleRow[];
}> {
  const [labourProfiles, onCostRules, overheadRules] = await Promise.all([
    many<LabourProfileRow>(
      db,
      `select code, label, base_hourly_rate, engagement::text as engagement
       from public.labour_profiles where rate_card_id = $1 order by code`,
      [rateCardId],
    ),
    many<OnCostRuleRow>(
      db,
      `select code, label, method, value, applies_to, sort_order,
              coalesce(applies_to_engagements::text[], '{}') as applies_to_engagements
       from public.on_cost_rules where rate_card_id = $1 order by sort_order`,
      [rateCardId],
    ),
    many<OverheadRuleRow>(
      db,
      `select code, label, method, value
       from public.overhead_rules where rate_card_id = $1 order by code`,
      [rateCardId],
    ),
  ]);
  return { labourProfiles, onCostRules, overheadRules };
}

export async function upsertLabourProfile(
  db: Queryable,
  input: {
    organisationId: string;
    rateCardId: string;
    code: string;
    label: string;
    baseHourlyRate: string;
    engagement: string;
  },
): Promise<void> {
  await db.query(
    `insert into public.labour_profiles
       (organisation_id, rate_card_id, code, label, base_hourly_rate, engagement)
     values ($1, $2, $3, $4, $5, $6::public.engagement_type)
     on conflict (rate_card_id, code) do update
       set label = excluded.label,
           base_hourly_rate = excluded.base_hourly_rate,
           engagement = excluded.engagement`,
    [
      input.organisationId,
      input.rateCardId,
      input.code,
      input.label,
      input.baseHourlyRate,
      input.engagement,
    ],
  );
}

export async function upsertOnCostRule(
  db: Queryable,
  input: {
    organisationId: string;
    rateCardId: string;
    code: string;
    label: string;
    method: string;
    value: string;
    appliesTo: string;
    sortOrder: number;
    appliesToEngagements: readonly string[];
  },
): Promise<void> {
  await db.query(
    `insert into public.on_cost_rules
       (organisation_id, rate_card_id, code, label, method, value, applies_to, sort_order, applies_to_engagements)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::public.engagement_type[])
     on conflict (rate_card_id, code) do update
       set label = excluded.label,
           method = excluded.method,
           value = excluded.value,
           applies_to = excluded.applies_to,
           sort_order = excluded.sort_order,
           applies_to_engagements = excluded.applies_to_engagements`,
    [
      input.organisationId,
      input.rateCardId,
      input.code,
      input.label,
      input.method,
      input.value,
      input.appliesTo,
      input.sortOrder,
      [...input.appliesToEngagements],
    ],
  );
}

export async function upsertOverheadRule(
  db: Queryable,
  input: {
    organisationId: string;
    rateCardId: string;
    code: string;
    label: string;
    method: string;
    value: string;
  },
): Promise<void> {
  await db.query(
    `insert into public.overhead_rules
       (organisation_id, rate_card_id, code, label, method, value)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (rate_card_id, code) do update
       set label = excluded.label, method = excluded.method, value = excluded.value`,
    [input.organisationId, input.rateCardId, input.code, input.label, input.method, input.value],
  );
}

export async function getMarginRules(
  db: Queryable,
  organisationId: string,
): Promise<MarginRulesRow | undefined> {
  return one<MarginRulesRow>(
    db,
    `select min_gross_margin_pct, min_contribution_margin_pct, min_hourly_recovery,
            min_charge_per_visit, min_annual_contract_value, min_mobilisation_charge
     from public.margin_rules where organisation_id = $1`,
    [organisationId],
  );
}

export async function upsertMarginRules(
  db: Queryable,
  organisationId: string,
  rules: Partial<Record<keyof MarginRulesRow, string | null>>,
): Promise<void> {
  await db.query(
    `insert into public.margin_rules
       (organisation_id, min_gross_margin_pct, min_contribution_margin_pct, min_hourly_recovery,
        min_charge_per_visit, min_annual_contract_value, min_mobilisation_charge)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (organisation_id) do update
       set min_gross_margin_pct = excluded.min_gross_margin_pct,
           min_contribution_margin_pct = excluded.min_contribution_margin_pct,
           min_hourly_recovery = excluded.min_hourly_recovery,
           min_charge_per_visit = excluded.min_charge_per_visit,
           min_annual_contract_value = excluded.min_annual_contract_value,
           min_mobilisation_charge = excluded.min_mobilisation_charge`,
    [
      organisationId,
      rules.min_gross_margin_pct ?? null,
      rules.min_contribution_margin_pct ?? null,
      rules.min_hourly_recovery ?? null,
      rules.min_charge_per_visit ?? null,
      rules.min_annual_contract_value ?? null,
      rules.min_mobilisation_charge ?? null,
    ],
  );
}

export async function listScenarioConfigs(
  db: Queryable,
  organisationId: string,
): Promise<ScenarioConfigRow[]> {
  return many<ScenarioConfigRow>(
    db,
    `select scenario_key::text as scenario_key, label, pricing_basis_type, pricing_basis_value,
            contingency_pct, risk_contingency_multiplier, productivity_multiplier,
            supervision_multiplier, discount_pct, rationale
     from public.scenario_configs
     where organisation_id = $1
     order by case scenario_key when 'aggressive' then 1 when 'balanced' then 2 else 3 end`,
    [organisationId],
  );
}

export async function upsertScenarioConfig(
  db: Queryable,
  organisationId: string,
  scenario: {
    key: string;
    label: string;
    basisType: string;
    basisValue: string;
    contingencyPct: string;
    riskMultiplier: string;
    productivityMultiplier: string;
    supervisionMultiplier: string;
    rationale: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into public.scenario_configs
       (organisation_id, scenario_key, label, pricing_basis_type, pricing_basis_value,
        contingency_pct, risk_contingency_multiplier, productivity_multiplier,
        supervision_multiplier, rationale)
     values ($1, $2::public.scenario_key, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (organisation_id, scenario_key) do update
       set label = excluded.label,
           pricing_basis_type = excluded.pricing_basis_type,
           pricing_basis_value = excluded.pricing_basis_value,
           contingency_pct = excluded.contingency_pct,
           risk_contingency_multiplier = excluded.risk_contingency_multiplier,
           productivity_multiplier = excluded.productivity_multiplier,
           supervision_multiplier = excluded.supervision_multiplier,
           rationale = excluded.rationale`,
    [
      organisationId,
      scenario.key,
      scenario.label,
      scenario.basisType,
      scenario.basisValue,
      scenario.contingencyPct,
      scenario.riskMultiplier,
      scenario.productivityMultiplier,
      scenario.supervisionMultiplier,
      scenario.rationale,
    ],
  );
}

export async function upsertCostCatalogueItem(
  db: Queryable,
  input: {
    organisationId: string;
    rateCardId: string;
    code: string;
    label: string;
    category: string;
    method: string;
    amount: string;
  },
): Promise<void> {
  await db.query(
    `insert into public.cost_catalogue_items
       (organisation_id, rate_card_id, code, label, category, default_method, default_amount)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.organisationId,
      input.rateCardId,
      input.code,
      input.label,
      input.category,
      input.method,
      input.amount,
    ],
  );
}
