-- Add location fields to events (used by Social and Outings hubs)
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE events ADD COLUMN IF NOT EXISTS location      TEXT;

-- Constraint: onsite or offsite
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_location_type_check;
ALTER TABLE events ADD CONSTRAINT events_location_type_check
  CHECK (location_type IN ('onsite', 'offsite'));
