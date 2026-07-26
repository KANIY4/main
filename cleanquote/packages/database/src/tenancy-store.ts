import { many, one, type Queryable } from './client';

/**
 * Organisations, membership, onboarding settings and invitations.
 */

/** The seven platform-published roles, seeded by migration. */
export const SYSTEM_ROLE_IDS = {
  owner: '00000000-0000-4000-8000-000000000001',
  administrator: '00000000-0000-4000-8000-000000000002',
  estimator: '00000000-0000-4000-8000-000000000003',
  reviewer: '00000000-0000-4000-8000-000000000004',
  operations: '00000000-0000-4000-8000-000000000005',
  finance: '00000000-0000-4000-8000-000000000006',
  read_only: '00000000-0000-4000-8000-000000000007',
} as const;

export type SystemRoleCode = keyof typeof SYSTEM_ROLE_IDS;

export interface CreateOrganisationInput {
  readonly name: string;
  readonly slug: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly ownerUserId: string;
}

/**
 * Creates a tenant and its first membership as one act.
 *
 * This runs with the application's database role rather than under RLS, and
 * deliberately so: there is no INSERT policy on `organisations`, because at the
 * moment of creation the caller is not yet a member of anything and could not
 * satisfy one. Splitting it into two policy-governed statements would leave a
 * window where an organisation exists with no owner.
 */
