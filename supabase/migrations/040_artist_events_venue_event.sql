-- Migration 040: link venues → event, artists → events[]

-- map_venues: optional link to one event (for "buy tickets" CTA in popup)
alter table map_venues
  add column if not exists event_id uuid references events(id) on delete set null;

-- artists: optional array of linked event IDs (shown as pills on artist page)
alter table artists
  add column if not exists event_ids uuid[] not null default '{}';
