-- 133: drop plain-text members.pin (Iain, 2026-10-09).
--
-- Every PIN was converted to members.pin_hash on 2026-10-09 (0 plain-text
-- PINs left, verified). Run this AFTER the PR that stops the app reading
-- members.pin has deployed -- the PR #212 code still selects it.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM members WHERE pin IS NOT NULL AND pin_hash IS NULL) THEN
    RAISE EXCEPTION 'Refusing to drop members.pin: some members have a plain PIN and no hash';
  END IF;
END $$;

ALTER TABLE members DROP COLUMN IF EXISTS pin;
