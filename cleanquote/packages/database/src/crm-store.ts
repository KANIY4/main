import { many, one, type Queryable } from './client';

/** Clients, sites and the opportunity pipeline. */

export interface ClientRow {
  id: string;
  name: string;
  industry: string | null;
  notes: string | null;
  created_at: Date;
}

export interface SiteRow {
  id: string;
  client_id: string | null;
  name: string;
  address_line1: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country_code: string | null;
  latitude: string | null;
  longitude: string | null;
  site_operating_hours: string | null;
  cleaning_window: string | null;
  access_process: string | null;
  parking_notes: string | null;
  security_requirements: string | null;
  induction_requirements: string | null;
  current_contractor: string | null;
}

export interface OpportunityRow {
  id: string;
  client_id: string | null;
  site_id: string | null;
  name: string;
  opportunity_type: string;
  lead_source: string | null;
  estimated_annual_value: string | null;
  quote_deadline: Date | null;
  proposed_start_date: Date | null;
  contract_term_months: number | null;
  incumbent_contractor: string | null;
  stage: string;
  assigned_estimator_user_id: string | null;
  probability_pct: string | null;
  strategic_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listClients(db: Queryable, organisationId: string): Promise<ClientRow[]> {
  return many<ClientRow>(
    db,
    `select id, name, industry, notes, created_at
     from public.clients
     where organisation_id = $1 and deleted_at is null
     order by name`,
    [organisationId],
  );
}

export async function createClient(
  db: Queryable,
  input: {
    organisationId: string;
    name: string;
    industry?: string | null;
    notes?: string | null;
    createdByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.clients (organisation_id, name, industry, notes, created_by_user_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.organisationId,
      input.name,
      input.industry ?? null,
      input.notes ?? null,
      input.createdByUserId,
    ],
  );
  if (!row) throw new Error('Failed to create the client.');
  return row.id;
}

export async function createClientContact(
  db: Queryable,
  input: {
    organisationId: string;
    clientId: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    roleTitle?: string | null;
    isPrimary?: boolean;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.client_contacts
       (organisation_id, client_id, full_name, email, phone, role_title, is_primary)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      input.organisationId,
      input.clientId,
      input.fullName,
      input.email ?? null,
      input.phone ?? null,
      input.roleTitle ?? null,
      input.isPrimary ?? false,
    ],
  );
  if (!row) throw new Error('Failed to create the contact.');
  return row.id;
}

export async function listSites(
  db: Queryable,
  organisationId: string,
  clientId?: string,
): Promise<SiteRow[]> {
  const filter = clientId ? 'and client_id = $2' : '';
  const values = clientId ? [organisationId, clientId] : [organisationId];
  return many<SiteRow>(
    db,
    `select id, client_id, name, address_line1, locality, region, postcode, country_code,
            latitude, longitude, site_operating_hours, cleaning_window, access_process,
            parking_notes, security_requirements, induction_requirements, current_contractor
     from public.sites
     where organisation_id = $1 and deleted_at is null ${filter}
     order by name`,
    values,
  );
}

export async function getSite(db: Queryable, siteId: string): Promise<SiteRow | undefined> {
  return one<SiteRow>(
    db,
    `select id, client_id, name, address_line1, locality, region, postcode, country_code,
            latitude, longitude, site_operating_hours, cleaning_window, access_process,
            parking_notes, security_requirements, induction_requirements, current_contractor
     from public.sites where id = $1 and deleted_at is null`,
    [siteId],
  );
}

