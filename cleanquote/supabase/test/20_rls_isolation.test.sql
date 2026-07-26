-- Security tests: cross-tenant isolation, permission granularity, immutability
-- and public-link safety.
--
-- Every check runs as the `authenticated` role with a real user id in the JWT
-- claim, which is exactly how a request reaches the database in production. A
-- failing assertion aborts the script.

create schema if not exists cq_test;

create or replace function cq_test.assert(condition boolean, name text)
returns void
language plpgsql
as $$
begin
  if condition then
    raise notice 'PASS  %', name;
  else
    raise exception 'FAIL  %', name;
  end if;
end;
$$;

-- Asserts that a statement is refused. Both an RLS refusal and a trigger
-- refusal count; being allowed through is the only failure.
create or replace function cq_test.assert_blocked(statement text, name text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      raise notice 'PASS  % [%]', name, sqlstate;
      return;
  end;
  raise exception 'FAIL  % (the statement was allowed)', name;
end;
$$;

-- `anon` needs the harness too: the public-proposal checks run unauthenticated.
grant usage on schema cq_test to authenticated, anon;
grant execute on all functions in schema cq_test to authenticated, anon;

\set ada    '11111111-1111-4111-8111-111111111111'
\set grace  '22222222-2222-4222-8222-222222222222'
\set linus  '33333333-3333-4333-8333-333333333333'
\set org_a  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set org_b  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

-- ===========================================================================
-- Tenant read isolation
-- ===========================================================================

set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert(
  (select count(*) from public.clients) = 1,
  'an estimator sees only her own organisation''s clients'
);

select cq_test.assert(
  (select count(*) from public.clients where organisation_id = :'org_b') = 0,
  'another organisation''s clients are invisible, not merely unlisted'
);

select cq_test.assert(
  (select count(*) from public.quotes where organisation_id = :'org_b') = 0,
  'another organisation''s quotes are invisible'
);

select cq_test.assert(
  (select count(*) from public.sites) = 0,
  'an empty result is returned for a table with no rows in the caller''s tenant'
);

select cq_test.assert(
  (select count(*) from public.rate_cards where organisation_id = :'org_b') = 0,
  'another organisation''s rate card is invisible'
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'linus', false);

select cq_test.assert(
  (select count(*) from public.quotes) = 1
    and (select organisation_id from public.quotes limit 1) = :'org_b'::uuid,
  'isolation holds in the other direction too'
);

-- ===========================================================================
-- Tenant write isolation
-- ===========================================================================

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert_blocked(
  format(
    'insert into public.clients (organisation_id, name) values (%L, ''Injected client'')',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  'a user cannot insert a row into another organisation'
);

select cq_test.assert_blocked(
  format(
    'update public.clients set organisation_id = %L where id = %L',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'c0000000-0000-4000-8000-00000000000a'
  ),
  'a user cannot move their own row into another organisation'
);

-- A delete against an invisible row is not an error; it simply matches nothing.
-- Proving the row survives is the meaningful assertion.
delete from public.clients where id = 'c0000000-0000-4000-8000-00000000000b';

reset role;
select cq_test.assert(
  (select count(*) from public.clients where id = 'c0000000-0000-4000-8000-00000000000b') = 1,
  'a delete aimed at another organisation''s row affects nothing'
);

-- ===========================================================================
-- Permission granularity: price without cost
-- ===========================================================================

set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert(
  (select count(*) from public.quote_calculation_snapshots) = 0,
  'an estimator without quote.view_cost cannot read the cost stack'
);

select cq_test.assert(
  (select count(*) from public.quote_prices) = 1,
  'the same estimator can still read the selling price'
);

select cq_test.assert(
  (select annual_ex_tax from public.quote_prices) = '20800.00',
  'the price view returns the scenario price from the snapshot'
);

select cq_test.assert(
  (select count(*) from public.quote_prices where organisation_id = :'org_b') = 0,
  'the price view does not leak another organisation''s prices'
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'grace', false);

select cq_test.assert(
  (select count(*) from public.quote_calculation_snapshots) = 1,
  'a director with quote.view_cost can read the cost stack'
);

select cq_test.assert(
  (select engine_output -> 'scenarios' -> 0 ->> 'totalRecurringCost'
   from public.quote_calculation_snapshots) = '15600.00',
  'the cost stack is intact for a permitted reader'
);

-- ===========================================================================
-- Guardrail overrides
-- ===========================================================================

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert_blocked(
  format(
    'insert into public.guardrail_overrides (organisation_id, quote_version_id, guardrail_code, reason, requested_by_user_id)
     values (%L, %L, ''min_gross_margin'', ''Strategic entry price for the northern precinct.'', %L)',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a user without quote.override_margin cannot record a margin override'
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'grace', false);

select cq_test.assert_blocked(
  format(
    'insert into public.guardrail_overrides (organisation_id, quote_version_id, guardrail_code, reason, requested_by_user_id)
     values (%L, %L, ''min_gross_margin'', ''Strategic entry price for the northern precinct.'', %L)',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a',
    '11111111-1111-4111-8111-111111111111'
  ),
  'a permitted user cannot record an override under a colleague''s identity'
);

select cq_test.assert_blocked(
  format(
    'insert into public.guardrail_overrides (organisation_id, quote_version_id, guardrail_code, reason, requested_by_user_id)
     values (%L, %L, ''min_gross_margin'', ''too short'', %L)',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a',
    '22222222-2222-4222-8222-222222222222'
  ),
  'an override without a substantive reason is rejected by the database'
);

insert into public.guardrail_overrides
  (organisation_id, quote_version_id, guardrail_code, reason, requested_by_user_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a',
   'min_gross_margin', 'Strategic entry into the northern precinct, approved by the director.',
   '22222222-2222-4222-8222-222222222222');

select cq_test.assert(
  (select count(*) from public.guardrail_overrides) = 1,
  'a permitted user recording their own override succeeds'
);

-- ===========================================================================
-- Immutability
-- ===========================================================================

-- Immutability is enforced at two independent layers, and each is tested on its
-- own terms.
--
-- Layer 1 is RLS. A table with no UPDATE policy does not raise — the statement
-- simply matches no rows. "No error" is therefore not evidence of anything; the
-- assertion has to be that the data did not move.
update public.quote_calculation_snapshots set input_hash = 'tampered';
delete from public.quote_calculation_snapshots;

select cq_test.assert(
  (select count(*) from public.quote_calculation_snapshots where input_hash = 'aaaa000000000001') = 1,
  'a tenant user cannot edit or delete a calculation snapshot through RLS'
);

-- Layer 2 is the trigger, which is what protects the record from a service-role
-- or definer-rights path that legitimately bypasses RLS.
reset role;

select cq_test.assert_blocked(
  'update public.quote_calculation_snapshots set input_hash = ''tampered''',
  'a calculation snapshot cannot be edited even by a role that bypasses RLS'
);

select cq_test.assert_blocked(
  'delete from public.quote_calculation_snapshots',
  'a calculation snapshot cannot be deleted even by a role that bypasses RLS'
);

insert into public.audit_logs (organisation_id, action, entity_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'quote.sent', 'quote');

select cq_test.assert_blocked(
  'update public.audit_logs set action = ''rewritten''',
  'audit records cannot be rewritten even by a role that bypasses RLS'
);

select cq_test.assert_blocked(
  'delete from public.audit_logs',
  'audit records cannot be deleted even by a role that bypasses RLS'
);

set role authenticated;
select set_config('request.jwt.claim.sub', :'grace', false);

update public.audit_logs set action = 'rewritten';

select cq_test.assert(
  (select count(*) from public.audit_logs where action = 'quote.sent') = 1,
  'a tenant user cannot rewrite an audit record through RLS'
);

select cq_test.assert_blocked(
  format(
    'insert into public.audit_logs (organisation_id, action, entity_type) values (%L, ''forged'', ''quote'')',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'a tenant user cannot write their own audit records'
);

-- A sealed version is the record of what was actually sent.
reset role;
update public.quote_versions set sealed_at = now()
where id = 'f0000000-0000-4000-8000-00000000000a';

set role authenticated;
select set_config('request.jwt.claim.sub', :'grace', false);

select cq_test.assert_blocked(
  format(
    'insert into public.quote_labour_lines
       (organisation_id, quote_version_id, line_key, label, category, labour_profile_code, kind, schedule, cleaners_per_shift, hours_per_shift)
     values (%L, %L, ''sneaky'', ''Added after sending'', ''routine'', ''cleaner'', ''staffing'', ''{}''::jsonb, 1, 2)',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a'
  ),
  'a sent quote version cannot gain new priced lines'
);

-- ===========================================================================
-- Storage isolation
-- ===========================================================================

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert(
  (select count(*) from storage.objects) = 1,
  'a user sees only media stored under their own organisation prefix'
);

select cq_test.assert_blocked(
  format(
    'insert into storage.objects (bucket_id, name) values (''quote-media'', %L)',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/forged/photo.jpg'
  ),
  'a user cannot write media under another organisation''s prefix'
);

-- ===========================================================================
-- Public proposal links
-- ===========================================================================

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select cq_test.assert(
  public.get_public_proposal('live-token-000000000000000000000000000000') is not null,
  'a live proposal link resolves for an anonymous visitor'
);

select cq_test.assert(
  public.get_public_proposal('live-token-000000000000000000000000000000') -> 'content' ->> 'title'
    = 'Riverside nightly office clean',
  'the public projection returns the client-facing content'
);

select cq_test.assert(
  not (public.get_public_proposal('live-token-000000000000000000000000000000') ? 'engineOutput'),
  'the public projection carries no internal calculation data'
);

select cq_test.assert(
  public.get_public_proposal('expired-token-0000000000000000000000000000') is null,
  'an expired proposal link stops resolving'
);

select cq_test.assert(
  public.get_public_proposal('revoked-token-0000000000000000000000000000') is null,
  'a revoked proposal link stops resolving'
);

select cq_test.assert(
  public.get_public_proposal('guessed-token-9999999999999999999999999999') is null,
  'an unknown token resolves to nothing'
);

select cq_test.assert(
  public.get_public_proposal('short') is null,
  'a token too short to be unguessable is rejected outright'
);

select cq_test.assert_blocked(
  'select count(*) from public.proposals',
  'an anonymous visitor has no table access at all'
);

select cq_test.assert_blocked(
  'select count(*) from public.quotes',
  'an anonymous visitor cannot read quotes'
);

-- ===========================================================================
-- Membership lifecycle
-- ===========================================================================

reset role;
update public.organisation_members set status = 'suspended'
where user_id = '11111111-1111-4111-8111-111111111111';

set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert(
  (select count(*) from public.clients) = 0,
  'a suspended member immediately loses access to tenant data'
);

reset role;
update public.organisation_members set status = 'active'
where user_id = '11111111-1111-4111-8111-111111111111';

set role authenticated;
select set_config('request.jwt.claim.sub', :'ada', false);

select cq_test.assert(
  (select count(*) from public.clients) = 1,
  'reactivating a member restores access'
);

-- A user with no membership at all sees nothing anywhere.
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);

select cq_test.assert(
  (select count(*) from public.clients) = 0
    and (select count(*) from public.quotes) = 0
    and (select count(*) from public.organisations) = 0,
  'a signed-in user with no membership sees no tenant data'
);

reset role;

\echo ''
\echo 'All row level security assertions passed.'