export async function createOrganisation(
  db: Queryable,
  input: CreateOrganisationInput,
): Promise<{ organisationId: string }> {
  const org = await one<{ id: string }>(
    db,
    `insert into public.organisations (name, slug, country_code, currency_code)
     values ($1, $2, upper($3), upper($4))
     returning id`,
    [input.name, input.slug, input.countryCode, input.currencyCode],
  );
  if (!org) throw new Error('Failed to create the organisation.');

  await db.query(`insert into public.organisation_settings (organisation_id) values ($1)`, [
    org.id,
  ]);

  await db.query(
    `insert into public.organisation_members
       (organisation_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [org.id, input.ownerUserId, SYSTEM_ROLE_IDS.owner],
  );

  return { organisationId: org.id };
}

export interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  country_code: string;
  currency_code: string;
}

export async function getOrganisation(
  db: Queryable,
  organisationId: string,
): Promise<OrganisationRow | undefined> {
  return one<OrganisationRow>(
    db,
    `select id, name, slug, country_code, currency_code
     from public.organisations where id = $1`,
    [organisationId],
  );
}

export async function slugIsAvailable(db: Queryable, slug: string): Promise<boolean> {
  const row = await one<{ exists: boolean }>(
    db,
    `select exists(select 1 from public.organisations where slug = $1) as exists`,
    [slug],
  );
  return !row?.exists;
}

// ---------------------------------------------------------------------------
// Settings and onboarding
// ---------------------------------------------------------------------------

export interface OrganisationSettingsRow {
  organisation_id: string;
  brand_name: string | null;
  primary_colour: string | null;
  secondary_colour: string | null;
  unit_system: string;
  tax_code: string;
  tax_label: string;
  tax_rate_pct: string;
  tax_display_inclusive: boolean;
  weeks_per_year: string;
  months_per_year: string;
  public_holidays_per_year: string;
  public_holiday_service_day_fraction: string;
  rounding_increment: string;
  rounding_mode: string;
  absence_allowance_pct: string;
  default_quote_validity_days: number;
  approval_required_above_annual_value: string | null;
  approval_required_below_margin_pct: string | null;
  onboarding_completed_at: Date | null;
  starter_settings_applied: boolean;
  primary_service_region: string | null;
  company_size: string | null;
  primary_service_categories: string[];
  labour_model: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  default_payment_terms: string | null;
  default_exclusions: string[];
  default_proposal_intro: string | null;
  default_contingency_pct: string | null;
  discount_approval_threshold_pct: string | null;
  onboarding_path: string | null;
}

export async function getSettings(
  db: Queryable,
  organisationId: string,
): Promise<OrganisationSettingsRow | undefined> {
  return one<OrganisationSettingsRow>(
    db,
    `select * from public.organisation_settings where organisation_id = $1`,
    [organisationId],
  );
}

/**
 * Applies a settings patch and records provenance for every key touched.
 *
 * The column list is an allowlist rather than a spread of whatever arrived, so a
 * malicious or careless caller cannot write to a column the form was never meant
 * to reach.
 */
const UPDATABLE_SETTINGS = new Set([
  'brand_name',
  'primary_colour',
  'secondary_colour',
  'unit_system',
  'tax_code',
  'tax_label',
  'tax_rate_pct',
  'tax_display_inclusive',
  'weeks_per_year',
  'public_holidays_per_year',
  'public_holiday_service_day_fraction',
  'rounding_increment',
  'rounding_mode',
  'absence_allowance_pct',
  'default_quote_validity_days',
  'approval_required_above_annual_value',
  'approval_required_below_margin_pct',
  'primary_service_region',
  'company_size',
  'primary_service_categories',
  'labour_model',
  'contact_email',
  'contact_phone',
  'contact_address',
  'default_payment_terms',
  'default_exclusions',
  'default_proposal_intro',
  'default_contingency_pct',
  'discount_approval_threshold_pct',
  'onboarding_path',
  'starter_settings_applied',
  'onboarding_completed_at',
]);

export type SettingSource =
  | 'system_starter_default'
  | 'user_entered'
  | 'imported'
  | 'derived_from_answer';

export async function updateSettings(
  db: Queryable,
  organisationId: string,
  patch: Record<string, unknown>,
  provenance: { source: SettingSource; userId: string | null },
): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => UPDATABLE_SETTINGS.has(key));
  if (entries.length === 0) return;

  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  await db.query(
    `update public.organisation_settings set ${assignments} where organisation_id = $1`,
    [organisationId, ...entries.map(([, value]) => value)],
  );

  const isSystemDefault = provenance.source === 'system_starter_default';
  for (const [key, value] of entries) {
    await db.query(
      `insert into public.organisation_setting_provenance
         (organisation_id, setting_key, value, source, is_system_default, confirmed_by_user_id, confirmed_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (organisation_id, setting_key) do update
         set value = excluded.value,
             source = excluded.source,
             is_system_default = excluded.is_system_default,
             confirmed_by_user_id = excluded.confirmed_by_user_id,
             confirmed_at = excluded.confirmed_at,
             effective_from = current_date`,
      [
        organisationId,
        key,
        value === null || value === undefined ? '' : String(value),
        provenance.source,
        isSystemDefault,
        isSystemDefault ? null : provenance.userId,
        isSystemDefault ? null : new Date(),
      ],
    );
  }
}

export interface ProvenanceRow {
  setting_key: string;
  value: string;
  source: string;
  effective_from: Date;
  is_system_default: boolean;
  confirmed_at: Date | null;
}

export async function listProvenance(
  db: Queryable,
  organisationId: string,
): Promise<ProvenanceRow[]> {
  return many<ProvenanceRow>(
    db,
    `select setting_key, value, source, effective_from, is_system_default, confirmed_at
     from public.organisation_setting_provenance
     where organisation_id = $1
     order by is_system_default desc, setting_key`,
    [organisationId],
  );
}

// ---------------------------------------------------------------------------
// Members and invitations
// ---------------------------------------------------------------------------

export interface MemberSummaryRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role_code: string | null;
  role_label: string | null;
  status: string;
  joined_at: Date | null;
}

export async function listMembers(
  db: Queryable,
  organisationId: string,
): Promise<MemberSummaryRow[]> {
  return many<MemberSummaryRow>(
    db,
    `select m.user_id, u.email, p.full_name, r.code as role_code, r.label as role_label,
            m.status::text as status, m.joined_at
     from public.organisation_members m
     join auth.users u on u.id = m.user_id
     left join public.user_profiles p on p.id = m.user_id
     left join public.roles r on r.id = m.role_id
     where m.organisation_id = $1
     order by m.created_at`,
    [organisationId],
  );
}

export async function createInvitation(
  db: Queryable,
  input: {
    organisationId: string;
    email: string;
    roleId: string;
    tokenHash: string;
    expiresAt: Date;
    invitedByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.organisation_invitations
       (organisation_id, email, role_id, token_hash, expires_at, invited_by_user_id)
     values ($1, lower($2), $3, $4, $5, $6)
     returning id`,
    [
      input.organisationId,
      input.email,
      input.roleId,
      input.tokenHash,
      input.expiresAt,
      input.invitedByUserId,
    ],
  );
  if (!row) throw new Error('Failed to create the invitation.');
  return row.id;
}

/**
 * Redeems an invitation and creates the membership atomically.
 *
 * Runs at system level because the invitee is, by definition, not yet a member
 * and so cannot satisfy the membership INSERT policy. The token is the
 * authorisation: it is single-use, expiring, and matched on its hash.
 */
export async function acceptInvitation(
  db: Queryable,
  tokenHash: string,
  userId: string,
  userEmail: string,
): Promise<{ organisationId: string } | undefined> {
  const invite = await one<{
    id: string;
    organisation_id: string;
    role_id: string | null;
    email: string;
  }>(
    db,
    `select id, organisation_id, role_id, email
     from public.organisation_invitations
     where token_hash = $1
       and accepted_at is null
       and revoked_at is null
       and expires_at > now()`,
    [tokenHash],
  );
  if (!invite) return undefined;

  // The invitation names an address. Letting a different account redeem it would
  // turn a leaked link into an arbitrary-account admission.
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) return undefined;

  await db.query(
    `insert into public.organisation_members (organisation_id, user_id, role_id, status, joined_at)
     values ($1, $2, $3, 'active', now())
     on conflict (organisation_id, user_id) do update
       set status = 'active', role_id = excluded.role_id, joined_at = now()`,
    [invite.organisation_id, userId, invite.role_id],
  );

  await db.query(
    `update public.organisation_invitations
     set accepted_at = now(), accepted_by_user_id = $2
     where id = $1`,
    [invite.id, userId],
  );

  return { organisationId: invite.organisation_id };
}

export async function setMemberStatus(
  db: Queryable,
  organisationId: string,
  userId: string,
  status: 'active' | 'suspended',
): Promise<void> {
  await db.query(
    `update public.organisation_members set status = $3
     where organisation_id = $1 and user_id = $2`,
    [organisationId, userId, status],
  );
}

export async function listSystemRoles(
  db: Queryable,
): Promise<{ id: string; code: string; label: string }[]> {
  return many<{ id: string; code: string; label: string }>(
    db,
    `select id, code, label from public.roles where organisation_id is null order by label`,
  );
}
