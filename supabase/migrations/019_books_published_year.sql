-- Migration 019: Add published_year to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS published_year INTEGER;
