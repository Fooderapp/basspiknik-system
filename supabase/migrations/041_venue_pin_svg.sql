-- Migration 041: custom SVG pin per venue
alter table map_venues
  add column if not exists pin_svg text;
