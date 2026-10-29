-- 145: "Driver doesn't pay" toggle on the bus driver (Iain, 2026-10-29).
-- When on, the event's resident bus driver rides free: ONE seat on their own
-- booking isn't charged (lib/payments.js payableSeats). Anyone else they
-- book for still pays. Only meaningful with a resident driver
-- (bus_driver_id); the API stores false otherwise.
-- Additive, defaults false (current behaviour) -- safe to run before deploy,
-- but the new code selects this column, so run it BEFORE merging the PR.
-- Existing table: no new grants needed (Coding Standard #10 covers new tables).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS bus_driver_free boolean NOT NULL DEFAULT false;
