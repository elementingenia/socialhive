-- 027_streaming_offers.sql
-- Adds structured streaming-availability data to movies, replacing the
-- never-populated streaming_au text column as the source of truth for the
-- FREE/COST pill's streaming-match logic.
--
-- streaming_offers shape:
-- {
--   "flatrate": ["Binge", "Netflix"],                              -- subscription services carrying the title
--   "rent":     [{ "service": "Apple TV Store", "price": "A$ 4.99" }],
--   "buy":      [{ "service": "Apple TV Store", "price": "A$ 14.99" }],
--   "matched":  true                                                -- false if JustWatch has no record of the title at all
-- }

ALTER TABLE movies ADD COLUMN IF NOT EXISTS streaming_offers JSONB;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS streaming_checked_at TIMESTAMPTZ;

-- Rollback:
-- ALTER TABLE movies DROP COLUMN IF EXISTS streaming_offers;
-- ALTER TABLE movies DROP COLUMN IF EXISTS streaming_checked_at;
