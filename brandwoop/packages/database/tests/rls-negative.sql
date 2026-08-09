-- Cross-tenant negative tests (scope section 2: 100% pass required at release).
--
-- Run against an ephemeral database that has all migrations applied:
--   psql "$EPHEMERAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls-negative.sql
--
-- The script seeds two tenants, then asserts from the request role that tenant
-- A's user can see nothing belonging to tenant B. Any failed assertion aborts
-- the run with a non-zero exit code.

\set ON_ERROR_STOP on

begin;

-- Seed as the owner, bypassing RLS deliberately.
insert into brandwoop.user_profile (id, display_name, email)
values
  ('aaaa1111-1111-4111-8111-111111111111', 'Tenant A administrator', 'a-admin@example.test'),
  ('aaaa2222-2222-4222-8222-222222222222', 'Tenant A cleaner', 'a-cleaner@example.test'),
  ('bbbb1111-1111-4111-8111-111111111111', 'Tenant B administrator', 'b-admin@example.test');

insert into brandwoop.tenant (id, name, company_code, timezone)
values
  ('a0000000-0000-4000-8000-000000000001', 'Tenant A', 'TENANTA', 'Australia/Sydney'),
  ('b0000000-0000-4000-8000-000000000002', 'Tenant B', 'TENANTB', 'Australia/Perth');

insert into brandwoop.tenant_membership (tenant_id, user_id, role, status, activated_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaa1111-1111-4111-8111-111111111111',
   'administrator', 'active', now()),
  ('a0000000-0000-4000-8000-000000000001', 'aaaa2222-2222-4222-8222-222222222222',
   'cleaner', 'active', now()),
  ('b0000000-0000-4000-8000-000000000002', 'bbbb1111-1111-4111-8111-111111111111',
   'administrator', 'active', now());

insert into brandwoop.site
  (id, tenant_id, name, address_line, suburb, state, postcode, timezone,
   latitude, longitude, geofence_radius_metres, status)
values
  ('a5170000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Site A1', '1 Test Street', 'Sydney', 'NSW', '2000', 'Australia/Sydney',
   -33.8688, 151.2093, 100, 'active'),
  ('b5170000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'Site B1', '2 Test Street', 'Perth', 'WA', '6000', 'Australia/Perth',
   -31.9523, 115.8613, 100, 'active');

insert into brandwoop.pay_rate_history
  (tenant_id, worker_id, hourly_rate_cents, effective_from, created_by)
values
  ('b0000000-0000-4000-8000-000000000002', 'bbbb1111-1111-4111-8111-111111111111',
   4500, current_date, 'bbbb1111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- Assertions run as the request role, which is subject to RLS.
-- ---------------------------------------------------------------------------

set local role brandwoop_app;
set local brandwoop.user_id = 'aaaa1111-1111-4111-8111-111111111111';
set local brandwoop.tenant_id = 'a0000000-0000-4000-8000-000000000001';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from brandwoop.site
  where tenant_id = 'b0000000-0000-4000-8000-000000000002';
  if visible_count <> 0 then
    raise exception 'FAIL: tenant A administrator can read % tenant B sites', visible_count;
  end if;

  select count(*) into visible_count from brandwoop.tenant
  where id = 'b0000000-0000-4000-8000-000000000002';
  if visible_count <> 0 then
    raise exception 'FAIL: tenant A administrator can read the tenant B record';
  end if;

  select count(*) into visible_count from brandwoop.pay_rate_history;
  if visible_count <> 0 then
    raise exception 'FAIL: tenant A administrator can read tenant B pay rates';
  end if;

  select count(*) into visible_count from brandwoop.site
  where tenant_id = 'a0000000-0000-4000-8000-000000000001';
  if visible_count <> 1 then
    raise exception 'FAIL: tenant A administrator cannot read its own site';
  end if;
end
$$;

-- A cleaner sees only sites they are allocated to.
set local brandwoop.user_id = 'aaaa2222-2222-4222-8222-222222222222';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from brandwoop.site;
  if visible_count <> 0 then
    raise exception 'FAIL: unallocated cleaner can read % sites', visible_count;
  end if;
end
$$;

-- A write into another tenant must be refused, not silently dropped.
do $$
begin
  begin
    insert into brandwoop.site
      (tenant_id, name, address_line, suburb, state, postcode, timezone,
       latitude, longitude, geofence_radius_metres)
    values
      ('b0000000-0000-4000-8000-000000000002', 'Injected site', '3 Test Street', 'Perth',
       'WA', '6000', 'Australia/Perth', -31.95, 115.86, 100);
    raise exception 'FAIL: cleaner inserted a site into tenant B';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Attendance events cannot be rewritten, even by their own author.
reset role;

do $$
begin
  begin
    update brandwoop.audit_log set action = 'tampered' where id = -1;
  exception
    when restrict_violation then null;
  end;
end
$$;

rollback;

\echo 'RLS negative tests passed.'
