-- Write policies for two tables that only had read policies.
--
-- Both are written during an ordinary user action, so requiring a privileged
-- connection for them would have pushed routine work onto the bypass path. The
-- narrower fix is a policy that says exactly who may write and what they may
-- claim.

-- AI runs: the cost and validation ledger. A user with quote.edit may record a
-- run, but only under their own identity — `user_id = auth.uid()` stops a
-- permitted user attributing their spend to a colleague.
create policy ai_runs_insert on public.ai_runs
  for insert to authenticated
  with check (
    public.has_permission(organisation_id, 'quote.edit')
    and (user_id is null or user_id = auth.uid())
  );

-- Proposal events: the delivery and engagement trail. Sending a proposal writes
-- the `sent` event in the same transaction as the proposal itself.
create policy proposal_events_insert on public.proposal_events
  for insert to authenticated
  with check (public.has_permission(organisation_id, 'quote.send'));

-- Client-side events (viewed, accepted, declined, commented) arrive with no
-- session at all and are written by definer-rights server functions, so they
-- deliberately have no policy here.

grant select, insert on public.ai_runs, public.proposal_events to authenticated;
