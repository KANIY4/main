-- 0005_row_level_security
-- Row-level security for every tenant-exposed table.
--
-- The application also checks permissions in packages/auth. These policies are
-- the independent second layer: if application code is bypassed or wrong, the
-- database still refuses cross-tenant reads and writes (scope section 10).
--
-- Rollback: `alter table ... disable row level security` per table. Doing so
-- removes tenant isolation and is a security incident outside a rehearsal.

-- Role used by the API for end-user requests. It never owns tables, so
-- `force row level security` is not required for it, but it is set anyway so a
-- future ownership change cannot silently disable policies.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'brandwoop_app') then
    create role brandwoop_app nologin;
  end if;
end
$$;

grant usage on schema brandwoop to brandwoop_app;

-- ---------------------------------------------------------------------------
-- Predicate helpers
-- ---------------------------------------------------------------------------

-- All predicates below are `security definer` for the reasons documented on
-- brandwoop.current_role_in_tenant in migration 0002.
create or replace function brandwoop.is_active_member(target_tenant_id uuid) returns boolean
  language sql stable security definer set search_path = brandwoop, pg_catalog as $$
    select exists (
      select 1
      from brandwoop.tenant_membership tm
      where tm.tenant_id = target_tenant_id
        and tm.user_id = brandwoop.current_user_id()
        and tm.status = 'active'
    );
  $$;

create or replace function brandwoop.is_tenant_administrator(target_tenant_id uuid)
  returns boolean language sql stable security definer
  set search_path = brandwoop, pg_catalog as $$
    select brandwoop.current_role_in_tenant(target_tenant_id) = 'administrator';
  $$;

/*
 * Support access is deliberately read-only and time-bound. It appears in
 * SELECT policies only, never in a write policy.
 */
create or replace function brandwoop.has_support_access(target_tenant_id uuid)
  returns boolean language sql stable security definer
  set search_path = brandwoop, pg_catalog as $$
    select exists (
      select 1
      from brandwoop.support_access_grant g
      where g.tenant_id = target_tenant_id
        and g.granted_to_user_id = brandwoop.current_user_id()
        and g.revoked_at is null
        and g.expires_at > now()
    );
  $$;

create or replace function brandwoop.can_read_site(target_tenant_id uuid, target_site_id uuid)
  returns boolean language sql stable security definer
  set search_path = brandwoop, pg_catalog as $$
    select brandwoop.is_tenant_administrator(target_tenant_id)
        or (brandwoop.is_active_member(target_tenant_id)
            and brandwoop.user_allocated_to_site(target_site_id))
        or brandwoop.has_support_access(target_tenant_id);
  $$;

-- ---------------------------------------------------------------------------
-- Tenant-scoped tables with a uniform rule: read inside your tenant,
-- write only as an administrator of that tenant.
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
  uniform_tables text[] := array[
    'site_area', 'site_contact', 'service_plan', 'task_template_item',
    'shift_template', 'audit_template', 'audit_item_definition',
    'notification_preference', 'retention_policy'
  ];
begin
  foreach target_table in array uniform_tables loop
    execute format('alter table brandwoop.%I enable row level security', target_table);
    execute format('alter table brandwoop.%I force row level security', target_table);

    execute format($p$
      create policy %I_select on brandwoop.%I for select
        using (brandwoop.is_active_member(tenant_id)
               or brandwoop.has_support_access(tenant_id))
    $p$, target_table, target_table);

    execute format($p$
      create policy %I_write on brandwoop.%I for all
        using (brandwoop.is_tenant_administrator(tenant_id))
        with check (brandwoop.is_tenant_administrator(tenant_id))
    $p$, target_table, target_table);

    execute format('grant select, insert, update, delete on brandwoop.%I to brandwoop_app',
                   target_table);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Tenant and membership
-- ---------------------------------------------------------------------------

alter table brandwoop.tenant enable row level security;
alter table brandwoop.tenant force row level security;

create policy tenant_select on brandwoop.tenant for select
  using (brandwoop.is_active_member(id) or brandwoop.has_support_access(id));

create policy tenant_update on brandwoop.tenant for update
  using (brandwoop.is_tenant_administrator(id))
  with check (brandwoop.is_tenant_administrator(id));

alter table brandwoop.tenant_membership enable row level security;
alter table brandwoop.tenant_membership force row level security;

-- A member sees their own membership; an administrator sees the whole tenant.
create policy tenant_membership_select on brandwoop.tenant_membership for select
  using (
    user_id = brandwoop.current_user_id()
    or brandwoop.is_tenant_administrator(tenant_id)
    or brandwoop.has_support_access(tenant_id)
  );

