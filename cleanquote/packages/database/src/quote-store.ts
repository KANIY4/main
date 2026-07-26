import { many, one, type Queryable } from './client';

/** Quotes, versions, capture entities and calculation snapshots. */

export interface QuoteRow {
  id: string;
  organisation_id: string;
  client_id: string | null;
  site_id: string | null;
  opportunity_id: string | null;
  reference: string;
  title: string;
  quote_type: string;
  status: string;
  currency_code: string;
  contract_term_months: number;
  quote_validity_days: number;
  strategic_context: Record<string, unknown>;
  selected_scenario: string | null;
  current_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface SpaceRow {
  id: string;
  name: string;
  room_type: string;
  quantity: number;
  floor_area_sqm: string | null;
  surface_types: string[];
  traffic_level: string | null;
  soil_level: string | null;
  furniture_density: string | null;
  access_difficulty: string | null;
  notes: string | null;
  field_status: string;
  evidence_source: string;
  verification_status: string;
  ai_confidence: string | null;
}

export interface QuoteTaskRow {
  id: string;
  space_id: string | null;
  label: string;
  frequency_pattern: string;
  days_per_week: number | null;
  times_per_month: string | null;
  occurrences_per_year: string | null;
  quantity: string;
  unit: string;
  minutes_per_unit: string | null;
  units_per_hour: string | null;
  labour_profile_code: string;
  field_status: string;
  sort_order: number;
}

export interface QuoteCostLineRow {
  id: string;
  line_key: string;
  label: string;
  category: string;
  method: string;
  amount: string;
  schedule: Record<string, unknown> | null;
  one_off: boolean;
}

export interface QuoteRiskRow {
  id: string;
  code: string;
  label: string;
  probability: string;
  impact_amount: string;
  mitigation: string | null;
  status: string;
}

export async function nextQuoteReference(
  db: Queryable,
  organisationId: string,
  prefix: string,
): Promise<string> {
  const row = await one<{ count: string }>(
    db,
    `select count(*)::text as count from public.quotes where organisation_id = $1`,
    [organisationId],
  );
  const sequence = Number(row?.count ?? '0') + 1;
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export async function createQuote(
  db: Queryable,
  input: {
    organisationId: string;
    clientId: string | null;
    siteId: string | null;
    opportunityId: string | null;
    reference: string;
    title: string;
    quoteType: string;
    currencyCode: string;
    contractTermMonths: number;
    quoteValidityDays: number;
    rateCardId: string;
    createdByUserId: string;
  },
): Promise<{ quoteId: string; versionId: string }> {
  const quote = await one<{ id: string }>(
    db,
    `insert into public.quotes
       (organisation_id, client_id, site_id, opportunity_id, reference, title, quote_type,
        currency_code, contract_term_months, quote_validity_days, created_by_user_id, updated_by_user_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     returning id`,
    [
      input.organisationId,
      input.clientId,
      input.siteId,
      input.opportunityId,
      input.reference,
      input.title,
      input.quoteType,
      input.currencyCode,
      input.contractTermMonths,
      input.quoteValidityDays,
      input.createdByUserId,
    ],
  );
  if (!quote) throw new Error('Failed to create the quote.');

  // The rate card is bound to the version at creation, so a later change to the
  // card cannot silently re-price a quote already in progress.
  const version = await one<{ id: string }>(
    db,
    `insert into public.quote_versions
       (organisation_id, quote_id, version, rate_card_id, created_by_user_id)
     values ($1, $2, 1, $3, $4)
     returning id`,
    [input.organisationId, quote.id, input.rateCardId, input.createdByUserId],
  );
  if (!version) throw new Error('Failed to create the quote version.');

  return { quoteId: quote.id, versionId: version.id };
}

export async function listQuotes(db: Queryable, organisationId: string): Promise<QuoteRow[]> {
  return many<QuoteRow>(
    db,
    `select * from public.quotes
     where organisation_id = $1 and deleted_at is null
     order by updated_at desc`,
    [organisationId],
  );
}

export async function getQuote(db: Queryable, quoteId: string): Promise<QuoteRow | undefined> {
  return one<QuoteRow>(db, `select * from public.quotes where id = $1 and deleted_at is null`, [
    quoteId,
  ]);
}

export async function getCurrentVersion(
  db: Queryable,
  quoteId: string,
): Promise<
  | {
      id: string;
      version: number;
      rate_card_id: string | null;
      sealed_at: Date | null;
      status: string;
    }
  | undefined
> {
  return one(
    db,
    `select id, version, rate_card_id, sealed_at, status::text as status
     from public.quote_versions
     where quote_id = $1
     order by version desc
     limit 1`,
    [quoteId],
  );
}

export async function setQuoteStatus(
  db: Queryable,
  quoteId: string,
  status: string,
  userId: string,
): Promise<void> {
  await db.query(
    `update public.quotes set status = $2::public.quote_status, updated_by_user_id = $3 where id = $1`,
    [quoteId, status, userId],
  );
}

export async function setSelectedScenario(
  db: Queryable,
  quoteId: string,
  scenarioKey: string,
): Promise<void> {
  await db.query(
    `update public.quotes set selected_scenario = $2::public.scenario_key where id = $1`,
    [quoteId, scenarioKey],
  );
}

/**
 * Opens a new version by copying the current one's priced lines.
 *
 * Sent versions are sealed and reject writes, so revising a sent quote is
 * necessarily a new version. That is what makes "what did we quote in March?"
 * answerable.
 */
export async function createNextVersion(
  db: Queryable,
  input: { organisationId: string; quoteId: string; userId: string; notes?: string | null },
): Promise<string> {
  const current = await getCurrentVersion(db, input.quoteId);
  if (!current) throw new Error('The quote has no version to copy.');

  const next = await one<{ id: string; version: number }>(
    db,
    `insert into public.quote_versions
       (organisation_id, quote_id, version, rate_card_id, created_by_user_id, notes)
     select organisation_id, quote_id, version + 1, rate_card_id, $2, $3
     from public.quote_versions where id = $1
     returning id, version`,
    [current.id, input.userId, input.notes ?? null],
  );
  if (!next) throw new Error('Failed to create the next version.');

  await db.query(
    `insert into public.quote_cost_lines
       (organisation_id, quote_version_id, line_key, label, category, method, amount, schedule, one_off, sort_order)
     select organisation_id, $2, line_key, label, category, method, amount, schedule, one_off, sort_order
     from public.quote_cost_lines where quote_version_id = $1`,
    [current.id, next.id],
  );

  await db.query(`update public.quotes set current_version = $2 where id = $1`, [
    input.quoteId,
    next.version,
  ]);

  return next.id;
}

// ---------------------------------------------------------------------------
// Capture entities
// ---------------------------------------------------------------------------

export async function listSpaces(db: Queryable, quoteId: string): Promise<SpaceRow[]> {
  return many<SpaceRow>(
    db,
    `select id, name, room_type, quantity, floor_area_sqm, surface_types, traffic_level,
            soil_level, furniture_density, access_difficulty, notes, field_status,
            evidence_source::text as evidence_source,
            verification_status::text as verification_status, ai_confidence
     from public.spaces
     where quote_id = $1 and deleted_at is null
     order by created_at`,
    [quoteId],
  );
}

export async function createSpace(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    name: string;
    roomType: string;
    quantity: number;
    floorAreaSqm?: number | null;
    surfaceTypes?: readonly string[];
    trafficLevel?: string | null;
    soilLevel?: string | null;
    furnitureDensity?: string | null;
    accessDifficulty?: string | null;
    notes?: string | null;
    fieldStatus?: string;
    evidenceSource?: string;
    aiConfidence?: number | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.spaces
       (organisation_id, quote_id, name, room_type, quantity, floor_area_sqm, surface_types,
        traffic_level, soil_level, furniture_density, access_difficulty, notes, field_status,
        evidence_source, ai_confidence)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::public.evidence_source,$15)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.name,
      input.roomType,
      input.quantity,
      input.floorAreaSqm ?? null,
      [...(input.surfaceTypes ?? [])],
      input.trafficLevel ?? null,
      input.soilLevel ?? null,
      input.furnitureDensity ?? null,
      input.accessDifficulty ?? null,
      input.notes ?? null,
      input.fieldStatus ?? 'estimated',
      input.evidenceSource ?? 'manual_entry',
      input.aiConfidence ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create the space.');
  return row.id;
}

export async function listTasks(db: Queryable, quoteId: string): Promise<QuoteTaskRow[]> {
  return many<QuoteTaskRow>(
    db,
    `select id, space_id, label, frequency_pattern::text as frequency_pattern, days_per_week,
            times_per_month, occurrences_per_year, quantity, unit, minutes_per_unit,
            units_per_hour, labour_profile_code, field_status, sort_order
     from public.quote_tasks
     where quote_id = $1
     order by sort_order, created_at`,
    [quoteId],
  );
}

export async function createTask(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    spaceId: string | null;
    label: string;
    frequencyPattern: string;
    daysPerWeek?: number | null;
    quantity: number;
    unit: string;
    minutesPerUnit?: number | null;
    unitsPerHour?: number | null;
    labourProfileCode?: string;
    fieldStatus?: string;
    evidenceSource?: string;
    sortOrder?: number;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.quote_tasks
       (organisation_id, quote_id, space_id, label, frequency_pattern, days_per_week, quantity,
        unit, minutes_per_unit, units_per_hour, labour_profile_code, field_status,
        evidence_source, sort_order)
     values ($1,$2,$3,$4,$5::public.schedule_pattern,$6,$7,$8,$9,$10,$11,$12,$13::public.evidence_source,$14)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.spaceId,
      input.label,
      input.frequencyPattern,
      input.daysPerWeek ?? null,
      input.quantity,
      input.unit,
      input.minutesPerUnit ?? null,
      input.unitsPerHour ?? null,
      input.labourProfileCode ?? 'cleaner',
      input.fieldStatus ?? 'estimated',
      input.evidenceSource ?? 'manual_entry',
      input.sortOrder ?? 0,
    ],
  );
  if (!row) throw new Error('Failed to create the task.');
  return row.id;
}

