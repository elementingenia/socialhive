-- 062_club_watermark_image.sql
--
-- Club visual identity (Initiative 1, branch spike) -- gives each club an
-- optional watermarked background image on its page banner, instead of a
-- dedicated image tile that eats vertical space. ADDITIVE and safe against
-- current production: all new columns are nullable/defaulted, nothing reads
-- them until the branch code ships.
--
-- image_pos_x / image_pos_y (0-100, default 50/50 = centred) and image_zoom
-- (>=1, default 1 = the automatic "cover" fit) together describe a pan+zoom
-- transform, NOT a single focal point like events.image_focal_x/y -- the
-- club picture needs to fill a fixed-aspect banner regardless of whether the
-- uploaded photo is portrait or landscape, so the picker lets the admin move
-- AND resize it, always constrained to fully cover the banner (no gaps).
-- Deliberately separate column names from events' image_focal_x/y so a
-- future reader doesn't assume the same semantics.
--
-- NOT NULL + DEFAULT together from the start (not NOT NULL added later) --
-- learned the hard way from the events.image_focal_x/y crash (PR #8,
-- 2026-07-23): a NOT NULL column with no default on existing rows breaks any
-- insert/select path that doesn't explicitly set it.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS image_url  TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS image_pos_x NUMERIC NOT NULL DEFAULT 50;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS image_pos_y NUMERIC NOT NULL DEFAULT 50;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS image_zoom  NUMERIC NOT NULL DEFAULT 1;
