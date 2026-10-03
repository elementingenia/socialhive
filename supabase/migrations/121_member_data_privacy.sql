-- 121_member_data_privacy.sql  (BUG-072, 2026-10-03)
--
-- Confirmed live 2026-10-03 with a throwaway non-admin account:
--   * members_read (migration 001) let ANY signed-in resident read EVERY
--     column of EVERY member -- including pin (stored as plain text) and
--     auth_email. Login derives the Supabase password from the PIN
--     ("<pin>_hive"), so any resident could sign in as any admin.
--   * Private (hide_name) residents' phone/email/house number were masked
--     on screen only; the real values were in every browser response.
--   * contacts, contact categories, documents and DVD/book loans had
--     no-role RLS read rules, so they were readable with NO login at all
--     using the public anon key shipped in the website (144 contacts rows,
--     61 with phone numbers).
--
-- Fix:
--   1. members: the browser (anon/authenticated) may only SELECT the
--      columns listed below. pin, auth_email, phone, email, house_number
--      are server-only now (service role is unaffected). Info > Contacts,
--      Info > Interests and the resident pickers read through API routes
--      that mask Private residents (lib/directoryPrivacy.js).
--      NOTE for future migrations: a NEW members column is NOT readable from
--      the browser until it is added to the GRANT below.
--   2. contacts: browser may read id/name/title/order/active/member_id only
--      (booking lists embed contact names); phone/email/house_number are
--      server-only.
--   3. Logged-out (anon) can no longer read contacts, contact categories,
--      documents, document categories or loans. All their readers are
--      signed-in pages. events/clubs/locations/hub_settings stay readable
--      for the public /cal calendar and login page.
--
-- Additive in effect for the app once the matching code is deployed. Run
-- AFTER the code deploy: the old Contacts/Interests pages read these
-- columns from the browser and would show blanks until the new code is live.

BEGIN;

-- 1. members ------------------------------------------------------------
REVOKE SELECT ON members FROM anon;
REVOKE SELECT ON members FROM authenticated;
GRANT SELECT (
  id, auth_id, name, username, status, is_admin, joined_date, created_at,
  legacy_id, avatar_url, bar_opt_in, show_name_on_bookings, last_active_at,
  hide_name, must_change_pin, display_name, is_test, weekly_digest
) ON members TO authenticated;

-- 2. contacts -----------------------------------------------------------
REVOKE SELECT ON contacts FROM anon;
REVOKE SELECT ON contacts FROM authenticated;
GRANT SELECT (id, name, title, display_order, active, created_at, member_id)
  ON contacts TO authenticated;

-- 3. signed-in only -----------------------------------------------------
REVOKE SELECT ON contact_categories, contact_category_members,
                 documents, document_categories, document_category_links,
                 book_loans, dvd_loans
  FROM anon;

-- Self-check: abort (and roll back) if any of this didn't take.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['pin','auth_email','phone','email','house_number'] LOOP
    IF has_column_privilege('authenticated', 'public.members', c, 'SELECT') THEN
      RAISE EXCEPTION '121: authenticated can still read members.%', c;
    END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['phone','email','house_number'] LOOP
    IF has_column_privilege('authenticated', 'public.contacts', c, 'SELECT') THEN
      RAISE EXCEPTION '121: authenticated can still read contacts.%', c;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.members', 'is_admin', 'SELECT') THEN
    RAISE EXCEPTION '121: authenticated lost members.is_admin (RLS policies need it)';
  END IF;
  IF has_table_privilege('anon', 'public.contacts', 'SELECT')
     OR has_table_privilege('anon', 'public.documents', 'SELECT') THEN
    RAISE EXCEPTION '121: anon can still read contacts/documents';
  END IF;
END $$;

COMMIT;