export async function deleteTask(db: Queryable, taskId: string): Promise<void> {
  await db.query(`delete from public.quote_tasks where id = $1`, [taskId]);
}

export async function listCostLines(db: Queryable, versionId: string): Promise<QuoteCostLineRow[]> {
  return many<QuoteCostLineRow>(
    db,
    `select id, line_key, label, category, method, amount, schedule, one_off
     from public.quote_cost_lines
     where quote_version_id = $1
     order by sort_order, line_key`,
    [versionId],
  );
}

export async function upsertCostLine(
  db: Queryable,
  input: {
    organisationId: string;
    versionId: string;
    lineKey: string;
    label: string;
    category: string;
    method: string;
    amount: string;
    oneOff: boolean;
    schedule?: unknown;
  },
): Promise<void> {
  await db.query(
    `insert into public.quote_cost_lines
       (organisation_id, quote_version_id, line_key, label, category, method, amount, one_off, schedule)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (quote_version_id, line_key) do update
       set label = excluded.label, category = excluded.category, method = excluded.method,
           amount = excluded.amount, one_off = excluded.one_off, schedule = excluded.schedule`,
    [
      input.organisationId,
      input.versionId,
      input.lineKey,
      input.label,
      input.category,
      input.method,
      input.amount,
      input.oneOff,
      input.schedule ? JSON.stringify(input.schedule) : null,
    ],
  );
}

