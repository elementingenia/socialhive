-- Migration 013: Add email + hide_name to members for self-serve profile
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS hide_name BOOLEAN NOT NULL DEFAULT false;
