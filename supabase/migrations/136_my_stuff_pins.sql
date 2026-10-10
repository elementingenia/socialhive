-- 136: My Stuff (Iain, 2026-10-10).
-- Scope: "Element Happenings – My Stuff – Scope Answered" (Google Doc,
-- Drive folder 0ADckvqFBnPA7Uk9PVA).
--
-- A resident's own pins: people (a resident or a contact) and documents.
-- Groups & Clubs and repeating events in My Stuff are NOT pinned -- they are
-- worked out from club_members and bookings, so they need no table.
--
-- Fully private (agreed): nobody, admins included, sees another resident's
-- pins. RLS on with no client policy; read and written only through
-- app/api/my-stuff with the service role, which only ever touches the
-- signed-in resident's own rows.
--
-- Additive only. Safe to run before the code deploys.

CREATE TABLE IF NOT EXISTS member_pins (
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('member', 'contact', 'document')),
  item_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, item_type, item_id)
);
ALTER TABLE member_pins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_pins') THEN
    RAISE EXCEPTION 'FAIL: member_pins missing';
  END IF;
  RAISE NOTICE 'OK: 136 My Stuff pins applied.';
END $$;
