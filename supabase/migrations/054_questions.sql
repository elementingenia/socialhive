-- 054_questions.sql
--
-- In-App Questions — Slice 2 (scope: Social_Hive_Questions_Scope.md).
-- Directed, private, bounded Q&A. A resident asks a question tagged with the
-- context it was asked in; it routes to that context's accountable answerer(s)
-- (admins for Home; hub/club Owners; event ECs — see lib/questionRouting.js).
--
-- Bounded 4-state lifecycle (kept deliberately un-chatty):
--   open      → awaiting first answer   (only answerers may reply → answered)
--   answered  → asker may post ONE follow-up (→ followup)
--   followup  → answerers may post ONE response (→ closed, auto-close)
--   closed    → no further replies
--
-- RLS: both tables are locked to service-role only (no client policies). All
-- reads/writes go through the /api/questions routes, which enforce answerer
-- eligibility server-side (too dynamic for row policies). supabase-js with the
-- service-role key bypasses RLS.

CREATE TABLE IF NOT EXISTS questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asker_member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  context_type     TEXT NOT NULL CHECK (context_type IN ('general', 'hub', 'club', 'event')),
  context_key      TEXT,                       -- null for general; 'movie'/'social' for hub; club id / event id otherwise
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'followup', 'closed')),
  answered_by      UUID REFERENCES members(id) ON DELETE SET NULL,
  answered_at      TIMESTAMPTZ,
  asker_seen_at    TIMESTAMPTZ,                 -- null = asker hasn't seen the latest answerer activity (drives their badge)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_context ON questions(context_type, context_key);
CREATE INDEX IF NOT EXISTS idx_questions_asker   ON questions(asker_member_id);
CREATE INDEX IF NOT EXISTS idx_questions_status  ON questions(status);

CREATE TABLE IF NOT EXISTS question_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  member_id    UUID REFERENCES members(id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  is_answer    BOOLEAN NOT NULL DEFAULT false,   -- true = written by an answerer, false = asker follow-up
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_replies_q ON question_replies(question_id);

ALTER TABLE questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_replies ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny all direct client access; the service-role API
-- routes are the only door (they check answerer eligibility per request).
