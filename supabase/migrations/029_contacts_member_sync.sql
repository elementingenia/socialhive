-- Migration 029: Contacts / Members sync
-- Purpose: eliminate double data entry between `members` and `contacts`.
-- All active members are now implicitly "Residents" contacts, computed live
-- by the app (no duplicate row is stored for them). This migration only adds
-- what's needed to support that: the Residents category itself, and a place
-- to store EXTRA category assignments for a member (e.g. tagging a resident
-- as also "Committee"). The `contacts` table remains unchanged and is used
-- only for real non-member contacts (e.g. Community Manager).

-- ─── RESIDENTS CATEGORY ─────────────────────────────────────────────────────
-- display_order -1 so it always sorts first, ahead of existing categories.
INSERT INTO contact_categories (name, display_order)
SELECT 'Residents', -1
WHERE NOT EXISTS (SELECT 1 FROM contact_categories WHERE lower(name) = 'residents');

-- ─── MEMBER CATEGORIES (junction) ───────────────────────────────────────────
-- Extra category assignments for a member, beyond the automatic "Residents"
-- tag (which is never stored — it's implicit for every active member).
CREATE TABLE IF NOT EXISTS member_categories (
  member_id   UUID NOT NULL REFERENCES members(id)            ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES contact_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, category_id)
);

ALTER TABLE member_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_categories_read"        ON member_categories FOR SELECT USING (true);
CREATE POLICY "member_categories_admin_write" ON member_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── CLEANUP ────────────────────────────────────────────────────────────────
-- "Iain Pallot" was manually added as a standalone contact before this
-- migration — he's a real member, so he'll now appear automatically via the
-- computed Residents list instead. Remove the manual duplicate.
DELETE FROM contacts WHERE id = '1de3432b-6fd9-4a98-aa77-7672667b12b3';
