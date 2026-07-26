-- Row Level Security.
--
-- Design rules:
--   1. Every tenant-owned table has RLS enabled AND forced, so even the table
--      owner is subject to policy. Without FORCE, a definer function or a
--      migration-owner connection silently bypasses isolation.
--   2. Reads require active membership. Writes additionally require a specific
--      permission — role names never appear in a policy.
--   3. Cost and margin are gated separately from price, because "can see the
--      quote" and "can see what it costs us" are different questions.
--   4. Public proposal access is not an RLS policy. Anonymous callers reach a
--      narrow SECURITY DEFINER function instead, so a bearer token can never be
--      widened into table access.

-- ---------------------------------------------------------------------------
-- Standard tenant tables
-- ---------------------------------------------------------------------------

do $rls$
declare
  spec record;
begin
  for spec in
    select *
    from (values
      -- table name, permission required to write
      ('clients',                     'quote.edit'),
      ('client_contacts',             'quote.edit'),
      ('sites',                       'quote.edit'),
      ('quotes',                      'quote.edit'),
      ('files',                       'quote.edit'),
      ('buildings',                   'quote.edit'),
      ('floors',                      'quote.edit'),
      ('spaces',                      'quote.edit'),
      ('quote_assets',                'quote.edit'),
      ('observations',                'quote.edit'),
      ('measurements',                'quote.edit'),
      ('quote_risks',                 'quote.edit'),
      ('quote_qualifiers',            'quote.edit'),
      ('quote_versions',              'quote.edit'),
      ('quote_labour_lines',          'quote.edit'),
      ('quote_cost_lines',            'quote.edit'),
      ('asset_types',                 'rate_card.manage'),
      ('rate_cards',                  'rate_card.manage'),
      ('labour_profiles',             'rate_card.manage'),
      ('on_cost_rules',               'rate_card.manage'),
      ('overhead_rules',              'rate_card.manage'),
      ('cost_catalogue_items',        'rate_card.manage'),
      ('margin_rules',                'rate_card.manage'),
      ('scenario_configs',            'rate_card.manage'),
      ('proposal_templates',          'organisation.manage'),
      ('proposals',                   'quote.send'),
      ('quote_outcomes',              'quote.edit'),
      ('actual_job_results',          'quote.edit'),
      ('ai_threads',                  'quote.edit'),
      ('ai_messages',                 'quote.edit'),
      ('organisation_entitlements',   'billing.manage'),
      ('subscriptions',               'billing.manage')
    ) as t(table_name, write_permission)
  loop
    execute format('alter table public.%I enable row level security', spec.table_name);
    execute format('alter table public.%I force row level security', spec.table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_org_member(organisation_id))',
      spec.table_name || '_member_select', spec.table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(organisation_id, %L))',
      spec.table_name || '_permitted_insert', spec.table_name, spec.write_permission
    );

    -- USING and WITH CHECK both required: without WITH CHECK a permitted user
    -- could move a row into another organisation by updating organisation_id.
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(organisation_id, %L)) with check (public.has_permission(organisation_id, %L))',
      spec.table_name || '_permitted_update', spec.table_name,
      spec.write_permission, spec.write_permission
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(organisation_id, %L))',
      spec.table_name || '_permitted_delete', spec.table_name, spec.write_permission
    );
  end loop;
end
$rls$;

-- ---------------------------------------------------------------------------
-- Organisations, membership and settings
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.organisations force row level security;

create policy organisations_member_select on public.organisations
  for select to authenticated
  using (id in (select public.accessible_organisation_ids()));

create policy organisations_managed_update on public.organisations
  for update to authenticated
  using (public.has_permission(id, 'organisation.manage'))
  with check (public.has_permission(id, 'organisation.manage'));

-- Organisation creation runs through a SECURITY DEFINER onboarding function so
-- that creating a tenant and its first membership is a single atomic act. There
-- is deliberately no INSERT policy here.

alter table public.organisation_settings enable row level security;
alter table public.organisation_settings force row level security;

create policy organisation_settings_member_select on public.organisation_settings
  for select to authenticated using (public.is_org_member(organisation_id));

create policy organisation_settings_managed_write on public.organisation_settings
  for update to authenticated
  using (public.has_permission(organisation_id, 'organisation.manage'))
  with check (public.has_permission(organisation_id, 'organisation.manage'));

alter table public.organisation_members enable row level security;
alter table public.organisation_members force row level security;

-- Members can see their colleagues. `is_org_member` is SECURITY DEFINER, which
-- is what stops this policy recursing into the table it protects.
create policy organisation_members_select on public.organisation_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organisation_id));

create policy organisation_members_managed_insert on public.organisation_members
  for insert to authenticated
  with check (public.has_permission(organisation_id, 'user.manage'));

