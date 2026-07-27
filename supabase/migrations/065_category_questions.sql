-- 065_category_questions.sql
--
-- Ask a Contact Category (Questions, Slice 4) + unanswered-question escalation.
-- Scope: Social_Hive_Category_Questions_Scope.md (decisions locked 2026-07-27).
--
-- Three additive changes. All safe to run BEFORE the code deploys:
--   1. questions.context_type gains 'category'  — widens a CHECK, rejects nothing existing
--   2. contact_categories.askable              — new column, defaults true
--   3. questions.escalated_at                  — new nullable column
--
-- Run in the Supabase SQL editor (DDL can't be applied over the REST API).

-- ─── 1. NEW ROUTING TARGET: 'category' ──────────────────────────────────────
-- A question can now be addressed to a Contacts category (e.g. "Committee",
-- "Social Hive"). context_key holds the contact_categories.id as text, the
-- same pattern clubs already use.
--
-- The constraint is dropped and recreated rather than altered — Postgres has
-- no ALTER ... CHECK. Widening only: every existing row still satisfies it.

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_context_type_check;

ALTER TABLE questions ADD CONSTRAINT questions_context_type_check
  CHECK (context_type IN ('general', 'hub', 'club', 'event', 'category'));


-- ─── 2. ASKABLE CATEGORIES ──────────────────────────────────────────────────
-- Replaces the name-based `lower(name) = 'residents'` hardcodes that already
-- exist in app/api/info/contact-categories/route.js (DELETE guard) and
-- CategoryManager — an explicit flag rather than a magic string, and it lets
-- an admin make any future category non-askable without a deploy.
--
-- Defaults true so existing and future categories are askable unless someone
-- says otherwise. Note this flag is necessary but NOT sufficient: a category
-- is only offered as a question target if it ALSO contains at least one
-- active member with an app login (enforced server-side in
-- lib/questionRouting.js + POST /api/questions — see scope §3).

ALTER TABLE contact_categories
  ADD COLUMN IF NOT EXISTS askable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN contact_categories.askable IS
  'Can residents send an in-app Question to this category? Residents is false: '
  'it is a directory of everyone, not an accountable group — asking it would be '
  'a community broadcast, which belongs to the Community Notice Hub instead. '
  'A category still needs >=1 member with a login to actually be offered.';

-- Residents holds every active member (implicitly, per migration 029) plus
-- login-less residents. Asking it would notify ~34 people with nobody
-- accountable for replying. Excluded by policy (Iain, 2026-07-27; scope §4).
UPDATE contact_categories
   SET askable = false
 WHERE lower(name) = 'residents';


-- ─── 3. UNANSWERED-QUESTION ESCALATION (Slice D) ────────────────────────────
-- Dedup marker for app/api/cron/question-escalation-check: a question still
-- 'open' with no answer after 5 days notifies all admins ONCE, then stamps
-- this column so the daily cron never re-notifies. Same once-only pattern as
-- bookings.book_return_reminded_at (migration 041).
--
-- Applies to every context type, not just 'category' — a club or event
-- question can black-hole just as easily; category is only what surfaced it.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN questions.escalated_at IS
  'Set once when an unanswered question was escalated to admins by the daily '
  'cron. NULL = not yet escalated. Prevents repeat notifications.';

-- Partial index: the cron only ever scans un-escalated open questions.
CREATE INDEX IF NOT EXISTS idx_questions_unescalated
  ON questions (created_at)
  WHERE status = 'open' AND escalated_at IS NULL;


-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: Residents askable=false, all others true.
--   SELECT name, askable FROM contact_categories ORDER BY display_order;
-- Expected: both columns present.
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'questions' AND column_name = 'escalated_at';
