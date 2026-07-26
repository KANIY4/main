-- MVP commercial workflow: authentication, onboarding, opportunities, capture,
-- AI suggestions, proposals and transactional email.
--
-- Additive only. No existing table is altered in a way that changes the meaning
-- of a stored row, and no pricing behaviour is touched.

-- ---------------------------------------------------------------------------
-- Local authentication
-- ---------------------------------------------------------------------------
--
-- These two tables back the `local` auth provider, which exists so the whole
-- product is runnable without a hosted identity service. When AUTH_PROVIDER is
-- `supabase` they simply go unused: Supabase Auth owns `auth.users` and issues
-- its own sessions.
--
-- Password hashes are scrypt with a per-user salt, stored as
-- `scrypt$N$r$p$<salt>$<hash>` so the work factor travels with the hash and can
-- be raised later without invalidating existing credentials.

create table public.local_auth_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  email_verified_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  -- Lockout state. Counting failures in the database rather than in memory means
  -- the limit survives a restart and applies across every application instance.
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.local_auth_credentials');

-- Session tokens are stored as a hash, never in plaintext: a database leak must
-- not hand over live sessions.
create table public.user_sessions (
  id uuid primary key default public.new_id(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  -- Set when the session is deliberately ended. Kept rather than deleted so a
  -- sign-out is visible in the record.
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index user_sessions_user_idx on public.user_sessions (user_id)
  where revoked_at is null;
create index user_sessions_expiry_idx on public.user_sessions (expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.organisation_invitations (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id uuid references public.roles (id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by_user_id uuid not null references auth.users (id) on delete restrict,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.organisation_invitations');
create index invitations_org_idx on public.organisation_invitations (organisation_id)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Onboarding and setting provenance
-- ---------------------------------------------------------------------------

alter table public.organisation_settings
  add column primary_service_region text,
  add column company_size text,
  add column primary_service_categories text[] not null default '{}',
  add column labour_model text check (labour_model is null or labour_model in ('employee', 'subcontractor', 'mixed')),
  add column contact_email text,
  add column contact_phone text,
  add column contact_address text,
  add column secondary_colour text check (secondary_colour is null or secondary_colour ~ '^#[0-9a-fA-F]{6}$'),
  add column default_payment_terms text,
  add column default_exclusions text[] not null default '{}',
  add column default_proposal_intro text,
  add column default_contingency_pct numeric(9, 4) check (default_contingency_pct is null or default_contingency_pct >= 0),
  add column discount_approval_threshold_pct numeric(9, 4),
  add column onboarding_path text check (onboarding_path is null or onboarding_path in ('quick_start', 'advanced'));

-- Every commercial assumption a starter path applied is recorded here, so the
-- product can always answer "where did this number come from, and has anyone
-- actually agreed to it?". A starter value is never described as a benchmark.
create table public.organisation_setting_provenance (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  setting_key text not null,
  value text not null,
  source text not null check (source in (
    'system_starter_default', 'user_entered', 'imported', 'derived_from_answer'
  )),
  effective_from date not null default current_date,
  is_system_default boolean not null default false,
  confirmed_by_user_id uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, setting_key)
);

select public.apply_timestamps('public.organisation_setting_provenance');

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------

create type public.opportunity_stage as enum (
  'new',
  'walkthrough_scheduled',
  'capturing',
  'drafting',
  'awaiting_information',
  'pricing',
  'awaiting_approval',
  'sent',
  'negotiating',
  'won',
  'lost',
  'expired'
);

create table public.opportunities (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  name text not null,
  opportunity_type text not null default 'recurring',
  lead_source text,
  estimated_annual_value numeric(18, 2),
  quote_deadline timestamptz,
  proposed_start_date date,
  contract_term_months integer check (contract_term_months is null or contract_term_months > 0),
  incumbent_contractor text,
  stage public.opportunity_stage not null default 'new',
  assigned_estimator_user_id uuid references auth.users (id) on delete set null,
  probability_pct numeric(5, 2) check (probability_pct is null or probability_pct between 0 and 100),
  strategic_notes text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

select public.apply_timestamps('public.opportunities');
create index opportunities_org_stage_idx on public.opportunities (organisation_id, stage)
  where deleted_at is null;

-- Every stage movement is timestamped. A pipeline without transition history
-- cannot answer how long anything actually took.
create table public.opportunity_stage_events (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  from_stage public.opportunity_stage,
  to_stage public.opportunity_stage not null,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index opportunity_stage_events_idx
  on public.opportunity_stage_events (opportunity_id, created_at desc);

alter table public.quotes
  add column opportunity_id uuid references public.opportunities (id) on delete set null;

create index quotes_opportunity_idx on public.quotes (opportunity_id)
  where opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- Tasks and templates
-- ---------------------------------------------------------------------------

create table public.task_templates (
  id uuid primary key default public.new_id(),
  -- null organisation_id = a platform-published starter template.
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null,
  label text not null,
  space_type text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, code)
);

select public.apply_timestamps('public.task_templates');

create table public.task_template_items (
  id uuid primary key default public.new_id(),
  template_id uuid not null references public.task_templates (id) on delete cascade,
  label text not null,
  default_frequency text not null default 'weekly',
  default_minutes_per_unit numeric(10, 3) check (default_minutes_per_unit is null or default_minutes_per_unit >= 0),
  default_units_per_hour numeric(12, 3) check (default_units_per_hour is null or default_units_per_hour > 0),
  unit text not null default 'each',
  sort_order integer not null default 0,
  -- A template item must say how long it takes, one way or the other.
  constraint template_item_has_a_rate check (
    default_minutes_per_unit is not null or default_units_per_hour is not null
  )
);

create index task_template_items_template_idx on public.task_template_items (template_id);

create table public.quote_tasks (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  label text not null,
  template_item_id uuid references public.task_template_items (id) on delete set null,
  frequency_pattern public.schedule_pattern not null default 'weekly',
  days_per_week integer check (days_per_week is null or days_per_week between 1 and 7),
  times_per_month numeric(6, 2),
  occurrences_per_year numeric(12, 4),
  quantity numeric(14, 4) not null default 1 check (quantity >= 0),
  unit text not null default 'each',
  minutes_per_unit numeric(10, 3) check (minutes_per_unit is null or minutes_per_unit >= 0),
  units_per_hour numeric(12, 3) check (units_per_hour is null or units_per_hour > 0),
  labour_profile_code text not null default 'cleaner',
  -- How sure are we of this line? Drives the review queue and the confidence score.
  field_status text not null default 'estimated' check (field_status in (
    'confirmed', 'estimated', 'client_provided', 'pending_clarification'
  )),
  evidence_source public.evidence_source not null default 'manual_entry',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_task_has_a_rate check (
    minutes_per_unit is not null or units_per_hour is not null
  )
);

select public.apply_timestamps('public.quote_tasks');
create index quote_tasks_quote_idx on public.quote_tasks (quote_id);

-- Field-level confirmation state on the capture entities, so the review screen
-- can distinguish a confirmed measurement from an estimate someone never checked.
alter table public.spaces
  add column field_status text not null default 'estimated' check (field_status in (
    'confirmed', 'estimated', 'client_provided', 'pending_clarification'
  ));

alter table public.quote_assets
  add column field_status text not null default 'estimated' check (field_status in (
    'confirmed', 'estimated', 'client_provided', 'pending_clarification'
  ));

-- ---------------------------------------------------------------------------
-- Photo and capture metadata
-- ---------------------------------------------------------------------------

alter table public.files
  add column space_id uuid references public.spaces (id) on delete set null,
  add column observation_id uuid references public.observations (id) on delete set null,
  add column risk_id uuid references public.quote_risks (id) on delete set null,
  add column task_id uuid references public.quote_tasks (id) on delete set null,
  add column caption text,
  add column captured_at timestamptz,
  add column thumbnail_path text,
  add column width integer check (width is null or width > 0),
  add column height integer check (height is null or height > 0),
  -- Consent is explicit and separable: an image can be pulled from the client
  -- proposal while remaining in the evidence record.
  add column allow_in_proposal boolean not null default false,
  add column ai_processing_status text not null default 'not_requested'
    check (ai_processing_status in ('not_requested', 'queued', 'processing', 'complete', 'failed', 'excluded')),
  -- Prevents a retried upload from creating a second record for the same bytes.
  add column client_upload_id text;

create unique index files_client_upload_unique
  on public.files (organisation_id, client_upload_id)
  where client_upload_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- AI suggestions and questions
-- ---------------------------------------------------------------------------

create type public.ai_suggestion_status as enum (
  'suggested',
  'confirmed',
  'corrected',
  'rejected',
  'needs_review'
);

-- Every AI-derived proposal lands here first. Nothing reaches a quote's priced
-- record until a human confirms or corrects it, and the original suggestion is
-- kept alongside the correction so suggestion quality stays measurable.
create table public.ai_suggestions (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  run_id uuid references public.ai_runs (id) on delete set null,
  kind text not null check (kind in (
    'space', 'asset', 'task', 'risk', 'observation',
    'compliance_indicator', 'assumption', 'exclusion', 'clarification'
  )),
  -- The model's proposal, exactly as validated. Never edited in place.
  payload jsonb not null,
  -- What the user changed it to, when they corrected rather than confirmed.
  corrected_payload jsonb,
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  status public.ai_suggestion_status not null default 'suggested',
  source_file_id uuid references public.files (id) on delete set null,
  source_message_id uuid references public.ai_messages (id) on delete set null,
  model text not null,
  prompt_version text not null,
  -- Set once the suggestion has been turned into a real row on the quote.
  applied_entity_type text,
  applied_entity_id uuid,
  decided_by_user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corrected_suggestion_carries_a_correction check (
    status <> 'corrected' or corrected_payload is not null
  )
);

select public.apply_timestamps('public.ai_suggestions');
create index ai_suggestions_quote_idx on public.ai_suggestions (quote_id, status);

-- Questions are scored on commercial impact before they are shown, because a
-- product that asks twenty questions has stopped being a low-input product.
create table public.ai_questions (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  run_id uuid references public.ai_runs (id) on delete set null,
  question text not null,
  impact_area text not null check (impact_area in (
    'labour_hours', 'frequency', 'equipment', 'travel', 'access',
    'compliance', 'risk', 'contingency', 'minimum_charge', 'margin', 'scope'
  )),
  materiality text not null check (materiality in ('low', 'medium', 'high')),
  priority_score numeric(6, 2) not null default 0,
  answer_options text[],
  status text not null default 'open' check (status in (
    'open', 'answered', 'skipped', 'marked_assumption', 'ask_client', 'not_applicable'
  )),
  answer text,
  answered_by_user_id uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.ai_questions');
create index ai_questions_open_idx on public.ai_questions (quote_id, priority_score desc)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Approvals, proposals and delivery
-- ---------------------------------------------------------------------------

-- An approval is granted against one calculation, not against a quote in
-- general. Storing the hash and the figures at submission is what lets the
-- application detect that the thing approved is no longer the thing being sent.
alter table public.approvals
  add column scenario_key public.scenario_key,
  add column price_at_submission numeric(18, 2),
  add column margin_pct_at_submission numeric(9, 4),
  add column calculation_input_hash text,
  add column invalidated_at timestamptz,
  add column invalidation_reason text,
  add column trigger_reasons text[] not null default '{}';

alter table public.proposals
  add column title text,
  add column client_message text,
  add column selected_option_ids text[] not null default '{}',
  add column signer_name text,
  add column signer_title text,
  add column signature_statement text,
  add column accepted_ip inet,
  add column accepted_user_agent text,
  add column view_count integer not null default 0 check (view_count >= 0),
  add column last_viewed_at timestamptz,
  add column revision_requested_at timestamptz,
  add column revision_request_note text;

create table public.proposal_comments (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  -- Client-authored comments have no user id; that absence is the distinction.
  author_user_id uuid references auth.users (id) on delete set null,
  author_name text,
  body text not null check (length(trim(body)) between 1 and 5000),
  is_from_client boolean not null default false,
  created_at timestamptz not null default now()
);

create index proposal_comments_proposal_idx
  on public.proposal_comments (proposal_id, created_at);

create table public.email_deliveries (
  id uuid primary key default public.new_id(),
  organisation_id uuid references public.organisations (id) on delete set null,
  kind text not null,
  to_email text not null,
  subject text not null,
  body_text text not null,
  provider text not null,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'suppressed')),
  error text,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index email_deliveries_org_idx on public.email_deliveries (organisation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- System roles
-- ---------------------------------------------------------------------------

-- Platform-published roles, available to every organisation. An organisation
-- may still define its own; these exist so a new tenant is usable immediately.
insert into public.roles (id, organisation_id, code, label, is_system) values
  ('00000000-0000-4000-8000-000000000001'::uuid, null, 'owner', 'Owner', true),
  ('00000000-0000-4000-8000-000000000002'::uuid, null, 'administrator', 'Administrator', true),
  ('00000000-0000-4000-8000-000000000003'::uuid, null, 'estimator', 'Estimator', true),
  ('00000000-0000-4000-8000-000000000004'::uuid, null, 'reviewer', 'Reviewer', true),
  ('00000000-0000-4000-8000-000000000005'::uuid, null, 'operations', 'Operations', true),
  ('00000000-0000-4000-8000-000000000006'::uuid, null, 'finance', 'Finance', true),
  ('00000000-0000-4000-8000-000000000007'::uuid, null, 'read_only', 'Read Only', true);
