-- 037_events_payments_reconciliation.sql
--
-- Adds a lightweight "reconciled" stamp to events, supporting the Social
-- payments Reconciliation Summary + Close Out feature (idea 1 of
-- Social_Hive_Event_Payments_Discussion.docx, 2026-07-12).
--
-- Unlike the Community Bar's reconciliation model (bar_reconciliations +
-- bar_tabs.reconciliation_id, a running tab reconciled periodically),
-- Social event payments already live directly on bookings.payment_status --
-- an event is a one-off, not a recurring tab. So this doesn't need a
-- separate reconciliation table: a single timestamp + who-did-it on the
-- event itself is enough to record "an EC has run Close Out on this event's
-- payments". Close Out is re-runnable (each run reminds whoever is still
-- unpaid at that moment) -- this column just tracks the most recent run for
-- display ("Reconciled 12 Jul 2026 by Iain"), not a lock.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS payments_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payments_reconciled_by UUID REFERENCES members(id);