export async function listRisks(db: Queryable, quoteId: string): Promise<QuoteRiskRow[]> {
  return many<QuoteRiskRow>(
    db,
    `select id, code, label, probability, impact_amount, mitigation, status
     from public.quote_risks where quote_id = $1 order by created_at`,
    [quoteId],
  );
}

export async function createRisk(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    code: string;
    label: string;
    probability: number;
    impactAmount: string;
    mitigation?: string | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.quote_risks
       (organisation_id, quote_id, code, label, probability, impact_amount, mitigation)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.code,
      input.label,
      input.probability,
      input.impactAmount,
      input.mitigation ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create the risk.');
  return row.id;
}

export async function listQualifiers(
  db: Queryable,
  quoteId: string,
  kind?: string,
): Promise<{ id: string; kind: string; statement: string; requires_human_review: boolean }[]> {
  const filter = kind ? 'and kind = $2' : '';
  const values = kind ? [quoteId, kind] : [quoteId];
  return many(
    db,
    `select id, kind, statement, requires_human_review
     from public.quote_qualifiers where quote_id = $1 ${filter} order by created_at`,
    values,
  );
}

export async function createQualifier(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    kind: string;
    statement: string;
    requiresHumanReview?: boolean;
    evidenceSource?: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.quote_qualifiers
       (organisation_id, quote_id, kind, statement, requires_human_review, evidence_source)
     values ($1,$2,$3,$4,$5,$6::public.evidence_source)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.kind,
      input.statement,
      input.requiresHumanReview ?? false,
      input.evidenceSource ?? 'manual_entry',
    ],
  );
  if (!row) throw new Error('Failed to create the qualifier.');
  return row.id;
}

