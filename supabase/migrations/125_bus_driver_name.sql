-- 125: Bus driver can be a named non-resident ("Other"), e.g. the Community
-- Manager (Iain, 2026-10-04). events.bus_driver_id stays the resident option;
-- bus_driver_name is the free-text option. Never both.
-- Additive and safe to run before the code deploys.

ALTER TABLE events ADD COLUMN IF NOT EXISTS bus_driver_name text;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_bus_driver_one_kind;
ALTER TABLE events ADD CONSTRAINT events_bus_driver_one_kind
  CHECK (bus_driver_id IS NULL OR bus_driver_name IS NULL);
