-- 044_booking_attendees.sql
--
-- Multi-attendee bookings (feedback round 2026-07-16, plan workstream A).
-- When a resident books more than one seat, every extra seat must be named:
-- either another resident (member_id) or, only if the event allows it, a
-- non-resident guest (guest_name). Decision #4: guests still consume a seat
-- and count toward capacity -- which needs no change here, because capacity is
-- already computed from bookings.seats; this table only records WHO the extra
-- seats are for, it doesn't touch the seat maths.
--
-- Keyed by (event_id, owner_id) rather than a specific bookings row, on
-- purpose: a member's booking can split across a confirmed row + a waitlist
-- row and those rows churn (waitlist promotion, seat modify), but "this
-- member's party for this event" is stable. The booking API keeps this set in
-- sync with the owner's seat count.

CREATE TABLE IF NOT EXISTS booking_attendees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  owner_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_id  UUID REFERENCES members(id) ON DELETE SET NULL,  -- set when the attendee is a resident
  guest_name TEXT,                                            -- set when the attendee is a non-resident
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT booking_attendee_identity CHECK (
    (member_id IS NOT NULL AND guest_name IS NULL) OR
    (member_id IS NULL AND guest_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_event ON booking_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_owner ON booking_attendees(event_id, owner_id);

ALTER TABLE booking_attendees ENABLE ROW LEVEL SECURITY;

-- Any authenticated member may read attendees — same visibility model as
-- confirmed bookings (migration 020), since these names appear in attendee
-- lists. Name-privacy masking is applied in the app layer, exactly as for
-- member bookings. Writes are service-role only (the booking API), so no
-- INSERT/UPDATE/DELETE policy exists — RLS therefore blocks any direct client
-- write.
DROP POLICY IF EXISTS "booking_attendees_read" ON booking_attendees;
CREATE POLICY "booking_attendees_read" ON booking_attendees FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- A3: per-event switch for whether the extra attendees may be non-residents.
-- Default false = residents only (the safer default). Only meaningful when a
-- booking can exceed one seat.
ALTER TABLE events ADD COLUMN IF NOT EXISTS allow_nonresident_guests BOOLEAN NOT NULL DEFAULT false;
