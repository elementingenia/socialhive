-- 131_showtime_resident_events.sql
--
-- Show Time: any resident can add a showing (Iain, 2026-10-07). Scope:
-- claude/Element_Happenings_ShowTime_Resident_Events_Scope_Answered.md.
--
--   * events.ingenia_confirmed -- the creator answered "Yes, I have booked
--     the Cinema in the Ingenia app" in the wizard. Shown to Owners/admins.
--   * hub_settings 'showtime_resident_events' -- the admin On/Off switch
--     (Admin > Occasional Activities). Seeded OFF. While off, only admins and
--     Show Time Owners see the wizard (so they can trial it).
--
-- Additive only. Safe to run before the code deploys; the code that writes
-- ingenia_confirmed must not deploy before this runs.

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS ingenia_confirmed BOOLEAN NOT NULL DEFAULT false;

INSERT INTO hub_settings (hub_type, enabled)
VALUES ('showtime_resident_events', false)
ON CONFLICT (hub_type) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'ingenia_confirmed'
  ) THEN
    RAISE EXCEPTION 'FAIL: events.ingenia_confirmed was not added';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'showtime_resident_events') THEN
    RAISE EXCEPTION 'FAIL: hub_settings row showtime_resident_events was not created';
  END IF;
  RAISE NOTICE 'OK: events.ingenia_confirmed added, showtime_resident_events switch seeded (off).';
END $$;

COMMIT;
