-- Add maturity rating column to movies (e.g. PG, M, MA15+, R18+)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS rating TEXT;
