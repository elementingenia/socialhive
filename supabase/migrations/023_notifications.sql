-- App-wide notifications table
-- Populated whenever something affects a member's event involvement:
-- waitlist promotions, event updates, booking changes, etc.

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id   uuid        NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  event_id    uuid                 REFERENCES events(id)   ON DELETE SET NULL,
  type        text        NOT NULL,   -- 'waitlist_promoted' | 'event_updated' | 'booking_cancelled' etc.
  message     text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  read_at     timestamptz             -- NULL = unread
);

CREATE INDEX IF NOT EXISTS notifications_member_unread
  ON notifications (member_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS: members can only read their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member reads own notifications"
  ON notifications FOR SELECT
  USING (member_id = (
    SELECT id FROM members WHERE auth_id = auth.uid()
  ));

CREATE POLICY "member marks own read"
  ON notifications FOR UPDATE
  USING (member_id = (
    SELECT id FROM members WHERE auth_id = auth.uid()
  ));

-- Service role can insert (used by API routes)
CREATE POLICY "service role insert"
  ON notifications FOR INSERT
  WITH CHECK (true);
