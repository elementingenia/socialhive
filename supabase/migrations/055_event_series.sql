-- 055_event_series.sql — Repeatable (Recurring) Events, Phase 1
-- Scope: Social_Hive_Recurring_Events_Scope.md (decisions locked 2026-07-21).
--
-- Occurrences are MATERIALISED as real `events` rows (scope §3), so bookings,
-- coordinators, capacity, payments and event questions all keep working with no
-- special-casing. This table holds the pattern + the template those rows are
-- generated from.
--
-- `mode` distinguishes the two club types (scope §7a):
--   'series'  — schedule-defined clubs (cards, dinner): generate occurrences.
--   'pattern' — content-defined clubs (Book Club): generate NOTHING; the rule is
--               used only to pre-fill the date on the next single event.

CREATE TABLE IF NOT EXISTS event_series (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID REFERENCES clubs(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES members(id),

  mode              TEXT NOT NULL DEFAULT 'series'
                      CHECK (mode IN ('series', 'pattern')),

  -- Curated patterns only (scope §4) — an EC cannot invent a rule.
  rule_type         TEXT NOT NULL
                      CHECK (rule_type IN ('weekly', 'fortnightly', 'monthly_date', 'monthly_weekday')),
  -- weekly:          { "weekdays": [2,4] }            (0=Sun … 6=Sat)
  -- fortnightly:     { "weekday": 4 }                 (anchored to start_date)
  -- monthly_date:    { "day": 15 }
  -- monthly_weekday: { "ordinal": "last", "weekday": 4 }   ordinal: 1|2|3|4|"last"
  rule_config       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Asked of the EC at creation, never decided silently (scope §4, Iain).
  month_end_policy  TEXT NOT NULL DEFAULT 'clamp'
                      CHECK (month_end_policy IN ('clamp', 'skip')),

  -- EC-chosen, from a gated list (scope §5, Iain). A hard cap of 12 generated
  -- occurrences applies regardless — enforced in lib/recurrence.js.
  horizon_months    INT NOT NULL DEFAULT 6 CHECK (horizon_months IN (3, 6, 12)),

  start_date        DATE NOT NULL,
  event_time        TEXT NOT NULL,          -- 'HH:MM', matching events.event_time
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),

  -- Template the occurrences are stamped from (mirrors the event form).
  title                    TEXT,
  description              TEXT,
  welcome_message          TEXT,
  location_type            TEXT,
  location                 TEXT,
  max_seats                INT,
  max_seats_per_booking    INT,
  allow_nonresident_guests BOOLEAN DEFAULT false,
  payment_required         BOOLEAN DEFAULT false,
  cost                     NUMERIC,
  bring_category_ids       UUID[],
  theme_name               TEXT,
  is_public                BOOLEAN DEFAULT true,
  show_attendee_names      BOOLEAN DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_series_club   ON event_series(club_id);
CREATE INDEX IF NOT EXISTS idx_event_series_status ON event_series(status);

-- Link occurrences back to their series.
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES event_series(id) ON DELETE SET NULL;
-- Set when an occurrence is edited as "this occurrence only" (scope §6): it then
-- stops inheriting "this and future" template edits.
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_series_exception BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id);

-- RLS: service-role only. Who may create/edit a series depends on runtime role
-- resolution (admin | club owner | EC), which per the canonical coding standards
-- is enforced in a service-role API route, not in row policies.
ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;
