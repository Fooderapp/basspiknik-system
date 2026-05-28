-- ── Tickets: add missing columns ─────────────────────────────────────────────
alter table tickets
  add column if not exists event_id       uuid references events(id),
  add column if not exists ticket_type_id uuid references ticket_types(id),
  add column if not exists ticket_name    text,
  add column if not exists tier           ticket_tier not null default 'GENERAL',
  add column if not exists status         text not null default 'VALID'
    check (status in ('VALID','USED','CANCELLED','REFUNDED'));

create index if not exists tickets_event_id_idx       on tickets(event_id);
create index if not exists tickets_ticket_type_id_idx on tickets(ticket_type_id);
create index if not exists tickets_status_idx         on tickets(status);

-- ── Check-ins: drop unique so multi-entry tickets can have multiple rows ──────
-- (unique was on ticket_id — one check-in per ticket. Multi-entry needs N rows)
alter table check_ins drop constraint if exists check_ins_ticket_id_key;
create index if not exists check_ins_ticket_id_idx on check_ins(ticket_id);

-- Rename checked_by → checked_in_by (matches API code)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'check_ins' and column_name = 'checked_by'
  ) then
    alter table check_ins rename column checked_by to checked_in_by;
  end if;
end $$;
