-- Migration 035: self-service phone number
-- Phone previously lived only on `contacts`, admin-editable per resident via
-- the Contacts / Admin > Members "Edit Resident" panel — residents had no
-- way to set their own number, unlike name/email/house_number which are
-- self-service in Profile and merely overlaid read-only in the Contacts
-- editor (see migration 030). This brings phone in line with that pattern:
-- members.phone becomes the single source of truth, self-service via
-- Profile, and the Contacts editor switches to displaying it read-only.
--
-- Backfill: copy across any phone number an admin already entered on a
-- resident's linked contacts row, so no existing data is lost.

ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;

UPDATE members m
SET phone = c.phone
FROM contacts c
WHERE c.member_id = m.id
  AND c.phone IS NOT NULL
  AND m.phone IS NULL;

-- contacts.phone is left in place — still the live field for standalone
-- (non-member) contacts such as the Community Manager, which have no
-- members row to source from.
