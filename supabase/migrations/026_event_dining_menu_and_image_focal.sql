-- Migration 026: Dining/Menu on social & outings events + image focal point
-- All columns additive with safe defaults — non-destructive, no data loss on rollback.

ALTER TABLE events ADD COLUMN IF NOT EXISTS has_dining BOOLEAN NOT NULL DEFAULT false;

-- 'text'  -> menu_text holds rich-text HTML (same RichEditor pattern as Page Texts)
-- 'file'  -> menu_url / menu_file_name hold an uploaded PDF or image
ALTER TABLE events ADD COLUMN IF NOT EXISTS menu_type TEXT;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_menu_type_check;
ALTER TABLE events ADD CONSTRAINT events_menu_type_check
  CHECK (menu_type IS NULL OR menu_type IN ('text', 'file'));

ALTER TABLE events ADD COLUMN IF NOT EXISTS menu_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS menu_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS menu_file_name TEXT;

-- Focal point for event image cropping, stored as percentages (0-100).
-- Applied as CSS object-position so the same image crops sensibly across
-- the different aspect ratios it's shown at (card banner / slide-out banner / preview).
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_focal_x NUMERIC(5,2) NOT NULL DEFAULT 50;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_focal_y NUMERIC(5,2) NOT NULL DEFAULT 50;

-- ─── ROLLBACK (run manually if needed) ──────────────────────────────────────
-- ALTER TABLE events DROP COLUMN IF EXISTS has_dining;
-- ALTER TABLE events DROP CONSTRAINT IF EXISTS events_menu_type_check;
-- ALTER TABLE events DROP COLUMN IF EXISTS menu_type;
-- ALTER TABLE events DROP COLUMN IF EXISTS menu_text;
-- ALTER TABLE events DROP COLUMN IF EXISTS menu_url;
-- ALTER TABLE events DROP COLUMN IF EXISTS menu_file_name;
-- ALTER TABLE events DROP COLUMN IF EXISTS image_focal_x;
-- ALTER TABLE events DROP COLUMN IF EXISTS image_focal_y;
