-- VIP / sponsor ticket type: POS-only, not auto-admitted
alter table ticket_types
  add column if not exists is_vip_ticket boolean not null default false;
