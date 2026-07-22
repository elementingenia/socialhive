-- 056_event_series_coordinators.sql — Recurring Events, follow-on to 055.
-- The coordinator set to stamp onto every generated occurrence (event_coordinators
-- rows are per-event, so the series needs to remember who to assign). Additive.
ALTER TABLE event_series ADD COLUMN IF NOT EXISTS coordinator_ids UUID[] NOT NULL DEFAULT '{}';
