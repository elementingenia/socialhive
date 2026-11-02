-- 148_trade_recommendations.sql
--
-- Recommend a Trade (Iain, 2026-11-03,
-- Element_Happenings_Recommend_a_Trade_Scope_Answered). Residents add a
-- trade contact through a guided flow; it goes straight onto Info >
-- Contacts > Trades. The person who adds it is the locked first
-- recommender; other residents can add themselves as "Recommended by".
--
-- Trades stay ordinary rows in `contacts`, linked to the existing "Trades"
-- contact category, so there is still one list to look at.
--
-- New tables are service-role only (RLS on, no policies); every read and
-- write goes through app/api/trades. Grants per Coding Standard #10.
-- The new contacts columns are NOT added to the browser column grant from
-- migration 121 -- the browser never reads them directly.
--
-- Additive. Safe to run before the code deploys. Safe to run repeatedly.

BEGIN;

-- Admin-editable list of trade types (Q1). "Something else" is free text
-- stored straight on contacts.trade_type; admins can add it to this list.
CREATE TABLE IF NOT EXISTS public.trade_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_types_name_key ON public.trade_types (lower(name));

INSERT INTO public.trade_types (name) VALUES
  ('Electrician'), ('Plumber'), ('Painter'), ('Handyman'), ('Gardener / Lawns'),
  ('Cleaner'), ('Air-con'), ('Carpenter'), ('Tiler'), ('Locksmith'),
  ('Pest control'), ('Computer / TV help')
ON CONFLICT DO NOTHING;

-- Trade details on the contact itself.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS trade_type    TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS added_by      UUID REFERENCES public.members(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.contacts.trade_type    IS 'Trades only: the kind of trade (a trade_types name or free text).';
COMMENT ON COLUMN public.contacts.business_name IS 'Trades only: business name, optional.';
COMMENT ON COLUMN public.contacts.added_by      IS 'Trades only: resident who added it through Recommend a Trade. Null = admin-added.';

-- One row per resident per trade. is_original = the locked first
-- recommender (Q4: can't withdraw; only an admin removes the trade).
CREATE TABLE IF NOT EXISTS public.trade_recommendations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES public.members(id)  ON DELETE CASCADE,
  is_original BOOLEAN NOT NULL DEFAULT false,
  note        TEXT CHECK (note IS NULL OR length(note) <= 150),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, member_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_recommendations_one_original
  ON public.trade_recommendations (contact_id) WHERE is_original;
CREATE INDEX IF NOT EXISTS trade_recommendations_member_idx
  ON public.trade_recommendations (member_id);

ALTER TABLE public.trade_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_recommendations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_types           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_recommendations TO service_role;

-- The switch (Q2): off / admins / everyone. 'trades' hub_settings row only.
ALTER TABLE public.hub_settings ADD COLUMN IF NOT EXISTS trades_mode TEXT NOT NULL DEFAULT 'off';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_settings_trades_mode_check') THEN
    ALTER TABLE public.hub_settings ADD CONSTRAINT hub_settings_trades_mode_check
      CHECK (trades_mode IN ('off', 'admins', 'everyone'));
  END IF;
END $$;
INSERT INTO public.hub_settings (hub_type, trades_mode) VALUES ('trades', 'off')
ON CONFLICT (hub_type) DO NOTHING;

-- Backfill the existing trades' type from their Title (Q9: they stay
-- admin-added, no recommender).
UPDATE public.contacts c
   SET trade_type = trim(c.title)
  FROM public.contact_category_members ccm
  JOIN public.contact_categories cat ON cat.id = ccm.category_id
 WHERE ccm.contact_id = c.id
   AND lower(cat.name) = 'trades'
   AND c.trade_type IS NULL
   AND c.title IS NOT NULL AND trim(c.title) <> '';

COMMIT;
