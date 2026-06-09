-- System configuration: runtime secrets/keys editable from the admin dashboard.
-- Stores Stripe / Billingo / Resend / public-URL values as key→value rows.
--
-- SECURITY: locked to the service role only. RLS is enabled with NO policies,
-- so anon/authenticated clients (PostgREST) can never read it. All access goes
-- through server code using the service-role key (createAdminClient).

create table if not exists system_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table system_config enable row level security;
-- No policies on purpose → only the service role (which bypasses RLS) can touch it.

-- Seed the known keys (NULL = not set; resolver falls back to the env var).
insert into system_config (key, value) values
  ('STRIPE_SECRET_KEY', null),
  ('STRIPE_WEBHOOK_SECRET', null),
  ('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', null),
  ('BILLINGO_API_KEY', null),
  ('BILLINGO_BLOCK_ID', null),
  ('BILLINGO_BANK_ACCOUNT_ID', null),
  ('BILLINGO_VAT', null),
  ('BILLINGO_PAYMENT_METHOD', null),
  ('RESEND_API_KEY', null),
  ('RESEND_FROM', null),
  ('NEXT_PUBLIC_APP_URL', null)
on conflict (key) do nothing;
