-- Tenancy: organisations, membership, and the authorisation helpers that every
-- RLS policy in this schema is built on.

create table public.organisations (
  id uuid primary key default public.new_id(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Franchise and multi-branch structures: a branch points at its parent. Data
  -- isolation between branches is a policy decision stored in settings, not an
  -- assumption baked into the schema.
  parent_organisation_id uuid references public.organisations (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organisation_is_not_its_own_parent check (id <> parent_organisation_id)
);

select public.apply_timestamps('public.organisations');

create index organisations_parent_idx on public.organisations (parent_organisation_id)
  where parent_organisation_id is not null;

-- Everything configurable about a tenant lives here rather than in code, so the
-- product name, plan names, calendar assumptions and scenario labels can all be
-- changed without a deploy.
create table public.organisation_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  brand_name text,
  logo_file_id uuid,
  primary_colour text check (primary_colour is null or primary_colour ~ '^#[0-9a-fA-F]{6}$'),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  tax_code text not null default 'TAX',
  tax_label text not null default 'Tax',
  tax_rate_pct numeric(9, 4) not null default 0 check (tax_rate_pct >= 0),
  tax_display_inclusive boolean not null default false,
  weeks_per_year numeric(9, 4) not null default 52.1775 check (weeks_per_year between 1 and 53),
  months_per_year numeric(9, 4) not null default 12 check (months_per_year between 1 and 12),
  public_holidays_per_year numeric(9, 4) not null default 0 check (public_holidays_per_year >= 0),
  public_holiday_service_day_fraction numeric(5, 4) not null default 1
    check (public_holiday_service_day_fraction between 0 and 1),
  rounding_increment numeric(12, 4) not null default 0.01 check (rounding_increment > 0),
  rounding_mode text not null default 'half_up'
    check (rounding_mode in ('half_up', 'half_even', 'up', 'down')),
  absence_allowance_pct numeric(9, 4) not null default 0 check (absence_allowance_pct >= 0),
  default_quote_validity_days integer not null default 30 check (default_quote_validity_days > 0),
  -- Approval thresholds: a quote below these values skips the approval workflow.
  approval_required_above_annual_value numeric(18, 2),
  approval_required_below_margin_pct numeric(9, 4),
  onboarding_completed_at timestamptz,
  starter_settings_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.organisation_settings');

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_file_id uuid,
  locale text not null default 'en',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.user_profiles');

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

-- Permissions are rows, not an enum, so an organisation can be granted a new
-- capability without a migration. Roles are a convenience label over a set of
-- these; authorisation is always decided on the permission.
create table public.permissions (
  code text primary key,
  label text not null,
  description text
);

insert into public.permissions (code, label) values
  ('quote.create', 'Create quotes'),
  ('quote.edit', 'Edit quotes'),
  ('quote.delete', 'Delete quotes'),
  ('quote.view_cost', 'View cost breakdown'),
  ('quote.view_selling_price', 'View selling prices'),
  ('quote.view_profit', 'View profit and margin'),
  ('quote.override_margin', 'Override margin guardrails'),
  ('quote.approve', 'Approve quotes'),
  ('quote.send', 'Send proposals'),
  ('rate_card.manage', 'Manage rate cards'),
  ('benchmark.manage', 'Manage productivity benchmarks'),
  ('user.manage', 'Manage users'),
  ('organisation.manage', 'Manage organisation settings'),
  ('analytics.view', 'View analytics'),
  ('ai.view_history', 'View AI history'),
  ('data.export', 'Export data'),
  ('billing.manage', 'Manage billing'),
  ('integration.manage', 'Manage integrations');

create table public.roles (
  id uuid primary key default public.new_id(),
  -- null organisation_id marks a system role available to every tenant.
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null,
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, code)
);

select public.apply_timestamps('public.roles');

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_id, permission_code)
);

create table public.organisation_members (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid references public.roles (id) on delete set null,
  status public.membership_status not null default 'invited',
  -- Per-member grants and revocations layered over the role, so one estimator can
  -- be given margin-override rights without inventing a new role.
  granted_permissions text[] not null default '{}',
  revoked_permissions text[] not null default '{}',
  invited_by_user_id uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

select public.apply_timestamps('public.organisation_members');

create index organisation_members_user_idx on public.organisation_members (user_id)
  where status = 'active';
create index organisation_members_org_idx on public.organisation_members (organisation_id);

-- ---------------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------------
--
-- These are SECURITY DEFINER on purpose. A policy on `organisation_members` that
-- queried `organisation_members` directly would recurse infinitely; running the
-- lookup in a definer function breaks the cycle. `search_path` is pinned so the
-- elevated function cannot be redirected by a caller-controlled search path.

create or replace function public.is_org_member(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = target_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Resolves the effective permission set: role grants, plus per-member grants,
-- minus per-member revocations. Revocation wins, so removing a capability is
-- always decisive.
create or replace function public.has_permission(
  target_organisation_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.organisation_members m
    left join public.role_permissions rp on rp.role_id = m.role_id
    where m.organisation_id = target_organisation_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and not (required_permission = any (m.revoked_permissions))
      and (
        rp.permission_code = required_permission
        or required_permission = any (m.granted_permissions)
      )
  );
$$;

-- Organisations the caller can see, including branches of a parent they belong to.
create or replace function public.accessible_organisation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.organisation_id
  from public.organisation_members m
  where m.user_id = auth.uid() and m.status = 'active'
  union
  select o.id
  from public.organisations o
  join public.organisation_members m on m.organisation_id = o.parent_organisation_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and public.has_permission(o.parent_organisation_id, 'organisation.manage');
$$;

revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.has_permission(uuid, text) from public;
revoke execute on function public.accessible_organisation_ids() from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.accessible_organisation_ids() to authenticated;