export async function createObservation(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    observationType: string;
    summary: string;
    numericValue?: number | null;
    observationWindowComplete: boolean;
    createdByUserId: string;
    evidenceSource?: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.observations
       (organisation_id, quote_id, observation_type, summary, numeric_value,
        observation_window_complete, created_by_user_id, evidence_source)
     values ($1,$2,$3,$4,$5,$6,$7,$8::public.evidence_source)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.observationType,
      input.summary,
      input.numericValue ?? null,
      input.observationWindowComplete,
      input.createdByUserId,
      input.evidenceSource ?? 'manual_entry',
    ],
  );
  if (!row) throw new Error('Failed to create the observation.');
  return row.id;
}

export async function createAsset(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    spaceId: string | null;
    assetTypeCode: string;
    quantity: number;
    fieldStatus?: string;
    evidenceSource?: string;
    aiConfidence?: number | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.quote_assets
       (organisation_id, quote_id, space_id, asset_type_code, quantity, field_status,
        evidence_source, ai_confidence)
     values ($1,$2,$3,$4,$5,$6,$7::public.evidence_source,$8)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.spaceId,
      input.assetTypeCode,
      input.quantity,
      input.fieldStatus ?? 'estimated',
      input.evidenceSource ?? 'manual_entry',
      input.aiConfidence ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create the asset.');
  return row.id;
}

// ---------------------------------------------------------------------------
// Calculation snapshots
// ---------------------------------------------------------------------------

export async function saveSnapshot(
  db: Queryable,
  input: {
    organisationId: string;
    versionId: string;
    schemaVersion: string;
    engineInput: unknown;
    engineOutput: unknown;
    inputHash: string;
    recommendedScenario: string;
    userId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.quote_calculation_snapshots
       (organisation_id, quote_version_id, calculation_schema_version, engine_input, engine_output,
        input_hash, recommended_scenario, calculated_by_user_id)
     values ($1,$2,$3,$4,$5,$6,$7::public.scenario_key,$8)
     returning id`,
    [
      input.organisationId,
      input.versionId,
      input.schemaVersion,
      JSON.stringify(input.engineInput),
      JSON.stringify(input.engineOutput),
      input.inputHash,
      input.recommendedScenario,
      input.userId,
    ],
  );
  if (!row) throw new Error('Failed to store the calculation snapshot.');
  return row.id;
}

export async function latestSnapshot(
  db: Queryable,
  versionId: string,
): Promise<
  | {
      id: string;
      engine_input: unknown;
      engine_output: unknown;
      input_hash: string;
      created_at: Date;
    }
  | undefined
> {
  return one(
    db,
    `select id, engine_input, engine_output, input_hash, created_at
     from public.quote_calculation_snapshots
     where quote_version_id = $1
     order by created_at desc
     limit 1`,
    [versionId],
  );
}
