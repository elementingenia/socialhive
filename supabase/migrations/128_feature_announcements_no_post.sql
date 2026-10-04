-- Migration 128: New Features -- "Approve, don't post" (Iain, 2026-10-05:
-- "there needs to be an option to approve and NOT post. Small changes are
-- often not needed to be included and would be excess noise").
-- Additive: widens the status CHECK with one new value. 'approved_no_post'
-- means the write-up was reviewed and accepted, but it is never put in a PDF
-- or notified -- the daily cron only ever picks status = 'approved'.
-- Run BEFORE the app code deploys (the new button writes this value).
ALTER TABLE feature_announcements DROP CONSTRAINT IF EXISTS feature_announcements_status_check;
ALTER TABLE feature_announcements ADD CONSTRAINT feature_announcements_status_check
  CHECK (status IN ('draft', 'approved', 'approved_no_post', 'announced', 'rejected'));
