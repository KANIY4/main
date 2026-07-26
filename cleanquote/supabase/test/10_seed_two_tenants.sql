-- Fixture for the security tests: two unrelated organisations with overlapping
-- data shapes, so a leak in either direction is detectable.
--
-- Northwind Facility Services  — user: ada    (estimator, no cost visibility)
--                              — user: grace  (director, full permissions)
-- Halcyon Cleaning Group       — user: linus  (director, full permissions)

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ada@northwind.test'),
  ('22222222-2222-4222-8222-222222222222', 'grace@northwind.test'),
  ('33333333-3333-4333-8333-333333333333', 'linus@halcyon.test');

insert into public.organisations (id, name, slug, country_code, currency_code) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Northwind Facility Services', 'northwind', 'AU', 'AUD'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Halcyon Cleaning Group', 'halcyon', 'GB', 'GBP');

insert into public.organisation_settings (organisation_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.roles (id, organisation_id, code, label) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'estimator', 'Estimator'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'director', 'Director'),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'director', 'Director');

-- Ada is an estimator: she can build quotes and see prices, but not cost,
-- profit, or margin overrides.
insert into public.role_permissions (role_id, permission_code) values
  ('a0000000-0000-4000-8000-000000000001', 'quote.create'),
  ('a0000000-0000-4000-8000-000000000001', 'quote.edit'),
  ('a0000000-0000-4000-8000-000000000001', 'quote.view_selling_price');

insert into public.role_permissions (role_id, permission_code)
select 'a0000000-0000-4000-8000-000000000002', code from public.permissions;

insert into public.role_permissions (role_id, permission_code)
select 'b0000000-0000-4000-8000-000000000001', code from public.permissions;

insert into public.organisation_members (organisation_id, user_id, role_id, status, joined_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'a0000000-0000-4000-8000-000000000001', 'active', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-4000-8000-000000000002', 'active', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333',
   'b0000000-0000-4000-8000-000000000001', 'active', now());

insert into public.clients (id, organisation_id, name) values
  ('c0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Riverside Corporate Park'),
  ('c0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Kingsway Medical Centre');

insert into public.quotes (id, organisation_id, client_id, reference, title, currency_code) values
  ('d0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'c0000000-0000-4000-8000-00000000000a', 'NW-1001', 'Riverside nightly office clean', 'AUD'),
  ('d0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'c0000000-0000-4000-8000-00000000000b', 'HAL-2001', 'Kingsway clinical daily clean', 'GBP');

insert into public.rate_cards (id, organisation_id, name, is_default) values
  ('e0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Default 2026', true),
  ('e0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Default 2026', true);

insert into public.quote_versions (id, organisation_id, quote_id, version, rate_card_id) values
  ('f0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'd0000000-0000-4000-8000-00000000000a', 1, 'e0000000-0000-4000-8000-00000000000a'),
  ('f0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'd0000000-0000-4000-8000-00000000000b', 1, 'e0000000-0000-4000-8000-00000000000b');

-- A snapshot in the shape the engine actually emits, so the price view and the
-- cost-permission split are tested against realistic JSON.
insert into public.quote_calculation_snapshots
  (organisation_id, quote_version_id, calculation_schema_version, engine_input, engine_output, input_hash)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'f0000000-0000-4000-8000-00000000000a', '1.0.0',
   '{"currency":"AUD"}'::jsonb,
   '{"scenarios":[{"key":"balanced","price":{"annualExTax":"20800.00","annualIncTax":"22880.00","perOccurrenceExTax":"80.00","perMonthExTax":"1733.33","oneOffExTax":"0.00","contractTotalExTax":"20800.00"},"totalRecurringCost":"15600.00","margin":{"grossMarginPct":"25.0000"}}]}'::jsonb,
   'aaaa000000000001'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'f0000000-0000-4000-8000-00000000000b', '1.0.0',
   '{"currency":"GBP"}'::jsonb,
   '{"scenarios":[{"key":"balanced","price":{"annualExTax":"48000.00","annualIncTax":"57600.00","perOccurrenceExTax":"184.00","perMonthExTax":"4000.00","oneOffExTax":"0.00","contractTotalExTax":"48000.00"},"totalRecurringCost":"31000.00","margin":{"grossMarginPct":"35.4166"}}]}'::jsonb,
   'bbbb000000000001');

insert into public.proposals
  (id, organisation_id, quote_version_id, scenario_key, rendered_content,
   public_token, public_token_expires_at, sent_at)
values
  ('a1000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'f0000000-0000-4000-8000-00000000000a', 'balanced',
   '{"title":"Riverside nightly office clean","annualPrice":"20800.00"}'::jsonb,
   'live-token-000000000000000000000000000000', now() + interval '30 days', now()),
  ('a1000000-0000-4000-8000-00000000000e', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'f0000000-0000-4000-8000-00000000000a', 'balanced',
   '{"title":"Superseded proposal"}'::jsonb,
   'expired-token-0000000000000000000000000000', now() - interval '1 day', now() - interval '60 days'),
  ('a1000000-0000-4000-8000-00000000000c', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'f0000000-0000-4000-8000-00000000000a', 'balanced',
   '{"title":"Revoked proposal"}'::jsonb,
   'revoked-token-0000000000000000000000000000', now() + interval '30 days', now());

update public.proposals
set revoked_at = now()
where id = 'a1000000-0000-4000-8000-00000000000c';

insert into storage.objects (bucket_id, name) values
  ('quote-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/d0000000-0000-4000-8000-00000000000a/photo-1.jpg'),
  ('quote-media', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/d0000000-0000-4000-8000-00000000000b/photo-1.jpg');

commit;
