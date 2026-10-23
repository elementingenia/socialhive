-- 141_hive_funds.sql
--
-- Hive Funds ledger (Iain, 2026-10-23, Element_Happenings_Hive_Funds_
-- Transparency_Scope_Answered). Residents question event costs because they
-- never see where the money goes. This records what the Hive holds, what it
-- spends and what carries over between events.
--
-- Design: ONE ledger per fund, not a chain of event totals. Every movement
-- of money is a dated line, tied to an event or not. Every figure on screen
-- is derived from it (lib/hiveFunds.js), so two events planned at once can
-- never double count the same starting money.
--
-- Collected-from-residents is NOT stored: it is worked out live from the
-- existing bookings.amount_paid records (lib/payments.js paymentSummary),
-- and snapshotted only when an event's finances are finalised.
--
-- Built for Social Hive only, but keyed by fund_key so another hub can get
-- its own fund later with no schema change.
--
-- All three tables are service-role only (RLS on, no policies); every read
-- and write goes through app/api/hive-funds. Grants per Coding Standard #10
-- (from 30 Oct 2026 Supabase stops auto-granting new tables).
--
-- Additive. Safe to run before the code deploys. Safe to run repeatedly.

BEGIN;

-- One row per fund. audience = who can see the ledger:
--   off      -- nobody (default; switched in Admin > Hub Settings)
--   managers -- admins, this hub's Owners and its Event Coordinators
--   all      -- every signed-in resident
CREATE TABLE IF NOT EXISTS public.hive_funds (
  fund_key    TEXT PRIMARY KEY,
  audience    TEXT NOT NULL DEFAULT 'off' CHECK (audience IN ('off', 'managers', 'all')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.members(id) ON DELETE SET NULL
);

INSERT INTO public.hive_funds (fund_key, audience) VALUES ('social', 'off')
ON CONFLICT (fund_key) DO NOTHING;

-- Every money movement. kind:
--   opening -- the declared starting balance (one live row per fund)
--   income  -- money in between events (no event_id)
--   expense -- money out; with event_id = an event outgoing, without = between events
-- amount is always positive; kind gives the direction.
-- Soft delete (deleted_at) keeps the record for transparency.
CREATE TABLE IF NOT EXISTS public.hive_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_key          TEXT NOT NULL REFERENCES public.hive_funds(fund_key),
  kind              TEXT NOT NULL CHECK (kind IN ('opening', 'income', 'expense')),
  amount            NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  entry_date        DATE NOT NULL,
  description       TEXT NOT NULL CHECK (length(trim(description)) > 0),
  event_id          UUID REFERENCES public.events(id) ON DELETE SET NULL,
  receipt_url       TEXT,
  receipt_file_name TEXT,
  created_by        UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES public.members(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by        UUID REFERENCES public.members(id) ON DELETE SET NULL,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT hive_ledger_income_no_event CHECK (kind <> 'income' OR event_id IS NULL),
  CONSTRAINT hive_ledger_opening_no_event CHECK (kind <> 'opening' OR event_id IS NULL)
);

CREATE INDEX IF NOT EXISTS hive_ledger_fund_idx  ON public.hive_ledger (fund_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS hive_ledger_event_idx ON public.hive_ledger (event_id) WHERE deleted_at IS NULL;
-- Only one live starting balance per fund.
CREATE UNIQUE INDEX IF NOT EXISTS hive_ledger_one_opening
  ON public.hive_ledger (fund_key) WHERE kind = 'opening' AND deleted_at IS NULL;

-- Per-event finance state: the plus/minus adjustment (kept separate so the
-- automatic Collected figure is never overwritten) and the Finalise lock.
-- collected_snapshot / refunds_owed_snapshot freeze the figures at finalise
-- so later Paid/Unpaid changes can't silently move a closed event.
CREATE TABLE IF NOT EXISTS public.hive_event_finance (
  event_id            UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  fund_key            TEXT NOT NULL REFERENCES public.hive_funds(fund_key),
  adjustment          NUMERIC(10,2) NOT NULL DEFAULT 0,
  adjustment_note     TEXT,
  adjustment_by       UUID REFERENCES public.members(id) ON DELETE SET NULL,
  adjustment_at       TIMESTAMPTZ,
  finalised_at        TIMESTAMPTZ,
  finalised_by        UUID REFERENCES public.members(id) ON DELETE SET NULL,
  collected_snapshot  NUMERIC(10,2),
  reopened_at         TIMESTAMPTZ,
  reopened_by         UUID REFERENCES public.members(id) ON DELETE SET NULL,
  reopen_reason       TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hive_event_finance_adjustment_note CHECK (adjustment = 0 OR length(trim(coalesce(adjustment_note, ''))) > 0)
);

ALTER TABLE public.hive_funds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hive_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hive_event_finance ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_funds         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_ledger        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_event_finance TO service_role;
REVOKE ALL ON public.hive_funds         FROM anon, authenticated;
REVOKE ALL ON public.hive_ledger        FROM anon, authenticated;
REVOKE ALL ON public.hive_event_finance FROM anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hive_funds', 'hive_ledger', 'hive_event_finance'] LOOP
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION '141: service_role is missing privileges on %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '141: anon/authenticated should have no access to %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
