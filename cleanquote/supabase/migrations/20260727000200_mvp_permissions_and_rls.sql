-- Permission grants for the system roles, and row level security for every
-- table added by the MVP workflow migration.

-- ---------------------------------------------------------------------------
-- System role permission sets
-- ---------------------------------------------------------------------------
--
-- These mirror DEFAULT_ROLE_PERMISSIONS in @cleanquote/types. The database is
-- the enforcement point; the TypeScript constant exists so the invitation UI can
-- describe a role before the membership row is written.

-- Owner and Administrator hold everything.
insert into public.role_permissions (role_id, permission_code)
select '00000000-0000-4000-8000-000000000001'::uuid, code from public.permissions;

insert into public.role_permissions (role_id, permission_code)
select '00000000-0000-4000-8000-000000000002'::uuid, code from public.permissions
where code <> 'billing.manage';

-- Estimator: builds quotes, sees cost, cannot approve or override a floor.
insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000003', 'quote.create'),
  ('00000000-0000-4000-8000-000000000003', 'quote.edit'),
  ('00000000-0000-4000-8000-000000000003', 'quote.view_cost'),
  ('00000000-0000-4000-8000-000000000003', 'quote.view_selling_price'),
  ('00000000-0000-4000-8000-000000000003', 'ai.view_history');

-- Reviewer: decides, does not build.
insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000004', 'quote.view_cost'),
  ('00000000-0000-4000-8000-000000000004', 'quote.view_selling_price'),
  ('00000000-0000-4000-8000-000000000004', 'quote.view_profit'),
  ('00000000-0000-4000-8000-000000000004', 'quote.approve'),
  ('00000000-0000-4000-8000-000000000004', 'quote.override_margin');

-- Operations: delivery view, approves on deliverability grounds.
insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000005', 'quote.view_cost'),
  ('00000000-0000-4000-8000-000000000005', 'quote.view_selling_price'),
  ('00000000-0000-4000-8000-000000000005', 'quote.approve'),
  ('00000000-0000-4000-8000-000000000005', 'analytics.view');

-- Finance: money, no quote editing.
insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000006', 'quote.view_cost'),
  ('00000000-0000-4000-8000-000000000006', 'quote.view_selling_price'),
  ('00000000-0000-4000-8000-000000000006', 'quote.view_profit'),
  ('00000000-0000-4000-8000-000000000006', 'analytics.view'),
  ('00000000-0000-4000-8000-000000000006', 'billing.manage'),
  ('00000000-0000-4000-8000-000000000006', 'data.export');

-- Read Only: the selling price and nothing else.
insert into public.role_permissions (role_id, permission_code) values
  ('00000000-0000-4000-8000-000000000007', 'quote.view_selling_price');

-- ---------------------------------------------------------------------------
-- Row level security for the new tenant tables
-- ---------------------------------------------------------------------------

do $rls$
declare
  spec record;