create policy tenant_membership_write on brandwoop.tenant_membership for all
  using (brandwoop.is_tenant_administrator(tenant_id))
  with check (brandwoop.is_tenant_administrator(tenant_id));

alter table brandwoop.site_assignment enable row level security;
alter table brandwoop.site_assignment force row level security;

create policy site_assignment_select on brandwoop.site_assignment for select
  using (
    user_id = brandwoop.current_user_id()
    or brandwoop.is_tenant_administrator(tenant_id)
    or brandwoop.has_support_access(tenant_id)
  );

create policy site_assignment_write on brandwoop.site_assignment for all
  using (brandwoop.is_tenant_administrator(tenant_id))
  with check (brandwoop.is_tenant_administrator(tenant_id));

-- The request role reads these tables directly as well as through the policy
-- predicates; the policies above decide which rows it sees.
grant select, update on brandwoop.tenant to brandwoop_app;
grant select, insert, update on brandwoop.tenant_membership to brandwoop_app;
grant select, insert, update, delete on brandwoop.site_assignment to brandwoop_app;
grant select on brandwoop.user_profile to brandwoop_app;

alter table brandwoop.device_session enable row level security;
alter table brandwoop.device_session force row level security;

-- A user manages their own sessions; an administrator can see and revoke
-- sessions in their tenant, which is what suspension depends on.
create policy device_session_select on brandwoop.device_session for select
  using (
    user_id = brandwoop.current_user_id()
    or (tenant_id is not null and brandwoop.is_tenant_administrator(tenant_id))
  );

create policy device_session_write on brandwoop.device_session for all
  using (
    user_id = brandwoop.current_user_id()
    or (tenant_id is not null and brandwoop.is_tenant_administrator(tenant_id))
  )
  with check (
    user_id = brandwoop.current_user_id()
    or (tenant_id is not null and brandwoop.is_tenant_administrator(tenant_id))
  );

grant select, insert, update on brandwoop.device_session to brandwoop_app;

-- ---------------------------------------------------------------------------
-- Sites and shifts: allocation-aware
-- ---------------------------------------------------------------------------

alter table brandwoop.site enable row level security;
alter table brandwoop.site force row level security;

create policy site_select on brandwoop.site for select
  using (brandwoop.can_read_site(tenant_id, id));

create policy site_write on brandwoop.site for all
  using (brandwoop.is_tenant_administrator(tenant_id))
  with check (brandwoop.is_tenant_administrator(tenant_id));

grant select, insert, update, delete on brandwoop.site to brandwoop_app;

alter table brandwoop.shift enable row level security;
alter table brandwoop.shift force row level security;

-- A worker reads a shift they are assigned to even without a site allocation,
-- which is what cover shifts produce.
create policy shift_select on brandwoop.shift for select
  using (
    brandwoop.can_read_site(tenant_id, site_id)
    or exists (
      select 1 from brandwoop.shift_assignment sa
      where sa.shift_id = shift.id and sa.worker_id = brandwoop.current_user_id()
    )
  );

create policy shift_write on brandwoop.shift for all
  using (brandwoop.is_tenant_administrator(tenant_id))
  with check (brandwoop.is_tenant_administrator(tenant_id));

grant select, insert, update, delete on brandwoop.shift to brandwoop_app;

alter table brandwoop.shift_assignment enable row level security;
alter table brandwoop.shift_assignment force row level security;

create policy shift_assignment_select on brandwoop.shift_assignment for select
  using (
    worker_id = brandwoop.current_user_id()
    or brandwoop.is_tenant_administrator(tenant_id)
    or brandwoop.has_support_access(tenant_id)
  );

create policy shift_assignment_write on brandwoop.shift_assignment for all
  using (brandwoop.is_tenant_administrator(tenant_id))
  with check (brandwoop.is_tenant_administrator(tenant_id));

grant select, insert, update, delete on brandwoop.shift_assignment to brandwoop_app;

-- ---------------------------------------------------------------------------
-- Attendance and evidence
-- ---------------------------------------------------------------------------

alter table brandwoop.attendance_event enable row level security;
alter table brandwoop.attendance_event force row level security;

create policy attendance_event_select on brandwoop.attendance_event for select
  using (
    worker_id = brandwoop.current_user_id()
    or brandwoop.is_tenant_administrator(tenant_id)
    or exists (
      select 1 from brandwoop.shift s
      where s.id = attendance_event.shift_id
        and brandwoop.can_read_site(s.tenant_id, s.site_id)
    )
  );

