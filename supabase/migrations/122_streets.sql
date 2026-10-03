-- 122_streets.sql  (2026-10-03)
--
-- Street names + numbers-only house numbers.
--
-- Why (Iain, 2026-10-03): a resident saved her house number as "92 Mosaic".
-- House numbers here are spread around the village with no real order, so
-- residents give directions by street. Admins now keep a set list of street
-- names (Admin > Streets) and residents pick theirs from it -- they can't
-- type one in. House numbers become whole numbers only, with no upper limit,
-- so the app works for other communities too.
--
-- 1. streets: the admin-managed list. Names are unique, ignoring case and
--    spaces at either end. Server-only, like members' contact details after
--    migration 121: the browser reads it through /api/streets.
-- 2. members.street_id + contacts.street_id. ON DELETE RESTRICT: a street
--    that is still in use can't be deleted (rename it instead). /api/streets
--    checks this first and says who is still using it.
--    NOTE: street_id is deliberately NOT added to migration 121's members/
--    contacts column GRANT -- like house_number, it's only sent to the
--    browser by server routes that mask Private residents.
-- 3. Tidy existing house numbers, then enforce "blank or a whole number"
--    with a CHECK on both tables. Checked live before writing this: only
--    two values break the rule -- Julie Fletcher's "92 Mosaic" (Malcolm
--    Fletcher is at 92) and empty strings, which become NULL.
--
-- Run BEFORE deploying the matching code: the new code reads street_id.
-- Safe to run before migration 121 or after it.

BEGIN;

-- 1. streets ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS streets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS streets_name_unique ON streets (lower(btrim(name)));
ALTER TABLE streets ENABLE ROW LEVEL SECURITY;   -- no policies: server only
REVOKE ALL ON streets FROM anon, authenticated;

-- 2. street_id on members and contacts --------------------------------------
ALTER TABLE members  ADD COLUMN IF NOT EXISTS street_id uuid REFERENCES streets(id) ON DELETE RESTRICT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street_id uuid REFERENCES streets(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS members_street_id_idx  ON members (street_id);
CREATE INDEX IF NOT EXISTS contacts_street_id_idx ON contacts (street_id);

-- 3. tidy house numbers, then enforce digits only --------------------------
UPDATE members SET house_number = '92' WHERE house_number = '92 Mosaic';

UPDATE members  SET house_number = NULLIF(btrim(house_number), '') WHERE house_number <> btrim(house_number) OR btrim(house_number) = '';
UPDATE contacts SET house_number = NULLIF(btrim(house_number), '') WHERE house_number <> btrim(house_number) OR btrim(house_number) = '';
-- "007" -> "7" (numeric sort and matching treat them as the same house)
UPDATE members  SET house_number = ltrim(house_number, '0') WHERE house_number ~ '^0+[1-9][0-9]*$';
UPDATE contacts SET house_number = ltrim(house_number, '0') WHERE house_number ~ '^0+[1-9][0-9]*$';

-- Stop (and roll back) rather than silently wipe anything else unexpected.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT house_number, ', ') INTO bad FROM (
    SELECT house_number FROM members  WHERE house_number IS NOT NULL AND house_number !~ '^[1-9][0-9]{0,5}$'
    UNION ALL
    SELECT house_number FROM contacts WHERE house_number IS NOT NULL AND house_number !~ '^[1-9][0-9]{0,5}$'
  ) x;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '122: fix these house numbers by hand first: %', bad;
  END IF;
END $$;

ALTER TABLE members  DROP CONSTRAINT IF EXISTS members_house_number_digits;
ALTER TABLE members  ADD  CONSTRAINT members_house_number_digits
  CHECK (house_number IS NULL OR house_number ~ '^[1-9][0-9]{0,5}$');
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_house_number_digits;
ALTER TABLE contacts ADD  CONSTRAINT contacts_house_number_digits
  CHECK (house_number IS NULL OR house_number ~ '^[1-9][0-9]{0,5}$');

COMMIT;
