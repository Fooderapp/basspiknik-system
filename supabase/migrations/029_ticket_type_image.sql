-- Per-ticket-type banner image (480×120, 4:1). Shown on that ticket's card and
-- PDF. Takes priority over the event-level banner.
alter table ticket_types
  add column if not exists image_url text;
