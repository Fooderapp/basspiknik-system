-- Billing details captured during mobile onboarding (before first purchase).
-- Stored on the profile so they're reused across purchases and editable later.

alter table profiles add column if not exists billing_name        text;
alter table profiles add column if not exists billing_address     text;
alter table profiles add column if not exists billing_city        text;
alter table profiles add column if not exists billing_postal_code text;
alter table profiles add column if not exists billing_country     text;

-- Marks onboarding as complete so the app only prompts once.
alter table profiles add column if not exists onboarded_at        timestamptz;
