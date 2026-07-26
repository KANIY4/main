-- Proposals, billing entitlements, AI run logging, outcomes and audit.

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------

create table public.proposal_templates (
  id uuid primary key default public.new_id(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null,
  label text not null,
  preset text check (preset in (
    'recurring_commercial', 'one_off', 'tender', 'window_cleaning',
    'periodical', 'industrial', 'gmp', 'post_construction'
  )),
  -- Which financial detail a client is allowed to see. Internal scenario names,
  -- cost lines and margin never appear in a client-facing document.
  show_price_breakdown boolean not null default true,
  show_labour_hours boolean not null default false,
  show_per_visit_price boolean not null default true,
  sections jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, code)
);

select public.apply_timestamps('public.proposal_templates');

create table public.proposals (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  template_id uuid references public.proposal_templates (id) on delete set null,
  scenario_key public.scenario_key not null,
  -- The rendered document as issued. Kept verbatim so "what did the client
  -- actually receive?" has a single answer.
  rendered_content jsonb not null,
  pdf_file_id uuid references public.files (id) on delete set null,
  -- Public link token. Random, revocable and expiring; a proposal URL is a
  -- bearer credential, so it is never derived from the quote id.
  public_token text unique,
  public_token_expires_at timestamptz,
  revoked_at timestamptz,
  sent_at timestamptz,
  sent_to_email text,
  first_viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_signature_file_id uuid references public.files (id) on delete set null,
  declined_at timestamptz,
  decline_reason text,
  expires_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_token_has_an_expiry
    check (public_token is null or public_token_expires_at is not null)
);

select public.apply_timestamps('public.proposals');
create index proposals_version_idx on public.proposals (quote_version_id);

create table public.proposal_events (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  event_type text not null check (event_type in (
    'sent', 'viewed', 'downloaded', 'commented', 'revision_requested',
    'accepted', 'declined', 'expired', 'link_revoked'
  )),
  actor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index proposal_events_proposal_idx on public.proposal_events (proposal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Outcomes and learning
-- ---------------------------------------------------------------------------

create table public.quote_outcomes (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  outcome text not null check (outcome in (
    'won', 'lost', 'no_decision', 'withdrawn', 'expired'
  )),
  scenario_key public.scenario_key,
  final_annual_value numeric(18, 2),
  loss_reason text,
  competitor_named boolean not null default false,
  decided_at timestamptz not null default now(),
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id)
);

select public.apply_timestamps('public.quote_outcomes');

-- Closes the loop: what the job actually cost against what it was quoted at.
-- This is the only honest source for improving an organisation's benchmarks.
create table public.actual_job_results (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  actual_labour_hours numeric(14, 4),
  actual_labour_cost numeric(18, 2),
  actual_direct_cost numeric(18, 2),
  actual_revenue numeric(18, 2),
  rectification_events integer not null default 0,
  client_satisfaction_score numeric(4, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actual_period_is_ordered check (period_end >= period_start)
);

select public.apply_timestamps('public.actual_job_results');

-- ---------------------------------------------------------------------------
-- Billing and entitlements
-- ---------------------------------------------------------------------------

create table public.plans (
  code text primary key,
  label text not null,
  description text,
  monthly_price_minor integer,
  annual_price_minor integer,
  currency_code text not null default 'USD',
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.plans');

create table public.plan_entitlements (
  plan_code text not null references public.plans (code) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  primary key (plan_code, feature)
);

create table public.plan_limits (
  plan_code text not null references public.plans (code) on delete cascade,
  dimension text not null,
  -- null means unlimited. Limits are data so a plan can change without a deploy.
  limit_value integer,
  period text not null default 'month' check (period in ('month', 'year', 'lifetime')),
  overage_allowed boolean not null default false,
  primary key (plan_code, dimension)
);

create table public.subscriptions (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  plan_code text not null references public.plans (code) on delete restrict,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text unique,
  status text not null default 'trialing' check (status in (
    'trialing', 'active', 'past_due', 'paused', 'canceled', 'incomplete'
  )),
  seats integer not null default 1 check (seats > 0),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id)
);

select public.apply_timestamps('public.subscriptions');

-- Per-organisation overrides layered over the plan, for enterprise deals and
-- support-granted exceptions.
create table public.organisation_entitlements (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  feature text not null,
  enabled boolean not null,
  limit_value integer,
  reason text,
  granted_by_user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organisation_id, feature)
);

create table public.usage_events (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  dimension text not null,
  quantity integer not null default 1 check (quantity > 0),
  quote_id uuid references public.quotes (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index usage_events_org_period_idx
  on public.usage_events (organisation_id, dimension, occurred_at desc);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------

create table public.ai_prompt_versions (
  id uuid primary key default public.new_id(),
  task text not null,
  version text not null,
  template text not null,
  model_hint text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task, version)
);

create table public.ai_threads (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete cascade,
  title text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.ai_threads');

create table public.ai_messages (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  thread_id uuid not null references public.ai_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index ai_messages_thread_idx on public.ai_messages (thread_id, created_at);

-- Every model call is logged with its cost, its schema-validation result and
-- whether the user accepted the suggestion. That last column is what makes
-- "is the copilot actually helping?" a measurable question.
create table public.ai_runs (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  thread_id uuid references public.ai_threads (id) on delete set null,
  task text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_refs text[] not null default '{}',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost numeric(12, 6) not null default 0 check (estimated_cost >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  schema_valid boolean not null,
  validation_errors text[],
  user_accepted boolean,
  created_at timestamptz not null default now()
);

create index ai_runs_org_idx on public.ai_runs (organisation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Append-only. No update or delete policy exists for any role, and the trigger
-- below refuses the operation even if one were added by mistake.
create table public.audit_logs (
  id uuid primary key default public.new_id(),
  organisation_id uuid references public.organisations (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Set when a platform administrator is acting on a tenant's behalf. Support
  -- impersonation is always visible in the record.
  impersonated_by_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs (organisation_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit records are append-only and cannot be % .', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger audit_logs_are_append_only
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();
