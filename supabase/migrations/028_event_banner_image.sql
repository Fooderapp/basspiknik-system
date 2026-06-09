-- Event banner image — 480×120 (4:1) artwork shown on ticket cards (user
-- dashboard) and in the ticket PDF header / over the QR code.
alter table events
  add column if not exists banner_image_url text;
