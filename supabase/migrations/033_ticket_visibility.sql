-- Migration 033: Ticket type visibility controls
--
-- Lets admins hide a ticket type from the public event page without deleting it,
-- and optionally schedule a visibility window. Door tickets are already POS-only
-- (filtered everywhere); these add manual + scheduled control for any type.
--
--   is_visible    – master show/hide on the public event page (default true)
--   visible_from  – if set, hidden before this time
--   visible_until – if set, hidden after this time

alter table ticket_types
  add column if not exists is_visible   boolean     not null default true,
  add column if not exists visible_from  timestamptz,
  add column if not exists visible_until timestamptz;
