-- 060_fix_contact_booking_unique_index.sql
--
-- Bug fix, found live 2026-07-23 within hours of migration 059 shipping:
-- Iain tried to walk-up book Lyn Smith on a real screening after an earlier
-- cancelled attempt and got "duplicate key value violates unique constraint
-- bookings_event_contact_unique". Migration 059's unique index had no status
-- exclusion, so a single CANCELLED booking permanently blocked ever
-- re-booking that same contact on that same event again.
--
-- The member-booking equivalent of this exact problem was already solved
-- once before: migration 022 DROPPED the plain UNIQUE(event_id, member_id)
-- constraint entirely for the same reason (it also blocked legitimate split
-- confirmed+waitlist bookings), and dedup for members has been handled
-- purely in application code ever since (the `existingActive` check in
-- app/api/coordinator's add_booking and app/api/bookings' POST, both scoped
-- to `.neq('status','cancelled')`).
--
-- Rather than drop the contact index outright and rely on app-code alone
-- (matching members exactly), this narrows it to exclude cancelled rows --
-- keeps real DB-level double-booking protection for contacts (an
-- improvement members never had) while allowing cancel-then-rebook.

DROP INDEX IF EXISTS bookings_event_contact_unique;
CREATE UNIQUE INDEX bookings_event_contact_active_unique
  ON bookings(event_id, contact_id) WHERE contact_id IS NOT NULL AND status <> 'cancelled';
