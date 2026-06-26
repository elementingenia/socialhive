-- Migration 020: Allow any authenticated member to read confirmed bookings
-- Needed for attendee lists — previously only own bookings were visible

DROP POLICY IF EXISTS "bookings_own_read" ON bookings;

CREATE POLICY "bookings_own_read" ON bookings FOR SELECT USING (
  -- Own bookings (any status)
  member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  -- Confirmed bookings visible to all authenticated members (attendee lists)
  OR (status = 'confirmed' AND auth.uid() IS NOT NULL)
  -- Admins see everything
  OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);
