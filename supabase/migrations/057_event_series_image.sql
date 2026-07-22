-- 057_event_series_image.sql — Recurring Events: carry the activity image onto
-- generated occurrences so a card never loses its image when a future date rolls
-- over to become the parent. Additive.
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS image_focal_x INT;
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS image_focal_y INT;
