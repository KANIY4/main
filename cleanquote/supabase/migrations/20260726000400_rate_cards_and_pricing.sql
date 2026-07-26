-- Rate cards, benchmarks and the priced quote itself.

create table public.rate_cards (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  -- A rate card that has priced a sent quote must never change underneath it.
  -- Editing a locked card creates a new version instead.
  locked_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rate_card_dates_ordered check (effective_to is null or effective_to >= effective_from)
);

select public.apply_timestamps('public.rate_cards');
create unique index rate_cards_one_default_per_org
  on public.rate_cards (organisation_id)
  where is_default and deleted_at is null;

create table public.labour_profiles (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  rate_card_id uuid not null references public.rate_cards (id) on delete cascade,
  code text not null,
  label text not null,
  base_hourly_rate numeric(12, 4) not null check (base_hourly_rate >= 0),
  engagement public.engagement_type not null default 'employee',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_card_id, code)
);

select public.apply_timestamps('public.labour_profiles');

-- On-costs cascade in `sort_order`. A payroll tax levied on wages *including*
-- retirement contributions is `applies_to = 'running_total'` with a higher order
-- than the contribution rule. Nothing here assumes one country's labour law.
create table public.on_cost_rules (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  rate_card_id uuid not null references public.rate_cards (id) on delete cascade,
  code text not null,
  label text not null,
  method text not null check (method in ('percent', 'per_paid_hour', 'fixed_per_year')),
  value numeric(14, 4) not null,
  applies_to text not null default 'base' check (applies_to in ('base', 'running_total')),
  sort_order integer not null default 0,
  applies_to_engagements public.engagement_type[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_card_id, code)
);

select public.apply_timestamps('public.on_cost_rules');

create table public.overhead_rules (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  rate_card_id uuid not null references public.rate_cards (id) on delete cascade,
  code text not null,
  label text not null,
  method text not null check (method in (
    'fixed_per_year', 'per_month', 'per_occurrence',
    'per_labour_hour', 'percent_of_revenue', 'percent_of_direct_cost'
  )),
  value numeric(14, 4) not null check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_card_id, code),
  -- Revenue-based overhead at 100% leaves nothing to price against; the engine
  -- would have no finite solution.
  constraint revenue_overhead_below_full_revenue
    check (method <> 'percent_of_revenue' or value < 100)
);

select public.apply_timestamps('public.overhead_rules');

create table public.cost_catalogue_items (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  rate_card_id uuid references public.rate_cards (id) on delete cascade,
  code text not null,
  label text not null,
  category text not null,
  default_method text not null check (default_method in (
    'per_year', 'per_month', 'per_occurrence', 'per_labour_hour', 'one_off'
  )),
  default_amount numeric(14, 4) not null default 0 check (default_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.cost_catalogue_items');

-- Guardrails and scenario definitions are organisation configuration, not code.
-- Scenario labels are renameable; the `key` stays stable so the engine and the
-- analytics keep agreeing about which strategy is which.
create table public.margin_rules (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  min_gross_margin_pct numeric(9, 4) check (min_gross_margin_pct is null or min_gross_margin_pct < 100),
  min_contribution_margin_pct numeric(9, 4),
  min_hourly_recovery numeric(14, 4),
  min_charge_per_visit numeric(14, 4),
  min_annual_contract_value numeric(18, 2),
  min_mobilisation_charge numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.margin_rules');

create table public.scenario_configs (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  scenario_key public.scenario_key not null,
  label text not null,
  pricing_basis_type text not null default 'margin' check (pricing_basis_type in ('margin', 'markup')),
  pricing_basis_value numeric(9, 4) not null,
  contingency_pct numeric(9, 4) not null default 0 check (contingency_pct >= 0),
  risk_contingency_multiplier numeric(9, 4) not null default 1 check (risk_contingency_multiplier >= 0),
  productivity_multiplier numeric(6, 4) not null default 1 check (productivity_multiplier between 0.5 and 2),
  supervision_multiplier numeric(6, 4) not null default 1 check (supervision_multiplier between 0.5 and 3),
  discount_pct numeric(9, 4) check (discount_pct is null or discount_pct < 100),
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, scenario_key)
);

select public.apply_timestamps('public.scenario_configs');

-- ---------------------------------------------------------------------------
-- Productivity benchmarks
-- ---------------------------------------------------------------------------

create table public.productivity_benchmarks (
  id uuid primary key default public.new_id(),
  -- null organisation_id = a published platform benchmark available to everyone.
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null,
  label text not null,
  task_code text not null,
  unit text not null,
  low_value numeric(14, 4) not null check (low_value > 0),
  midpoint_value numeric(14, 4) not null check (midpoint_value > 0),
  high_value numeric(14, 4) not null check (high_value > 0),
  country_code text,
  industry text,
  facility_type text,
  surface_type text,
  soil_level text,
  traffic_level text,
  conditions text,
  source text,
  version integer not null default 1,
  effective_from date not null default current_date,
  ai_suggested boolean not null default false,
  -- A benchmark learned from completed jobs only takes effect once an authorised
  -- user approves it. Nothing silently re-prices future quotes.
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_range_is_ordered check (low_value <= midpoint_value and midpoint_value <= high_value)
);

select public.apply_timestamps('public.productivity_benchmarks');
create index benchmarks_lookup_idx
  on public.productivity_benchmarks (task_code, country_code, industry)
  where approved_at is not null;

-- ---------------------------------------------------------------------------
-- Quote versions, lines and calculation snapshots
-- ---------------------------------------------------------------------------

create table public.quote_versions (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  version integer not null check (version > 0),
  rate_card_id uuid references public.rate_cards (id) on delete restrict,
  status public.quote_status not null default 'draft',
  notes text,
  -- Set when the version is sent. From that moment the version is immutable; see
  -- the trigger below.
  sealed_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, version)
);

select public.apply_timestamps('public.quote_versions');

create table public.quote_labour_lines (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  line_key text not null,
  label text not null,
  category text not null,
  labour_profile_code text not null,
  kind text not null check (kind in ('productivity', 'staffing', 'percent_of_labour')),
  schedule jsonb not null,
  rate_loading_pct numeric(9, 4),
  source_space_id uuid references public.spaces (id) on delete set null,
  -- productivity
  quantity numeric(14, 4),
  quantity_unit text,
  productivity_method text check (productivity_method is null or productivity_method in ('units_per_hour', 'minutes_per_unit')),
  productivity_value numeric(14, 4) check (productivity_value is null or productivity_value > 0),
  factors jsonb not null default '{}'::jsonb,
  benchmark_id uuid references public.productivity_benchmarks (id) on delete set null,
  -- staffing
  cleaners_per_shift numeric(9, 4) check (cleaners_per_shift is null or cleaners_per_shift >= 0),
  hours_per_shift numeric(9, 4) check (hours_per_shift is null or hours_per_shift >= 0),
  -- percent_of_labour
  percent_of_hours numeric(9, 4),
  basis_categories text[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_version_id, line_key),
  constraint productivity_line_is_complete check (
    kind <> 'productivity'
    or (quantity is not null and productivity_method is not null and productivity_value is not null)
  ),
  constraint staffing_line_is_complete check (
    kind <> 'staffing' or (cleaners_per_shift is not null and hours_per_shift is not null)
  ),
  constraint percent_line_is_complete check (
    kind <> 'percent_of_labour' or percent_of_hours is not null
  )
);

select public.apply_timestamps('public.quote_labour_lines');
create index quote_labour_lines_version_idx on public.quote_labour_lines (quote_version_id);

create table public.quote_cost_lines (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  line_key text not null,
  label text not null,
  category text not null,
  method text not null check (method in (
    'per_year', 'per_month', 'per_occurrence', 'per_labour_hour', 'one_off'
  )),
  amount numeric(14, 4) not null check (amount >= 0),
  schedule jsonb,
  one_off boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_version_id, line_key),
  constraint per_occurrence_cost_needs_schedule check (method <> 'per_occurrence' or schedule is not null)
);

