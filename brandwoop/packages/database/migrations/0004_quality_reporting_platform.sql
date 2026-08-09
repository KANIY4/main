-- 0004_quality_reporting_platform
-- Audits, issues, rectifications, reports, outbox and notifications.
--
-- Rollback: drop the objects created here. Safe only before audits or reports
-- exist in the environment.

create table brandwoop.audit_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  name text not null,
  version integer not null check (version >= 1),
  pass_threshold_percent integer not null check (pass_threshold_percent between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint audit_template_unique_version unique (tenant_id, name, version)
);

create table brandwoop.audit_item_definition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  audit_template_id uuid not null references brandwoop.audit_template (id) on delete cascade,
  area_id uuid references brandwoop.site_area (id) on delete set null,
  question text not null,
  weight integer not null check (weight between 1 and 10),
  requires_photo boolean not null default false,
  is_critical boolean not null default false,
  sort_order integer not null default 0
);

create index idx_audit_item_definition_audit_template_id
  on brandwoop.audit_item_definition (audit_template_id);

create table brandwoop.audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete restrict,
  audit_template_id uuid not null references brandwoop.audit_template (id) on delete restrict,
  template_version integer not null,
  supervisor_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'finalised')),
  score_percent numeric(5, 2) check (score_percent between 0 and 100),
  passed boolean,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  -- A finalised audit must carry its score; a draft must not claim one.
  constraint audit_finalised_complete check (
    (status = 'draft' and finalised_at is null and passed is null)
    or (status = 'finalised' and finalised_at is not null and passed is not null
        and score_percent is not null)
  )
);

create index idx_audit_tenant_id_site_id_created_at
  on brandwoop.audit (tenant_id, site_id, created_at desc);

create table brandwoop.audit_item_result (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  audit_id uuid not null references brandwoop.audit (id) on delete cascade,
  item_definition_id uuid not null references brandwoop.audit_item_definition (id) on delete restrict,
  score integer not null check (score between 0 and 10),
  comment text,
  constraint audit_item_result_unique unique (audit_id, item_definition_id)
);

create type brandwoop.issue_status as enum
  ('open', 'assigned', 'in_progress', 'awaiting_verification', 'closed', 'reopened');

create table brandwoop.issue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete restrict,
  audit_id uuid references brandwoop.audit (id) on delete set null,
  shift_id uuid references brandwoop.shift (id) on delete set null,
  title text not null,
  description text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  category text not null check (category in
    ('cleaning_quality', 'safety', 'equipment', 'supplies', 'access', 'other')),
  status brandwoop.issue_status not null default 'open',
  assignee_id uuid references brandwoop.user_profile (id) on delete restrict,
  due_at timestamptz,
  closed_at timestamptz,
  closure_reason text,
  created_by uuid not null references brandwoop.user_profile (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_closure_reason_required check (
    status <> 'closed' or closure_reason is not null
  )
);

create index idx_issue_tenant_id_status_due_at on brandwoop.issue (tenant_id, status, due_at);
create index idx_issue_assignee_id on brandwoop.issue (assignee_id)
  where status <> 'closed';

create table brandwoop.rectification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  issue_id uuid not null references brandwoop.issue (id) on delete cascade,
  action text not null,
  completed_by uuid references brandwoop.user_profile (id) on delete restrict,
  completed_at timestamptz,
  verifier_id uuid references brandwoop.user_profile (id) on delete restrict,
  verification_decision text check (verification_decision in ('accepted', 'rejected')),
  verification_note text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  -- The person who did the work cannot be the person who verifies it.
  constraint rectification_verifier_independent check (
    verifier_id is null or completed_by is null or verifier_id <> completed_by
  )
);

create index idx_rectification_issue_id on brandwoop.rectification (issue_id);

create table brandwoop.daily_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  supervisor_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  log_date date not null,
  staffing_note text,
  client_interaction_note text,
  safety_observation text,
  handover_action text,
  created_at timestamptz not null default now(),
  constraint daily_log_unique unique (site_id, supervisor_id, log_date)
);

create table brandwoop.supply_shortage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  reported_by uuid not null references brandwoop.user_profile (id) on delete restrict,
  item text not null,
  quantity integer not null check (quantity between 1 and 1000),
  urgency text not null check (urgency in ('routine', 'urgent')),
  note text,
  status text not null default 'reported'
    check (status in ('reported', 'ordered', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create index idx_supply_shortage_tenant_id_status
  on brandwoop.supply_shortage (tenant_id, status);

create table brandwoop.report (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete restrict,
  type text not null check (type in
    ('shift_service', 'audit', 'attendance_exception', 'site_activity', 'issue_rectification')),
  reference text not null unique,
  source_entity_id uuid not null,
  current_version integer not null default 1,
  generated_at timestamptz not null default now(),
  -- One report per source event; regeneration adds a version, not a report.
  constraint report_unique_source unique (tenant_id, type, source_entity_id)
);

create table brandwoop.report_version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  report_id uuid not null references brandwoop.report (id) on delete cascade,
  version integer not null check (version >= 1),
  object_path text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  regeneration_reason text,
  generated_at timestamptz not null default now(),
  constraint report_version_unique unique (report_id, version)
);

create table brandwoop.delivery_attempt (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  report_version_id uuid not null references brandwoop.report_version (id) on delete cascade,
  recipient_email citext not null,
  status text not null check (status in
    ('queued', 'sent', 'delivered', 'bounced', 'failed', 'suppressed')),
  attempt_number integer not null check (attempt_number between 1 and 10),
  provider_message_id text,
  failure_category text,
  attempted_at timestamptz not null default now(),
  constraint delivery_attempt_unique unique (report_version_id, recipient_email, attempt_number)
);

create index idx_delivery_attempt_status on brandwoop.delivery_attempt (status);

-- ---------------------------------------------------------------------------
-- Outbox: written in the same transaction as the business record. Workers
-- claim an event once; the unique idempotency key makes retries harmless.
-- ---------------------------------------------------------------------------

create table brandwoop.outbox_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  type text not null,
  payload jsonb not null,
  actor_user_id uuid references brandwoop.user_profile (id) on delete restrict,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  processed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  constraint outbox_event_idempotent unique (tenant_id, type, idempotency_key)
);

create index idx_outbox_event_unprocessed on brandwoop.outbox_event (occurred_at)
  where processed_at is null;

create table brandwoop.notification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  user_id uuid not null references brandwoop.user_profile (id) on delete cascade,
  outbox_event_id uuid references brandwoop.outbox_event (id) on delete set null,
  channel text not null check (channel in ('push', 'email', 'sms', 'in_app')),
  title text not null,
  body text not null,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- One notification per user, event and channel, however often a job retries.
  constraint notification_unique unique (user_id, outbox_event_id, channel)
);

create index idx_notification_user_id_created_at
  on brandwoop.notification (user_id, created_at desc);

create table brandwoop.notification_preference (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  user_id uuid not null references brandwoop.user_profile (id) on delete cascade,
  event_type text not null,
  channels text[] not null default '{}',
  constraint notification_preference_unique unique (user_id, tenant_id, event_type)
);

create table brandwoop.retention_policy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete cascade,
  record_type text not null,
  retain_days integer not null check (retain_days between 30 and 3650),
  legal_hold boolean not null default false,
  constraint retention_policy_unique unique (tenant_id, record_type)
);

create trigger issue_touch before update on brandwoop.issue
  for each row execute function brandwoop.touch_updated_at();