export async function createSite(
  db: Queryable,
  input: {
    organisationId: string;
    clientId: string | null;
    name: string;
    addressLine1?: string | null;
    locality?: string | null;
    region?: string | null;
    postcode?: string | null;
    countryCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    siteOperatingHours?: string | null;
    cleaningWindow?: string | null;
    accessProcess?: string | null;
    parkingNotes?: string | null;
    securityRequirements?: string | null;
    inductionRequirements?: string | null;
    currentContractor?: string | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.sites
       (organisation_id, client_id, name, address_line1, locality, region, postcode, country_code,
        latitude, longitude, site_operating_hours, cleaning_window, access_process, parking_notes,
        security_requirements, induction_requirements, current_contractor)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning id`,
    [
      input.organisationId,
      input.clientId,
      input.name,
      input.addressLine1 ?? null,
      input.locality ?? null,
      input.region ?? null,
      input.postcode ?? null,
      input.countryCode ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.siteOperatingHours ?? null,
      input.cleaningWindow ?? null,
      input.accessProcess ?? null,
      input.parkingNotes ?? null,
      input.securityRequirements ?? null,
      input.inductionRequirements ?? null,
      input.currentContractor ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create the site.');
  return row.id;
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export async function listOpportunities(
  db: Queryable,
  organisationId: string,
): Promise<OpportunityRow[]> {
  return many<OpportunityRow>(
    db,
    `select id, client_id, site_id, name, opportunity_type, lead_source, estimated_annual_value,
            quote_deadline, proposed_start_date, contract_term_months, incumbent_contractor,
            stage::text as stage, assigned_estimator_user_id, probability_pct, strategic_notes,
            created_at, updated_at
     from public.opportunities
     where organisation_id = $1 and deleted_at is null
     order by updated_at desc`,
    [organisationId],
  );
}

export async function createOpportunity(
  db: Queryable,
  input: {
    organisationId: string;
    clientId: string | null;
    siteId: string | null;
    name: string;
    opportunityType: string;
    leadSource?: string | null;
    quoteDeadline?: Date | null;
    proposedStartDate?: string | null;
    contractTermMonths?: number | null;
    incumbentContractor?: string | null;
    assignedEstimatorUserId?: string | null;
    strategicNotes?: string | null;
    createdByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.opportunities
       (organisation_id, client_id, site_id, name, opportunity_type, lead_source, quote_deadline,
        proposed_start_date, contract_term_months, incumbent_contractor,
        assigned_estimator_user_id, strategic_notes, created_by_user_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id`,
    [
      input.organisationId,
      input.clientId,
      input.siteId,
      input.name,
      input.opportunityType,
      input.leadSource ?? null,
      input.quoteDeadline ?? null,
      input.proposedStartDate ?? null,
      input.contractTermMonths ?? null,
      input.incumbentContractor ?? null,
      input.assignedEstimatorUserId ?? null,
      input.strategicNotes ?? null,
      input.createdByUserId,
    ],
  );
  if (!row) throw new Error('Failed to create the opportunity.');

  await db.query(
    `insert into public.opportunity_stage_events
       (organisation_id, opportunity_id, from_stage, to_stage, changed_by_user_id)
     values ($1, $2, null, 'new', $3)`,
    [input.organisationId, row.id, input.createdByUserId],
  );

  return row.id;
}

/**
 * Moves an opportunity and records the transition.
 *
 * The event row is written in the same statement batch as the update, so a
 * pipeline can never show a stage the history does not account for.
 */
export async function moveOpportunityStage(
  db: Queryable,
  input: {
    organisationId: string;
    opportunityId: string;
    toStage: string;
    changedByUserId: string;
    note?: string | null;
  },
): Promise<void> {
  const current = await one<{ stage: string }>(
    db,
    `select stage::text as stage from public.opportunities where id = $1`,
    [input.opportunityId],
  );
  if (!current || current.stage === input.toStage) return;

  await db.query(
    `update public.opportunities set stage = $2::public.opportunity_stage where id = $1`,
    [input.opportunityId, input.toStage],
  );

  await db.query(
    `insert into public.opportunity_stage_events
       (organisation_id, opportunity_id, from_stage, to_stage, changed_by_user_id, note)
     values ($1, $2, $3::public.opportunity_stage, $4::public.opportunity_stage, $5, $6)`,
    [
      input.organisationId,
      input.opportunityId,
      current.stage,
      input.toStage,
      input.changedByUserId,
      input.note ?? null,
    ],
  );
}

export async function listStageEvents(
  db: Queryable,
  opportunityId: string,
): Promise<
  { from_stage: string | null; to_stage: string; created_at: Date; note: string | null }[]
> {
  return many(
    db,
    `select from_stage::text as from_stage, to_stage::text as to_stage, created_at, note
     from public.opportunity_stage_events
     where opportunity_id = $1
     order by created_at`,
    [opportunityId],
  );
}
