-- 0003_attendance_and_evidence
-- Attendance events, checklist runs, evidence uploads and sign-off.
--
-- Rollback: drop the objects created here. Attendance events are the legal
-- record of worked time; never reverse this migration on an environment that
-- has recorded any.

create type brandwoop.attendance_event_type as enum
  ('sign_in', 'sign_out', 'break_start', 'break_end');

create type brandwoop.geofence_outcome as enum
  ('inside', 'outside', 'accuracy_rejected', 'unavailable', 'permission_denied',
   'mock_location_suspected');

-- Immutable by trigger. A correction adds a new row and preserves the original.
create table brandwoop.attendance_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete restrict,
  worker_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  type brandwoop.attendance_event_type not null,
  server_recorded_at timestamptz not null default now(),
  device_reported_at timestamptz not null,
  geofence_outcome brandwoop.geofence_outcome not null,
  distance_from_site_metres double precision,
  latitude double precision,
  longitude double precision,
  accuracy_metres double precision,
  consent_version text,
  idempotency_key text not null,
  superseded_by_event_id uuid references brandwoop.attendance_event (id) on delete set null,
  constraint attendance_event_idempotent unique (tenant_id, idempotency_key)
);

create index idx_attendance_event_shift_id on brandwoop.attendance_event (shift_id);
create index idx_attendance_event_worker_id_server_recorded_at
  on brandwoop.attendance_event (worker_id, server_recorded_at desc);

-- Only the supersede pointer may change; every other column is frozen.
create or replace function brandwoop.attendance_event_immutable() returns trigger
  language plpgsql as $$
  begin
    if tg_op = 'DELETE' then
      raise exception 'Attendance events cannot be deleted'
        using errcode = 'restrict_violation';
    end if;

    if (to_jsonb(new) - 'superseded_by_event_id') is distinct from
       (to_jsonb(old) - 'superseded_by_event_id') then
      raise exception 'Attendance events are immutable; record a correction instead'
        using errcode = 'restrict_violation';
    end if;

    return new;
  end;
  $$;

create trigger attendance_event_no_update before update on brandwoop.attendance_event
  for each row execute function brandwoop.attendance_event_immutable();

create trigger attendance_event_no_delete before delete on brandwoop.attendance_event
  for each row execute function brandwoop.attendance_event_immutable();

create table brandwoop.attendance_correction (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  attendance_event_id uuid not null references brandwoop.attendance_event (id) on delete restrict,
  requested_by uuid not null references brandwoop.user_profile (id) on delete restrict,
  proposed_time timestamptz not null,
  reason text not null,
  evidence_note text,
  decision text check (decision in ('approved', 'rejected')),
  decision_reason text,
  decided_by uuid references brandwoop.user_profile (id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_attendance_correction_tenant_id_decision
  on brandwoop.attendance_correction (tenant_id, decision);

create table brandwoop.attendance_exception (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete cascade,
  category text not null check (category in
    ('late', 'missed', 'outside_geofence', 'no_location', 'early_finish')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_reason text,
  resolved_by uuid references brandwoop.user_profile (id) on delete restrict,
  -- One open exception per shift and category; the detector is idempotent.
  constraint attendance_exception_unique unique (shift_id, category)
);

create index idx_attendance_exception_tenant_id_resolved_at
  on brandwoop.attendance_exception (tenant_id, resolved_at);

create table brandwoop.checklist_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete cascade,
  service_plan_version integer not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint checklist_run_unique_per_shift unique (shift_id)
);

create table brandwoop.task_result (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  checklist_run_id uuid not null references brandwoop.checklist_run (id) on delete cascade,
  task_template_item_id uuid not null references brandwoop.task_template_item (id) on delete restrict,
  outcome text not null check (outcome in ('completed', 'not_applicable', 'blocked')),
  not_applicable_reason text,
  note text,
  completed_at timestamptz,
  constraint task_result_unique unique (checklist_run_id, task_template_item_id),
  constraint task_result_reason_required check (
    outcome <> 'not_applicable' or not_applicable_reason is not null
  )
);

create index idx_task_result_checklist_run_id on brandwoop.task_result (checklist_run_id);

create type brandwoop.upload_status as enum ('pending', 'confirmed', 'expired', 'quarantined');

-- A file becomes evidence only after confirm + scan. Abandoned slots expire.
create table brandwoop.upload_record (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid references brandwoop.shift (id) on delete cascade,
  object_path text not null unique,
  declared_mime_type text not null,
  declared_bytes bigint not null check (declared_bytes between 1 and 15728640),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status brandwoop.upload_status not null default 'pending',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint upload_record_idempotent unique (tenant_id, idempotency_key),
  -- Object paths are tenant-prefixed so a storage policy can check the prefix.
  constraint upload_record_tenant_prefixed check (object_path like tenant_id::text || '/%')
);

create index idx_upload_record_status_expires_at
  on brandwoop.upload_record (status, expires_at) where status = 'pending';

create table brandwoop.photo_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete cascade,
  task_result_id uuid references brandwoop.task_result (id) on delete set null,
  upload_record_id uuid not null references brandwoop.upload_record (id) on delete restrict,
  category text not null check (category in ('before', 'after', 'general', 'issue', 'audit')),
  object_path text not null,
  bytes bigint not null,
  captured_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  scan_status text not null default 'pending'
    check (scan_status in ('pending', 'clean', 'quarantined')),
  caption text,
  constraint photo_evidence_upload_unique unique (upload_record_id)
);

create index idx_photo_evidence_shift_id_category
  on brandwoop.photo_evidence (shift_id, category);

create table brandwoop.shift_sign_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references brandwoop.tenant (id) on delete restrict,
  shift_id uuid not null references brandwoop.shift (id) on delete restrict,
  worker_id uuid not null references brandwoop.user_profile (id) on delete restrict,
  outstanding_tasks_acknowledged boolean not null default false,
  note text,
  signature_object_path text,
  signed_off_at timestamptz not null default now(),
  idempotency_key text not null,
  constraint shift_sign_off_unique_per_shift unique (shift_id),
  constraint shift_sign_off_idempotent unique (tenant_id, idempotency_key)
);

create trigger shift_sign_off_no_update before update on brandwoop.shift_sign_off
  for each row execute function brandwoop.reject_mutation();
create trigger shift_sign_off_no_delete before delete on brandwoop.shift_sign_off
  for each row execute function brandwoop.reject_mutation();
