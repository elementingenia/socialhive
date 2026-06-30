-- Add flag so a DVD (we_own=true) can be nominated as a viewing suggestion
-- without creating a duplicate row in the movies table.
ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS is_viewing_suggestion boolean NOT NULL DEFAULT false;

-- Index for the library page filter
CREATE INDEX IF NOT EXISTS movies_viewing_suggestion
  ON movies (is_viewing_suggestion) WHERE is_viewing_suggestion = true;