create policy organisation_members_managed_update on public.organisation_members
  for update to authenticated
  using (public.has_permission(organisation_id, 'user.manage'))
  with check (public.has_permission(organisation_id, 'user.manage'));

create policy organisation_members_managed_delete on public.organisation_members
  for delete to authenticated
  using (public.has_permission(organisation_id, 'user.manage'));

alter table public.roles enable row level security;
alter table public.roles force row level security;

create policy roles_select on public.roles
  for select to authenticated
  using (organisation_id is null or public.is_org_member(organisation_id));

create policy roles_managed_write on public.roles
  for all to authenticated
  using (organisation_id is not null and public.has_permission(organisation_id, 'user.manage'))
  with check (organisation_id is not null and public.has_permission(organisation_id, 'user.manage'));

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (r.organisation_id is null or public.is_org_member(r.organisation_id))
    )
  );

create policy role_permissions_managed_write on public.role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organisation_id is not null
        and public.has_permission(r.organisation_id, 'user.manage')
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organisation_id is not null
        and public.has_permission(r.organisation_id, 'user.manage')
    )
  );

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

create policy user_profiles_self_select on public.user_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organisation_members mine
      join public.organisation_members theirs
        on theirs.organisation_id = mine.organisation_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and theirs.user_id = public.user_profiles.id
        and theirs.status = 'active'
    )
  );

create policy user_profiles_self_write on public.user_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy user_profiles_self_insert on public.user_profiles
  for insert to authenticated with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cost-sensitive tables
-- ---------------------------------------------------------------------------

-- A snapshot contains the entire cost stack. Seeing a quote is not the same as
-- seeing what it costs to deliver, so this one is gated on `quote.view_cost`
-- rather than plain membership.
alter table public.quote_calculation_snapshots enable row level security;
alter table public.quote_calculation_snapshots force row level security;

create policy calculation_snapshots_cost_select on public.quote_calculation_snapshots
  for select to authenticated
  using (public.has_permission(organisation_id, 'quote.view_cost'));

create policy calculation_snapshots_insert on public.quote_calculation_snapshots
  for insert to authenticated
  with check (public.has_permission(organisation_id, 'quote.edit'));

-- Anyone in the organisation may read the *price* of a quote without being able
-- to read its cost. The view filters on its own, because a plain view runs with
-- the owner's rights and would otherwise bypass the base table's RLS entirely.
create view public.quote_prices with (security_barrier = true) as
select
  s.quote_version_id,
  s.organisation_id,
  s.created_at,
  s.recommended_scenario,
  scenario.value ->> 'key'                          as scenario_key,
  scenario.value -> 'price' ->> 'annualExTax'       as annual_ex_tax,
  scenario.value -> 'price' ->> 'annualIncTax'      as annual_inc_tax,
  scenario.value -> 'price' ->> 'perOccurrenceExTax' as per_occurrence_ex_tax,
  scenario.value -> 'price' ->> 'perMonthExTax'     as per_month_ex_tax,
  scenario.value -> 'price' ->> 'oneOffExTax'       as one_off_ex_tax,
  scenario.value -> 'price' ->> 'contractTotalExTax' as contract_total_ex_tax
from public.quote_calculation_snapshots s
cross join lateral jsonb_array_elements(s.engine_output -> 'scenarios') as scenario
where public.has_permission(s.organisation_id, 'quote.view_selling_price');

grant select on public.quote_prices to authenticated;

alter table public.guardrail_overrides enable row level security;
alter table public.guardrail_overrides force row level security;

create policy guardrail_overrides_select on public.guardrail_overrides
  for select to authenticated using (public.is_org_member(organisation_id));

-- Only a user who holds the override permission can record one, and the row must
-- name them as the requester — a permitted user cannot log an override under a
-- colleague's identity.
create policy guardrail_overrides_insert on public.guardrail_overrides
  for insert to authenticated
  with check (
    public.has_permission(organisation_id, 'quote.override_margin')
    and requested_by_user_id = auth.uid()
  );

alter table public.approvals enable row level security;
alter table public.approvals force row level security;

create policy approvals_select on public.approvals
  for select to authenticated using (public.is_org_member(organisation_id));

create policy approvals_request on public.approvals
  for insert to authenticated
  with check (public.has_permission(organisation_id, 'quote.edit'));

create policy approvals_decide on public.approvals
  for update to authenticated
  using (public.has_permission(organisation_id, 'quote.approve'))
  with check (public.has_permission(organisation_id, 'quote.approve'));

alter table public.approval_comments enable row level security;
alter table public.approval_comments force row level security;

