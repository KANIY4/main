-- Local test shim.
--
-- Supabase provides `auth.users`, `auth.uid()`, `storage.buckets`,
-- `storage.objects` and the `anon` / `authenticated` roles. A bare Postgres does
-- not, so this file recreates just enough of that surface to run the real
-- migrations and exercise the real RLS policies against them.
--
-- This file is NEVER applied to a Supabase project. It exists so the security
-- tests can run in CI without provisioning a hosted database.

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- Supabase derives the current user from the request JWT. Tests set the same
-- setting directly, which is exactly what the policies read.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
alter table storage.objects force row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
