-- 0001_identity_and_tenancy
-- Tenants, memberships, site allocations and the audit log.
--
-- Rollback: this migration creates the schema baseline. Reversal is a drop of
-- the objects it creates and is only valid before any environment holds data.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists brandwoop;

-- ---------------------------------------------------------------------------
-- Session helpers
--
-- The application sets these per connection after verifying the session. RLS
-- policies read them; they are never taken from a request body or header.
-- ---------------------------------------------------------------------------

create or replace function brandwoop.current_user_id() returns uuid
  language sql stable as $$
    select nullif(current_setting('brandwoop.user_id', true), '')::uuid;
  $$;

create or replace function brandwoop.current_tenant_id() returns uuid
  language sql stable as $$
    select nullif(current_setting('brandwoop.tenant_id', true), '')::uuid;
  $$;

create table brandwoop.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  company_code text not null unique check (company_code ~ '^[A-Z0-9][A-Z0-9-]{3,15}$'),
  timezone text not null default 'Australia/Sydney',
  brand_primary_colour text check (brand_primary_colour ~ '^#[0-9a-fA-F]{6}$'),
  logo_object_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table brandwoop.user_profile (
  id uuid primary key,
  display_name text not null check (length(trim(display_name)) between 1 and 200),
  email citext,
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type brandwoop.role as enum ('cleaner', 'supervisor', 'administrator', 'platform_owner');
create type brandwoop.membership_status as enum ('invited', 'active', 'suspended', 'archived');

create table brandwoop.tenant_membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  user_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  role brandwoop.role not null,
  status brandwoop.membership_status not null default 'invited',
  invited_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One membership per user per tenant. A role change updates this row.
  constraint tenant_membership_unique unique (tenant_id, user_id)
);

create index idx_tenant_membership_user_id on brandwoop.tenant_membership (user_id);
create index idx_tenant_membership_tenant_id_status
  on brandwoop.tenant_membership (tenant_id, status);

-- Site allocation is created in 0002 once the site table exists; the helper is
-- declared here so later policies can reference a single definition.

create table brandwoop.device_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references brandwoop.user_profile (id) on delete cascade,
  tenant_id uuid references brandwoop.tenant (id) on delete cascade,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index idx_device_session_user_id on brandwoop.device_session (user_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Support access: time-bound, reason-coded, visible to the tenant.
-- ---------------------------------------------------------------------------

create table brandwoop.support_access_grant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete cascade,
  granted_to_user_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  reason_code text not null,
  reason_detail text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint support_grant_window check (expires_at > granted_at)
);

create index idx_support_access_grant_tenant_id_expires_at
  on brandwoop.support_access_grant (tenant_id, expires_at);

-- ---------------------------------------------------------------------------
-- Append-only audit log. Updates and deletes are rejected by trigger, not by
-- convention, so a compromised application cannot rewrite history.
-- ---------------------------------------------------------------------------

create table brandwoop.audit_log (
  id bigserial primary key,
  tenant_id uuid references brandwoop.tenant (id) on delete restrict,
  actor_user_id uuid references brandwoop.user_profile (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_audit_log_tenant_id_occurred_at
  on brandwoop.audit_log (tenant_id, occurred_at desc);

create or replace function brandwoop.reject_mutation() returns trigger
  language plpgsql as $$
  begin
    raise exception 'Table % is append-only', tg_table_name
      using errcode = 'restrict_violation';
  end;
  $$;

create trigger audit_log_no_update before update on brandwoop.audit_log
  for each row execute function brandwoop.reject_mutation();

create trigger audit_log_no_delete before delete on brandwoop.audit_log
  for each row execute function brandwoop.reject_mutation();

create or replace function brandwoop.touch_updated_at() returns trigger
  language plpgsql as $$
  begin
    new.updated_at := now();
    return new;
  end;
  $$;

create trigger tenant_touch before update on brandwoop.tenant
  for each row execute function brandwoop.touch_updated_at();
create trigger user_profile_touch before update on brandwoop.user_profile
  for each row execute function brandwoop.touch_updated_at();
create trigger tenant_membership_touch before update on brandwoop.tenant_membership
  for each row execute function brandwoop.touch_updated_at();
