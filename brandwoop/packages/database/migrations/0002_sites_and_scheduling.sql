-- 0002_sites_and_scheduling
-- Sites, service plans, worker allocation, shifts and attendance.
--
-- Rollback: drop the objects created here. No data-preserving reversal exists
-- once shifts have been published; correct forward instead.

create type brandwoop.site_status as enum ('draft', 'active', 'inactive');

create table brandwoop.site (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  name text not null,
  address_line text not null,
  suburb text not null,
  state text not null check (state in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
  postcode text not null check (postcode ~ '^[0-9]{4}$'),
  timezone text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geofence_radius_metres integer not null check (geofence_radius_metres between 20 and 2000),
  gps_accuracy_threshold_metres integer not null default 50
    check (gps_accuracy_threshold_metres between 10 and 500),
  status brandwoop.site_status not null default 'draft',
  hazard_notes text,
  access_notes text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_site_tenant_id_status on brandwoop.site (tenant_id, status)
  where deleted_at is null;

create table brandwoop.site_area (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create index idx_site_area_site_id on brandwoop.site_area (site_id);

create table brandwoop.site_contact (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  name text not null,
  email citext,
  phone text,
  receives_reports boolean not null default false
);

create index idx_site_contact_site_id on brandwoop.site_contact (site_id);

-- Allocation drives the "allocated" grant in packages/auth.
create table brandwoop.site_assignment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  user_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint site_assignment_window check (effective_to is null or effective_to >= effective_from)
);

create index idx_site_assignment_user_id_site_id
  on brandwoop.site_assignment (user_id, site_id);

/*
 * Policy predicates are `security definer` and run as the schema owner.
 *
 * Two reasons, both structural. A policy on tenant_membership that asked
 * "is this user an administrator?" would query tenant_membership and re-enter
 * its own policy — infinite recursion. And the request role holds no direct
 * grant on the membership tables, so an invoker-rights helper would fail with
 * a permission error before any policy was evaluated.
 *
 * Each helper answers a single boolean about the *current* session and returns
 * no row data, so definer rights leak nothing. `search_path` is pinned so the
 * body cannot be redirected by a caller-set path.
 */
create or replace function brandwoop.user_allocated_to_site(target_site_id uuid) returns boolean
  language sql stable security definer set search_path = brandwoop, pg_catalog as $$
    select exists (
      select 1
      from brandwoop.site_assignment sa
      where sa.site_id = target_site_id
        and sa.user_id = brandwoop.current_user_id()
        and sa.effective_from <= current_date
        and (sa.effective_to is null or sa.effective_to >= current_date)
    );
  $$;

create or replace function brandwoop.current_role_in_tenant(target_tenant_id uuid)
  returns brandwoop.role
  language sql stable security definer set search_path = brandwoop, pg_catalog as $$
    select tm.role
    from brandwoop.tenant_membership tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = brandwoop.current_user_id()
      and tm.status = 'active';
  $$;

-- Service plans are versioned; a shift stores the version it ran against.
create table brandwoop.service_plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  version integer not null check (version >= 1),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint service_plan_unique_version unique (site_id, version)
);

create table brandwoop.task_template_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  service_plan_id uuid not null references brandwoop.service_plan (id) on delete cascade,
  area_id uuid references brandwoop.site_area (id) on delete set null,
  description text not null,
  is_required boolean not null default true,
  requires_photo boolean not null default false,
  sort_order integer not null default 0
);

create index idx_task_template_item_service_plan_id
  on brandwoop.task_template_item (service_plan_id);

-- Pay rates are effective-dated and read through a field-authorised path only.
create table brandwoop.pay_rate_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  worker_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  hourly_rate_cents integer not null check (hourly_rate_cents between 0 and 100000),
  effective_from date not null,
  effective_to date,
  created_by uuid not null references brandwoop.user_profile (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_pay_rate_history_worker_id_effective_from
  on brandwoop.pay_rate_history (worker_id, effective_from desc);

create type brandwoop.shift_status as enum
  ('draft', 'published', 'in_progress', 'completed', 'cancelled', 'missed');

create table brandwoop.shift_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete cascade,
  service_plan_id uuid not null references brandwoop.service_plan (id) on delete restrict,
  name text not null,
  recurrence jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table brandwoop.shift (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  site_id uuid not null references brandwoop.site (id) on delete restrict,
  shift_template_id uuid references brandwoop.shift_template (id) on delete set null,
  service_plan_version integer not null check (service_plan_version >= 1),
  occurrence_key text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status brandwoop.shift_status not null default 'draft',
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_window check (scheduled_end > scheduled_start),
  -- Re-expanding a recurrence cannot create a duplicate shift.
  constraint shift_occurrence_unique unique (tenant_id, occurrence_key)
);

create index idx_shift_tenant_id_scheduled_start
  on brandwoop.shift (tenant_id, scheduled_start desc);
create index idx_shift_site_id_status on brandwoop.shift (site_id, status);

create table brandwoop.shift_assignment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete cascade,
  worker_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  is_cover boolean not null default false,
  replaced_assignment_id uuid references brandwoop.shift_assignment (id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint shift_assignment_unique unique (shift_id, worker_id)
);

create index idx_shift_assignment_worker_id on brandwoop.shift_assignment (worker_id);

create trigger site_touch before update on brandwoop.site
  for each row execute function brandwoop.touch_updated_at();
create trigger shift_touch before update on brandwoop.shift
  for each row execute function brandwoop.touch_updated_at();
