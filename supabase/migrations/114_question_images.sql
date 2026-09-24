-- 114_question_images.sql
--
-- Photos on In-App Questions (Iain, 2026-09-25): "We need to include the
-- ability for residents to send images to others when asking questions ...
-- all ask options, ask on home page, ask in contacts, in owners for hubs and
-- coordinators of events. Max 3 images and must be treated for sizing as
-- part of the process." Agreed same day: replies in the thread can carry
-- photos too (max 3 per message).
--
-- One row per stored photo. reply_id NULL = attached to the original
-- question; set = attached to that reply. Both FKs cascade, so withdrawing a
-- question removes its rows (the API removes the Storage files first -- a
-- row cascade can't reach Storage).
--
-- Service-role only, same as questions/question_replies (054): RLS on, no
-- policies. All access goes through /api/questions, which checks asker /
-- answerer eligibility per request.
--
-- Also creates the PRIVATE `question-images` Storage bucket. Private (not
-- public like event/news images) because questions are a private channel;
-- the thread view hands out 1-hour signed URLs. Every stored file is
-- server-resized webp (lib/imageResize.js), so the bucket only accepts webp
-- and caps files at 5MB as a backstop.
--
-- Additive only: new table + new bucket, nothing existing changes. Safe to
-- run before the code deploys.

BEGIN;

CREATE TABLE IF NOT EXISTS question_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reply_id      UUID REFERENCES question_replies(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  position      SMALLINT NOT NULL DEFAULT 0,
  uploaded_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_images_question ON question_images(question_id);
CREATE INDEX IF NOT EXISTS idx_question_images_reply    ON question_images(reply_id);

ALTER TABLE question_images ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service-role API routes are the only door.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('question-images', 'question-images', false, 5242880, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'question-images' AND public = false) THEN
    RAISE EXCEPTION 'question-images bucket missing or public';
  END IF;
  RAISE NOTICE 'OK: question_images table + private question-images bucket ready.';
END $$;
