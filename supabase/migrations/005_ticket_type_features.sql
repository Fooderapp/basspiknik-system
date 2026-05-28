-- Add entries_per_ticket: how many check-ins one QR code allows (default 1 = one-time)
alter table ticket_types
  add column if not exists entries_per_ticket int not null default 1;

-- Add sale pricing: togglable sale price shown to buyers
alter table ticket_types
  add column if not exists sale_enabled boolean not null default false,
  add column if not exists sale_price float;

-- Update check_ins to track per-entry (allows multi-entry audit trail)
-- Each row = one physical entry. ticket can have multiple rows up to entries_per_ticket.
-- (no schema change needed — check_ins already has ticket_id FK, we just allow multiple rows)
