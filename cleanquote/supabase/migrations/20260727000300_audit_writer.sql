-- Audit writing.
--
-- `audit_logs` deliberately has no INSERT policy: a tenant user must not be able
-- to forge or suppress their own audit trail. That left application code with
-- two bad options — write audit rows as a superuser in a separate transaction
-- (losing atomicity with the change being recorded), or open an INSERT policy
-- (losing the guarantee).
--
-- This function is the third option. It runs with definer rights so the insert
-- succeeds, but it stamps `actor_user_id` from `auth.uid()` itself, so the
-- caller cannot claim to be somebody else, and it refuses to write against an
-- organisation the caller is not a member of. The audit row is therefore written
-- inside the same transaction as the change it describes.

create or replace function public.record_audit(
  p_organisation_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor uuid := auth.uid();
begin
  -- A signed-in caller may only write audit rows for an organisation they
  -- actually belong to. An unauthenticated caller (a client accepting a
  -- proposal from a link) writes with a null actor, which is the honest record.
  if actor is not null
     and p_organisation_id is not null
     and not public.is_org_member(p_organisation_id) then
    raise exception 'Cannot write an audit record for an organisation you are not a member of.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_logs
    (organisation_id, actor_user_id, action, entity_type, entity_id,
     before_state, after_state, reason, ip_address, user_agent)
  values
    (p_organisation_id, actor, p_action, p_entity_type, p_entity_id,
     p_before, p_after, p_reason, p_ip, p_user_agent);
end;
$$;

revoke execute on function public.record_audit(uuid, text, text, uuid, jsonb, jsonb, text, inet, text)
  from public;
grant execute on function public.record_audit(uuid, text, text, uuid, jsonb, jsonb, text, inet, text)
  to anon, authenticated;

-- Email delivery records are written by the same kind of path: the send happens
-- during a user's request, but the table holds rendered message bodies and is
-- readable by no tenant role.
create or replace function public.record_email_delivery(
  p_organisation_id uuid,
  p_kind text,
  p_to_email text,
  p_subject text,
  p_body_text text,
  p_provider text,
  p_provider_message_id text,
  p_status text,
  p_error text default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  new_id uuid;
begin
  insert into public.email_deliveries
    (organisation_id, kind, to_email, subject, body_text, provider, provider_message_id,
     status, error, related_entity_type, related_entity_id, sent_at)
  values
    (p_organisation_id, p_kind, p_to_email, p_subject, p_body_text, p_provider,
     p_provider_message_id, p_status, p_error, p_related_entity_type, p_related_entity_id,
     case when p_status = 'sent' then now() else null end)
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.record_email_delivery(uuid, text, text, text, text, text, text, text, text, text, uuid)
  from public;
grant execute on function public.record_email_delivery(uuid, text, text, text, text, text, text, text, text, text, uuid)
  to anon, authenticated;
