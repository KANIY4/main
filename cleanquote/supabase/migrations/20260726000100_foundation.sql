-- Foundation: extensions, shared triggers and shared enums.
--
-- Conventions used by every later migration:
--   * every tenant-owned table carries `organisation_id uuid not null`
--   * primary keys are UUID v7 where available so they sort by creation time
--   * money is `numeric`, never float; rates carry 4 dp, amounts carry 2 dp
--   * `created_at` / `updated_at` are set by the database, not the application
--   * user-facing records soft delete; system records hard delete

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identifiers
-- ---------------------------------------------------------------------------

-- Postgres 18 ships uuidv7(); on older servers fall back to a random UUID rather
-- than failing the migration. Sortability is a nice-to-have, not a correctness
-- requirement.
create or replace function public.new_id()
returns uuid
language plpgsql
as $$
begin
  begin
    return uuidv7();
  exception
    when undefined_function then
      return gen_random_uuid();
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Applies the standard timestamp columns and trigger to a table.
create or replace function public.apply_timestamps(target regclass)
returns void
language plpgsql
as $$
declare
  trigger_name text := 'set_updated_at_' || replace(target::text, '.', '_');
begin
  execute format(
    'create trigger %I before update on %s for each row execute function public.set_updated_at()',
    trigger_name, target
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

create type public.engagement_type as enum ('employee', 'subcontractor', 'agency');

create type public.evidence_source as enum (
  'user_confirmed',
  'ai_photo_detection',
  'ai_document_extraction',
  'ai_inference',
  'ar_measurement',
  'voice_dictation',
  'manual_entry',
  'imported_from_quote',
  'benchmark_estimate'
);

create type public.verification_status as enum (
  'unverified',
  'user_confirmed',
  'user_corrected',
  'marked_assumption',
  'deferred_to_client'
);

create type public.measurement_source as enum (
  'ios_roomplan',
  'ios_arkit',
  'android_arcore',
  'manual_camera',
  'photo_scale',
  'manual_entry',
  'document',
  'imported'
);

create type public.schedule_pattern as enum (
  'one_off',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'biannual',
  'annual',
  'on_demand',
  'custom_per_year'
);

create type public.scenario_key as enum ('aggressive', 'balanced', 'premium');

create type public.quote_status as enum (
  'draft',
  'capturing',
  'in_review',
  'awaiting_approval',
  'approved',
  'rejected',
  'sent',
  'accepted',
  'declined',
  'expired',
  'withdrawn'
);

create type public.membership_status as enum ('active', 'invited', 'suspended');
