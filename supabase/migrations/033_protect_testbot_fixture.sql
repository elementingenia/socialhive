-- 033_protect_testbot_fixture.sql
-- The E2E test suite (tests/e2e/, .github/workflows/e2e.yml) logs in as a
-- fixture member 'testbot' (tests/e2e/auth.setup.js). That row was deleted
-- at some point with no error and no alert -- CI silently failed on every
-- run for the entire visible run history (confirmed via GitHub Actions API,
-- not assumed) before anyone noticed, because a missing test account fails
-- quietly rather than loudly.
--
-- This trigger makes that specific failure mode impossible: deleting the
-- 'testbot' member row is blocked at the DB level, regardless of whether the
-- delete comes from the app, the Supabase dashboard, or a service-role
-- script. If testbot's credentials ever need to change, UPDATE the row
-- (pin, status, is_admin) -- deletion is the only blocked operation.
--
-- To intentionally retire this fixture later: DROP TRIGGER first, then delete.

CREATE OR REPLACE FUNCTION protect_testbot_fixture()
RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(OLD.username) = 'testbot' THEN
    RAISE EXCEPTION 'Refusing to delete the testbot E2E fixture account (members.username = testbot). This account is required by tests/e2e/auth.setup.js and .github/workflows/e2e.yml. If you really need to remove it, DROP TRIGGER protect_testbot_fixture_trigger ON members; first.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_testbot_fixture_trigger ON members;
CREATE TRIGGER protect_testbot_fixture_trigger
  BEFORE DELETE ON members
  FOR EACH ROW
  EXECUTE FUNCTION protect_testbot_fixture();
