-- Migration 037: dedicated portrait (4:5) cover image for the homepage event carousel
--
-- cover_image_url is 16:9, used for the event detail page hero/banner.
-- home_cover_image_url is a separate 4:5 (Instagram-portrait-style) crop used
-- by the homepage events carousel cards.

alter table events add column if not exists home_cover_image_url text;

notify pgrst, 'reload schema';