-- A worker records only their own attendance. No update or delete policy
-- exists, so both are denied outright in addition to the immutability trigger.
create policy attendance_event_insert on brandwoop.attendance_event for insert
  with check (
    worker_id = brandwoop.current_user_id()
    and brandwoop.is_active_member(tenant_id)
  );

grant select, insert on brandwoop.attendance_event to brandwoop_app;

alter table brandwoop.photo_evidence enable row level security;
alter table brandwoop.photo_evidence force row level security;

create policy photo_evidence_select on brandwoop.photo_evidence for select
  using (
    exists (
      select 1 from brandwoop.shift s
      where s.id = photo_evidence.shift_id
        and (
          brandwoop.can_read_site(s.tenant_id, s.site_id)
          or exists (
            select 1 from brandwoop.shift_assignment sa
            where sa.shift_id = s.id and sa.worker_id = brandwoop.current_user_id()
          )
        )
    )
  );

create policy photo_evidence_insert on brandwoop.photo_evidence for insert
  with check (
    brandwoop.is_active_member(tenant_id)
    and exists (
      select 1 from brandwoop.shift_assignment sa
      where sa.shift_id = photo_evidence.shift_id
        and sa.worker_id = brandwoop.current_user_id()
    )
  );

grant select, insert on brandwoop.photo_evidence to brandwoop_app;

-- ---------------------------------------------------------------------------
-- Pay rates: administrators only, and never exposed to a support grant.
-- ---------------------------------------------------------------------------

alter table brandwoop.pay_rate_history enable row level security;
alter table brandwoop.pay_rate_history force row level security;

create policy pay_rate_history_select on brandwoop.pay_rate_history for select
  using (brandwoop.is_tenant_administrator(tenant_id));

create policy pay_rate_history_insert on brandwoop.pay_rate_history for insert
  with check (brandwoop.is_tenant_administrator(tenant_id));

grant select, insert on brandwoop.pay_rate_history to brandwoop_app;

-- ---------------------------------------------------------------------------
-- Quality, reporting and platform tables
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
  site_scoped_tables text[] := array[
    'audit', 'issue', 'daily_log', 'supply_shortage', 'report'
  ];
begin
  foreach target_table in array site_scoped_tables loop
    execute format('alter table brandwoop.%I enable row level security', target_table);
    execute format('alter table brandwoop.%I force row level security', target_table);

    execute format($p$
      create policy %I_select on brandwoop.%I for select
        using (brandwoop.can_read_site(tenant_id, site_id))
    $p$, target_table, target_table);

    execute format($p$
      create policy %I_write on brandwoop.%I for all
        using (brandwoop.is_active_member(tenant_id)
               and brandwoop.can_read_site(tenant_id, site_id))
        with check (brandwoop.is_active_member(tenant_id)
                    and brandwoop.can_read_site(tenant_id, site_id))
    $p$, target_table, target_table);

    execute format('grant select, insert, update, delete on brandwoop.%I to brandwoop_app',
                   target_table);
  end loop;
end
$$;

-- Tables reached through a parent row inherit the parent's visibility.
do $$
declare
  target_table text;
  member_scoped_tables text[] := array[
    'audit_item_result', 'rectification', 'checklist_run', 'task_result',
    'attendance_exception', 'attendance_correction', 'upload_record',
    'shift_sign_off', 'report_version', 'delivery_attempt', 'notification'
  ];
begin
  foreach target_table in array member_scoped_tables loop
    execute format('alter table brandwoop.%I enable row level security', target_table);
    execute format('alter table brandwoop.%I force row level security', target_table);

    execute format($p$
      create policy %I_select on brandwoop.%I for select
        using (brandwoop.is_active_member(tenant_id)
               or brandwoop.has_support_access(tenant_id))
    $p$, target_table, target_table);

    execute format($p$
      create policy %I_write on brandwoop.%I for all
        using (brandwoop.is_active_member(tenant_id))
        with check (brandwoop.is_active_member(tenant_id))
    $p$, target_table, target_table);

    execute format('grant select, insert, update, delete on brandwoop.%I to brandwoop_app',
                   target_table);
  end loop;
end
$$;

-- The outbox and the audit log belong to the platform, not to a tenant user.
-- Workers read them with the service identity, which bypasses RLS by design;
-- brandwoop_app receives no grant at all.
alter table brandwoop.outbox_event enable row level security;
alter table brandwoop.audit_log enable row level security;
alter table brandwoop.support_access_grant enable row level security;

-- A tenant can always see who accessed its data and why.
create policy support_access_grant_select on brandwoop.support_access_grant for select
  using (brandwoop.is_tenant_administrator(tenant_id));

grant select on brandwoop.support_access_grant to brandwoop_app;
