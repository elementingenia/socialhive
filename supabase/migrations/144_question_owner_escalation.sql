-- 144_question_owner_escalation.sql
--
-- Unanswered questions now escalate in two steps (Iain, 2026-10-26):
--   day 5  -> the event's parent club/hub Owner(s), when someone other than
--             the original recipients is there to ask
--   day 10 -> every admin (escalated_at, unchanged meaning)
-- Prompted by a Craft & Coffee event question that went straight from the
-- event coordinator to all 9 admins, skipping the club's Owner.
--
-- Additive nullable column on an existing table: no new grants needed.
-- Run BEFORE the code deploys -- the escalation cron selects this column.

BEGIN;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS owner_escalated_at timestamptz;

COMMIT;