begin
  for spec in
    select *
    from (values
      ('organisation_setting_provenance', 'organisation.manage'),
      ('opportunities',                   'quote.edit'),
      ('opportunity_stage_events',        'quote.edit'),
      ('task_templates',                  'rate_card.manage'),
      ('quote_tasks',                     'quote.edit'),
      ('ai_suggestions',                  'quote.edit'),
      ('ai_questions',                    'quote.edit'),
      ('proposal_comments',               'quote.send')
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
    -- WITH CHECK as well as USING: without it a permitted user could move a row
    -- into another organisation by updating organisation_id.
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

-- Invitations: managing members is its own permission, and an invitation
-- carries a token that must not be readable by every colleague.
alter table public.organisation_invitations enable row level security;
alter table public.organisation_invitations force row level security;

create policy invitations_managed_select on public.organisation_invitations
  for select to authenticated
  using (public.has_permission(organisation_id, 'user.manage'));

create policy invitations_managed_insert on public.organisation_invitations
  for insert to authenticated
  with check (
    public.has_permission(organisation_id, 'user.manage')
    and invited_by_user_id = auth.uid()
  );

create policy invitations_managed_update on public.organisation_invitations
  for update to authenticated
  using (public.has_permission(organisation_id, 'user.manage'))
  with check (public.has_permission(organisation_id, 'user.manage'));

-- Template items belong to their template's tenant.
alter table public.task_template_items enable row level security;
alter table public.task_template_items force row level security;

create policy task_template_items_select on public.task_template_items
  for select to authenticated
  using (
    exists (
      select 1 from public.task_templates t
      where t.id = template_id
        and (t.organisation_id is null or public.is_org_member(t.organisation_id))
    )
  );

create policy task_template_items_write on public.task_template_items
  for all to authenticated
  using (
    exists (
      select 1 from public.task_templates t
      where t.id = template_id
        and t.organisation_id is not null
        and public.has_permission(t.organisation_id, 'rate_card.manage')
    )
  )
  with check (
    exists (
      select 1 from public.task_templates t
      where t.id = template_id
        and t.organisation_id is not null
        and public.has_permission(t.organisation_id, 'rate_card.manage')
    )
  );

-- Platform-published task templates are readable by every signed-in user.
create policy task_templates_system_select on public.task_templates
  for select to authenticated using (organisation_id is null);

-- Credentials, sessions and email bodies are never reachable by a tenant role.
-- No policy is deliberate: these are handled only by definer-rights server code
-- running under the application's own database role.
alter table public.local_auth_credentials enable row level security;
alter table public.local_auth_credentials force row level security;

alter table public.user_sessions enable row level security;
alter table public.user_sessions force row level security;

alter table public.email_deliveries enable row level security;
alter table public.email_deliveries force row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.organisation_setting_provenance,
  public.opportunities,
  public.opportunity_stage_events,
  public.task_templates,
  public.task_template_items,
  public.quote_tasks,
  public.ai_suggestions,
  public.ai_questions,
  public.proposal_comments,
  public.organisation_invitations
to authenticated;

-- No grant at all for the three tables above that hold credentials, session
-- tokens and rendered email bodies.
revoke all on public.local_auth_credentials, public.user_sessions, public.email_deliveries
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Approval invalidation
-- ---------------------------------------------------------------------------

-- An approval is granted against one calculation. When a new snapshot lands on
-- an approved version with a different input hash, the approval no longer
-- describes what would be sent, and saying so is the whole point of recording
-- the hash.
create or replace function public.invalidate_approval_on_recalculation()
returns trigger
language plpgsql
as $$
begin
  update public.approvals a
  set status = 'changes_requested',
      invalidated_at = now(),
      invalidation_reason = format(
        'The quote was recalculated after approval. Approved calculation %s, current calculation %s.',
        a.calculation_input_hash, new.input_hash
      )
  where a.quote_version_id = new.quote_version_id
    and a.status = 'approved'
    and a.invalidated_at is null
    and a.calculation_input_hash is not null
    and a.calculation_input_hash <> new.input_hash;

  return new;
end;
$$;

create trigger approvals_invalidate_on_recalculation
  after insert on public.quote_calculation_snapshots
  for each row execute function public.invalidate_approval_on_recalculation();

-- ---------------------------------------------------------------------------
-- Starter task templates
-- ---------------------------------------------------------------------------
--
-- Illustrative starting points, editable and copyable per organisation. These
-- are not benchmarks; the durations are conservative round numbers chosen so a
-- new tenant has something coherent to price against on day one.

do $seed$
declare
  template_id uuid;
  spec record;
  item record;
begin
  for spec in
    select *
    from (values
      ('general_office',    'General office',          'office'),
      ('amenities',         'Toilet and amenities',    'amenities'),
      ('kitchen',           'Kitchen',                 'kitchen'),
      ('meeting_room',      'Meeting room',            'meeting_room'),
      ('retail',            'Retail floor',            'retail'),
      ('childcare',         'Childcare room',          'childcare'),
      ('healthcare',        'Healthcare room',         'healthcare'),
      ('industrial',        'Industrial area',         'industrial'),
      ('warehouse',         'Warehouse',               'warehouse'),
      ('window_cleaning',   'Window cleaning',         'glazing'),
      ('periodical_floor',  'Periodical floor care',   'floor')
    ) as t(code, label, space_type)
  loop
    insert into public.task_templates (organisation_id, code, label, space_type, is_system)
    values (null, spec.code, spec.label, spec.space_type, true)
    returning id into template_id;

    for item in
      select *
      from (values
        ('general_office',   'Vacuum open plan',                'weekly', null::numeric, 800::numeric, 'm2',      10),
        ('general_office',   'Empty bins and replace liners',   'weekly', 0.25,          null,         'each',    20),
        ('general_office',   'Spot clean glass and partitions', 'weekly', null,          220,          'm2',      30),
        ('general_office',   'Dust horizontal surfaces',        'weekly', 0.4,           null,         'each',    40),
        ('amenities',        'Clean and sanitise fixtures',     'weekly', 4,             null,         'fixture', 10),
        ('amenities',        'Mop hard floor',                  'weekly', null,          320,          'm2',      20),
        ('amenities',        'Replenish consumables',           'weekly', 1.5,           null,         'each',    30),
        ('kitchen',          'Clean benches and sinks',         'weekly', 8,             null,         'each',    10),
        ('kitchen',          'Clean appliance exteriors',       'weekly', 6,             null,         'each',    20),
        ('kitchen',          'Mop floor',                       'weekly', null,          300,          'm2',      30),
        ('meeting_room',     'Reset and wipe table',            'weekly', 3,             null,         'each',    10),
        ('meeting_room',     'Vacuum floor',                    'weekly', null,          700,          'm2',      20),
        ('retail',           'Sweep and mop trading floor',     'weekly', null,          550,          'm2',      10),
        ('retail',           'Clean entrance glass',            'weekly', null,          180,          'm2',      20),
        ('childcare',        'Sanitise high-touch surfaces',    'weekly', 6,             null,         'each',    10),
        ('childcare',        'Clean and sanitise floor',        'weekly', null,          400,          'm2',      20),
        ('healthcare',       'Clean to infection-control spec', 'weekly', 12,            null,         'each',    10),
        ('healthcare',       'Detail high-touch points',        'weekly', 5,             null,         'each',    20),
        ('industrial',       'Sweep production floor',          'weekly', null,          450,          'm2',      10),
        ('industrial',       'Degrease work surfaces',          'monthly', 9,            null,         'each',    20),
        ('warehouse',        'Machine sweep floor',             'weekly', null,          1800,         'm2',      10),
        ('warehouse',        'Clean amenities block',           'weekly', 5,             null,         'fixture', 20),
        ('window_cleaning',  'Internal glass',                  'quarterly', null,       70,           'm2',      10),
        ('window_cleaning',  'External glass, ground level',    'quarterly', null,       55,           'm2',      20),
        ('periodical_floor', 'Carpet extraction',               'quarterly', null,       110,          'm2',      10),
        ('periodical_floor', 'Hard floor scrub and reseal',     'biannual',  null,       90,           'm2',      20)
      ) as i(template_code, label, frequency, minutes_per_unit, units_per_hour, unit, sort_order)
      where i.template_code = spec.code
    loop
      insert into public.task_template_items
        (template_id, label, default_frequency, default_minutes_per_unit, default_units_per_hour, unit, sort_order)
      values
        (template_id, item.label, item.frequency, item.minutes_per_unit, item.units_per_hour, item.unit, item.sort_order);
    end loop;
  end loop;
end
$seed$;
