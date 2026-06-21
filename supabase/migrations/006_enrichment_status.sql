-- Track enrichment outcome per movie so failed lookups aren't retried endlessly
ALTER TABLE movies ADD COLUMN IF NOT EXISTS enrichment_status TEXT;
-- Values: NULL = not attempted, 'ok' = enriched, 'no_match' = not found on TMDB/OMDb, 'api_error' = call failed

-- Mark already-enriched movies (has poster AND plot) as ok
UPDATE movies
SET enrichment_status = 'ok'
WHERE poster_url IS NOT NULL
  AND plot IS NOT NULL
  AND enrichment_status IS NULL;