select public.apply_timestamps('public.quote_cost_lines');

-- The immutable commercial record. Stores the full engine input and output plus
-- the input hash, so a price can be reproduced and defended months later even if
-- the rate card has since changed.
create table public.quote_calculation_snapshots (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  calculation_schema_version text not null,
  engine_input jsonb not null,
  engine_output jsonb not null,
  input_hash text not null,
  recommended_scenario public.scenario_key,
  calculated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index calculation_snapshots_version_idx
  on public.quote_calculation_snapshots (quote_version_id, created_at desc);

create table public.guardrail_overrides (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  guardrail_code text not null,
  scenario_key public.scenario_key,
  -- A reason of real substance is required; the check is the last line of defence
  -- behind the same rule in the validation package.
  reason text not null check (length(trim(reason)) >= 20),
  requested_by_user_id uuid not null references auth.users (id) on delete restrict,
  approved_by_user_id uuid references auth.users (id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index guardrail_overrides_version_idx on public.guardrail_overrides (quote_version_id);

-- ---------------------------------------------------------------------------
-- Approvals
-- ---------------------------------------------------------------------------

create table public.approvals (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_version_id uuid not null references public.quote_versions (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  requested_by_user_id uuid references auth.users (id) on delete set null,
  decided_by_user_id uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.approvals');

create table public.approval_comments (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  approval_id uuid not null references public.approvals (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Immutability of sent versions
-- ---------------------------------------------------------------------------

-- Once a version is sealed its priced lines cannot move. A revision is a new
-- version, which is what makes "what exactly did we quote in March?" answerable.
create or replace function public.reject_write_to_sealed_version()
returns trigger
language plpgsql
as $$
declare
  target_version uuid := coalesce(new.quote_version_id, old.quote_version_id);
  is_sealed boolean;
begin
  select qv.sealed_at is not null into is_sealed
  from public.quote_versions qv
  where qv.id = target_version;

  if is_sealed then
    raise exception
      'Quote version % has been sent and is immutable. Create a new version to revise it.',
      target_version
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger quote_labour_lines_respect_seal
  before insert or update or delete on public.quote_labour_lines
  for each row execute function public.reject_write_to_sealed_version();

create trigger quote_cost_lines_respect_seal
  before insert or update or delete on public.quote_cost_lines
  for each row execute function public.reject_write_to_sealed_version();

-- Snapshots are append-only in all cases: they are the evidence.
create or replace function public.reject_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Calculation snapshots are immutable evidence and cannot be % .', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger calculation_snapshots_are_immutable
  before update or delete on public.quote_calculation_snapshots
  for each row execute function public.reject_snapshot_mutation();
