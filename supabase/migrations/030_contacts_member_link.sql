-- Migration 030: link contacts directly to members
-- Supersedes the member_categories approach from migration 029 (that table
-- is still empty in production — safe to drop). A resident only gets a real
-- row in `contacts` once an admin edits their Title/Role, Phone, or extra
-- categories from the Contacts or Admin > Members screen (the API upserts
-- it on first edit). That row's own name/email/house_number columns are
-- never trusted/displayed for member-linked rows — the app always overlays
-- the live members.name/email/house_number instead, so there's no
-- duplicate-data-entry risk; title/phone/categories are genuinely extra
-- info that doesn't exist anywhere else, so storing them here is fine.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_member_id_unique
  ON contacts(member_id) WHERE member_id IS NOT NULL;

-- member_categories was created in migration 029 but never used (0 rows) —
-- extra category assignments for a resident now live in the standard
-- contact_category_members table via that resident's linked contacts row.
DROP TABLE IF EXISTS member_categories;
