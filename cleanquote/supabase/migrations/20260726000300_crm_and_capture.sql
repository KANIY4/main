-- Clients, sites and the walkthrough capture domain.

create table public.clients (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  industry text,
  notes text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

select public.apply_timestamps('public.clients');
create index clients_org_idx on public.clients (organisation_id) where deleted_at is null;

create table public.client_contacts (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null,
  role_title text,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

select public.apply_timestamps('public.client_contacts');
create index client_contacts_client_idx on public.client_contacts (client_id);

create table public.sites (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  name text not null,
  address_line1 text,
  address_line2 text,
  locality text,
  region text,
  postcode text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  site_operating_hours text,
  cleaning_window text,
  access_process text,
  parking_notes text,
  security_requirements text,
  induction_requirements text,
  current_contractor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

select public.apply_timestamps('public.sites');
create index sites_org_idx on public.sites (organisation_id) where deleted_at is null;
create index sites_client_idx on public.sites (client_id);

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  site_id uuid references public.sites (id) on delete set null,
  reference text not null,
  title text not null,
  quote_type text not null default 'recurring'
    check (quote_type in (
      'quick_walkthrough', 'tender', 'recurring', 'one_off', 'periodical',
      'window_cleaning', 'industrial', 'post_construction', 'emergency', 'blank'
    )),
  status public.quote_status not null default 'draft',
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  contract_term_months integer not null default 12 check (contract_term_months > 0),
  quote_validity_days integer not null default 30 check (quote_validity_days > 0),
  proposed_start_date date,
  submission_deadline timestamptz,
  opportunity_source text,
  -- Strategic context feeding the scenario recommendation. Organisation-owned
  -- judgements only; nothing here comes from a competitor's pricing.
  strategic_context jsonb not null default '{}'::jsonb,
  selected_scenario public.scenario_key,
  current_version integer not null default 1 check (current_version > 0),
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organisation_id, reference)
);

select public.apply_timestamps('public.quotes');
create index quotes_org_status_idx on public.quotes (organisation_id, status) where deleted_at is null;
create index quotes_site_idx on public.quotes (site_id);
create index quotes_deadline_idx on public.quotes (organisation_id, submission_deadline)
  where submission_deadline is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Files and media
-- ---------------------------------------------------------------------------

create table public.files (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete cascade,
  -- Storage keys are organisation-prefixed so a storage policy can enforce
  -- isolation on the path alone: `<organisation_id>/<quote_id>/<file_id>`.
  storage_path text not null unique,
  kind text not null check (kind in ('photo', 'video', 'audio', 'document', 'scan', 'export')),
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  original_filename text,
  checksum text,
  -- Excluded media is never sent to a model, whatever the analysis request says.
  exclude_from_ai boolean not null default false,
  redacted boolean not null default false,
  retention_expires_at timestamptz,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint files_path_is_org_prefixed check (storage_path like (organisation_id::text || '/%'))
);

select public.apply_timestamps('public.files');
create index files_quote_idx on public.files (quote_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Spaces and assets
-- ---------------------------------------------------------------------------

create table public.buildings (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.buildings');

create table public.floors (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  building_id uuid references public.buildings (id) on delete cascade,
  name text not null,
  level_number integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.floors');
create index floors_quote_idx on public.floors (quote_id);

create table public.spaces (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  floor_id uuid references public.floors (id) on delete set null,
  name text not null,
  room_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  floor_area_sqm numeric(12, 3) check (floor_area_sqm is null or floor_area_sqm >= 0),
  perimeter_m numeric(12, 3) check (perimeter_m is null or perimeter_m >= 0),
  ceiling_height_m numeric(8, 3) check (ceiling_height_m is null or ceiling_height_m >= 0),
  surface_types text[] not null default '{}',
  traffic_level text,
  soil_level text,
  furniture_density text,
  access_difficulty text,
  notes text,
  -- Provenance travels with the fact, so the review screen can show what the AI
  -- proposed and what a human actually confirmed.
  evidence_source public.evidence_source not null default 'manual_entry',
  verification_status public.verification_status not null default 'unverified',
  ai_confidence numeric(5, 4) check (ai_confidence is null or ai_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

select public.apply_timestamps('public.spaces');
create index spaces_quote_idx on public.spaces (quote_id) where deleted_at is null;

create table public.asset_types (
  id uuid primary key default public.new_id(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  code text not null,
  label text not null,
  default_unit text not null default 'each',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organisation_id, code)
);

select public.apply_timestamps('public.asset_types');

create table public.quote_assets (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  asset_type_code text not null,
  quantity integer not null check (quantity >= 0),
  evidence_source public.evidence_source not null default 'manual_entry',
  verification_status public.verification_status not null default 'unverified',
  ai_confidence numeric(5, 4) check (ai_confidence is null or ai_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.quote_assets');
create index quote_assets_quote_idx on public.quote_assets (quote_id);

-- ---------------------------------------------------------------------------
-- Observations
-- ---------------------------------------------------------------------------

-- An observed cleaner count is not an incumbent labour model.
-- `observation_window_complete` is NOT NULL with no default precisely so the
-- capture UI has to ask: "did you see the whole shift, or part of it?" A partial
-- window can support a price; it cannot define one.
create table public.observations (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  observation_type text not null,
  summary text not null,
  numeric_value numeric(18, 4),
  unit text,
  observed_from timestamptz,
  observed_to timestamptz,
  observation_window_complete boolean not null,
  client_confirmed boolean not null default false,
  evidence_source public.evidence_source not null default 'manual_entry',
  verification_status public.verification_status not null default 'unverified',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observation_window_is_ordered
    check (observed_to is null or observed_from is null or observed_to >= observed_from)
);

select public.apply_timestamps('public.observations');
create index observations_quote_idx on public.observations (quote_id);

-- ---------------------------------------------------------------------------
-- Measurements
-- ---------------------------------------------------------------------------

create table public.measurements (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  space_id uuid references public.spaces (id) on delete cascade,
  measurement_type text not null,
  -- Stored in SI: metres, square metres, or a unitless count. Display units are a
  -- presentation concern driven by organisation_settings.unit_system.
  value numeric(14, 4) not null check (value >= 0),
  unit text not null check (unit in ('m', 'm2', 'count')),
  source public.measurement_source not null,
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  device_model text,
  verified_by_user boolean not null default false,
  evidence_file_id uuid references public.files (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.measurements');
create index measurements_quote_idx on public.measurements (quote_id);
create index measurements_space_idx on public.measurements (space_id);

-- ---------------------------------------------------------------------------
-- Scope qualifiers
-- ---------------------------------------------------------------------------

create table public.quote_risks (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  code text not null,
  label text not null,
  probability numeric(5, 4) not null check (probability between 0 and 1),
  impact_amount numeric(18, 2) not null check (impact_amount >= 0),
  mitigation text,
  owner_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'mitigated', 'accepted', 'transferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.quote_risks');
create index quote_risks_quote_idx on public.quote_risks (quote_id);

create table public.quote_qualifiers (
  id uuid primary key default public.new_id(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  kind text not null check (kind in ('assumption', 'exclusion', 'clarification', 'compliance')),
  statement text not null,
  affects text,
  materiality text check (materiality is null or materiality in ('low', 'medium', 'high')),
  -- Compliance requirements are identified, documented and priced. They are never
  -- certified: an authorised human has to review each one.
  requires_human_review boolean not null default false,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  evidence_source public.evidence_source not null default 'manual_entry',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select public.apply_timestamps('public.quote_qualifiers');
create index quote_qualifiers_quote_idx on public.quote_qualifiers (quote_id, kind);
