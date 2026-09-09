-- Migration 102: Uptake stat settings seed
--
-- Iain, 2026-09-09: wants an easy on-demand statistic for resident uptake of
-- the app. The activity side of this is already fully live -- migration 009
-- added members.last_active_at and it's kept current on every login
-- (app/api/auth/login/route.js) and by a 5-minute heartbeat in
-- app/(app)/layout.js. No new tracking needed there.
--
-- What was missing: a denominator. "% of residents using the app" needs a
-- total-occupied-households figure to divide by, and this app has no live
-- source of truth for that -- the foundation properties/occupancies tables
-- from migration 068 were never cut over (see project memory,
-- "Foundation Rebuild — BUILT & HELD"), and members.house_number only tells
-- you households WITH a registered member, not the true total. Iain already
-- tracks the true total by hand (Fullerton_Cove_Resident_Reconciliation.xlsx),
-- so rather than build a second, competing source of truth, the Admin >
-- Uptake panel lets him key that number in directly and stores it here --
-- same key/value settings table every other admin-editable single value
-- already uses (our_streaming_services, invite_token, app_name).
--
-- Seeded NULL: the panel shows "not set" and prompts for it rather than
-- silently dividing by a wrong default.

INSERT INTO settings (key, value) VALUES
  ('total_occupied_households', NULL)
ON CONFLICT (key) DO NOTHING;