create policy approval_comments_select on public.approval_comments
  for select to authenticated using (public.is_org_member(organisation_id));

create policy approval_comments_insert on public.approval_comments
  for insert to authenticated
  with check (public.is_org_member(organisation_id) and author_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Benchmarks, usage, AI runs, notifications, audit
-- ---------------------------------------------------------------------------

alter table public.productivity_benchmarks enable row level security;
alter table public.productivity_benchmarks force row level security;

create policy benchmarks_select on public.productivity_benchmarks
  for select to authenticated
  using (
    (organisation_id is null and approved_at is not null)
    or (organisation_id is not null and public.is_org_member(organisation_id))
  );

create policy benchmarks_manage on public.productivity_benchmarks
  for all to authenticated
  using (organisation_id is not null and public.has_permission(organisation_id, 'benchmark.manage'))
  with check (organisation_id is not null and public.has_permission(organisation_id, 'benchmark.manage'));

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

create policy usage_events_select on public.usage_events
  for select to authenticated using (public.is_org_member(organisation_id));

-- Usage is metered server-side. Clients cannot write their own counters, which
-- is the whole point of enforcing entitlements on the server.

alter table public.ai_runs enable row level security;
alter table public.ai_runs force row level security;

create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (public.has_permission(organisation_id, 'ai.view_history'));

alter table public.proposal_events enable row level security;
alter table public.proposal_events force row level security;

create policy proposal_events_select on public.proposal_events
  for select to authenticated using (public.is_org_member(organisation_id));

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_own_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_own_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Read-only for the tenant, append-only for everyone: there is intentionally no
-- INSERT, UPDATE or DELETE policy. Audit rows are written by definer-rights
-- server functions, and the append-only trigger backs that up.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (organisation_id is not null and public.has_permission(organisation_id, 'organisation.manage'));

-- ---------------------------------------------------------------------------
-- Reference data readable by every signed-in user
-- ---------------------------------------------------------------------------

alter table public.permissions enable row level security;
create policy permissions_read on public.permissions for select to authenticated using (true);

alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated using (is_public);

alter table public.plan_entitlements enable row level security;
create policy plan_entitlements_read on public.plan_entitlements
  for select to authenticated using (true);

alter table public.plan_limits enable row level security;
create policy plan_limits_read on public.plan_limits for select to authenticated using (true);

alter table public.ai_prompt_versions enable row level security;
-- Prompt templates are platform IP and are never exposed to tenants; server
-- functions read them with definer rights. No policy = no access.

-- ---------------------------------------------------------------------------
-- Public proposal access
-- ---------------------------------------------------------------------------

-- The anonymous role gets no table grants at all. A client with a link calls
-- this function, which validates the token, enforces expiry and revocation, and
-- returns only the fields a client is allowed to see. Internal scenario names,
-- cost, margin and labour hours are never in the projection.
create or replace function public.get_public_proposal(token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
begin
  if token is null or length(token) < 32 then
    return null;
  end if;

  select jsonb_build_object(
           'proposalId', p.id,
           'content', p.rendered_content,
           'sentAt', p.sent_at,
           'expiresAt', p.expires_at,
           'acceptedAt', p.accepted_at,
           'declinedAt', p.declined_at,
           'organisationName', coalesce(os.brand_name, o.name)
         )
    into result
  from public.proposals p
  join public.organisations o on o.id = p.organisation_id
  left join public.organisation_settings os on os.organisation_id = p.organisation_id
  where p.public_token = token
    and p.revoked_at is null
    and p.public_token_expires_at > now()
    and (p.expires_at is null or p.expires_at > now());

  return result;
end;
$$;

revoke execute on function public.get_public_proposal(text) from public;
grant execute on function public.get_public_proposal(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------

-- Supabase configures default privileges for `anon` and `authenticated`; being
-- explicit keeps the schema portable and makes the intent readable.
--
-- Grants are coarse on purpose: RLS is the gate, and a table with no policy for
-- an operation denies it regardless of the grant. `audit_logs` is the clearest
-- case — the INSERT privilege exists, but with no INSERT policy it is refused.
--
-- NOTE: this is a snapshot of the tables that exist right now. Any later
-- migration adding a table must grant on it explicitly.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Prompt templates are platform intellectual property and are read only by
-- definer-rights server functions. No tenant role gets access.
revoke all on public.ai_prompt_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Media lives at `<organisation_id>/<quote_id>/<file_id>`, so isolation can be
-- decided from the path's first segment without a join.
insert into storage.buckets (id, name, public)
values ('quote-media', 'quote-media', false)
on conflict (id) do nothing;

create policy quote_media_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy quote_media_member_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-media'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'quote.edit')
  );

create policy quote_media_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quote-media'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'quote.delete')
  );
