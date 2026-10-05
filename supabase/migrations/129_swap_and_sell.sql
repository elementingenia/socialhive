-- 129_swap_and_sell.sql
--
-- Swap & Sell (Element_Happenings_Swap_and_Sell_Scope_Answered, Iain
-- 2026-10-05). Residents list things For sale, Free, or Wanted; buyers and
-- sellers talk in private one-listing conversations. Discreet: nothing is
-- broadcast when something is listed, except to residents who have Joined
-- Swap & Sell (hub_followers, hub_type 'swap' -- no new table needed).
--
--   * Privacy (hide_name) does NOT apply in this hub -- display names are
--     always shown. A Private resident acknowledges that once
--     (members.swap_privacy_ack_at) before their first listing or message.
--   * Active listings per resident are capped by an admin setting
--     (hub_settings.swap_listing_cap, starts at 2).
--   * Admins read a conversation only once it has been reported
--     (swap_conversations.reported_at).
--
-- HIDDEN BY DEFAULT: hub_settings 'swap' is seeded with enabled=false
-- (Preview) and production_enabled=false (Production) -- same two-flag
-- pattern as Happenings News (migration 112).
--
-- All tables are RLS-locked with NO policies: every read and write goes
-- through service-role API routes that check the caller is the seller, the
-- buyer, or an admin on a reported item.
--
-- ============================================================================
-- SAFE TO RUN ON LIVE PRODUCTION. Purely additive. Run BEFORE the code
-- deploys (the new routes select these tables/columns).
-- ============================================================================
--
-- ACTION NEEDED OUTSIDE THIS MIGRATION: create a PUBLIC Storage bucket named
-- 'swap-and-sell-images' in the Supabase dashboard. Photo upload fails until
-- it exists.
--
-- Run in the Supabase SQL editor. Safe to run repeatedly.

BEGIN;

-- ── hub_settings: listing cap + hidden-by-default row ───────────────────────
ALTER TABLE hub_settings ADD COLUMN IF NOT EXISTS swap_listing_cap INTEGER NOT NULL DEFAULT 2
  CHECK (swap_listing_cap BETWEEN 1 AND 20);

INSERT INTO hub_settings (hub_type, enabled, production_enabled, swap_listing_cap)
VALUES ('swap', false, false, 2)
ON CONFLICT (hub_type) DO NOTHING;

-- ── members: one-time "privacy doesn't apply here" acknowledgement ─────────
-- Not added to the browser column GRANT (migration 121) on purpose -- only
-- the server reads it.
ALTER TABLE members ADD COLUMN IF NOT EXISTS swap_privacy_ack_at TIMESTAMPTZ;

-- ── swap_listings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swap_listings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('sale', 'free', 'wanted')),
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  description         TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
  -- For sale only: whole dollars, or "Offers". Free/Wanted carry neither.
  price_dollars       INTEGER CHECK (price_dollars IS NULL OR price_dollars BETWEEN 0 AND 100000),
  price_is_offers     BOOLEAN NOT NULL DEFAULT false,
  category            TEXT NOT NULL,
  condition           TEXT CHECK (condition IS NULL OR condition IN ('new', 'like_new', 'good', 'fair')),
  status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'gone')),
  main_photo_id       UUID, -- FK added below once swap_listing_photos exists
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  expiry_reminded_at  TIMESTAMPTZ,
  gone_at             TIMESTAMPTZ,
  hidden_at           TIMESTAMPTZ,
  hidden_by           UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT swap_listings_price_only_for_sale CHECK (
    type = 'sale' OR (price_dollars IS NULL AND price_is_offers = false)
  ),
  CONSTRAINT swap_listings_sale_has_price CHECK (
    type <> 'sale' OR price_dollars IS NOT NULL OR price_is_offers = true
  )
);
CREATE INDEX IF NOT EXISTS idx_swap_listings_browse ON swap_listings(status, expires_at, created_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_swap_listings_member ON swap_listings(member_id);

-- ── swap_listing_photos ─────────────────────────────────────────────────────
-- Up to 4 per listing (enforced in application code, same as every other
-- "max N" rule in this app).
CREATE TABLE IF NOT EXISTS swap_listing_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES swap_listings(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_swap_listing_photos_listing ON swap_listing_photos(listing_id, position);

ALTER TABLE swap_listings DROP CONSTRAINT IF EXISTS swap_listings_main_photo_fkey;
ALTER TABLE swap_listings ADD CONSTRAINT swap_listings_main_photo_fkey
  FOREIGN KEY (main_photo_id) REFERENCES swap_listing_photos(id) ON DELETE SET NULL;

-- ── swap_conversations: one per listing + buyer ─────────────────────────────
CREATE TABLE IF NOT EXISTS swap_conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id           UUID NOT NULL REFERENCES swap_listings(id) ON DELETE CASCADE,
  buyer_id             UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  seller_id            UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  last_message_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  buyer_last_read_at   TIMESTAMPTZ,
  seller_last_read_at  TIMESTAMPTZ,
  reported_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT swap_conversations_one_per_buyer UNIQUE (listing_id, buyer_id),
  CONSTRAINT swap_conversations_not_self CHECK (buyer_id <> seller_id)
);
CREATE INDEX IF NOT EXISTS idx_swap_conversations_buyer ON swap_conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_conversations_seller ON swap_conversations(seller_id, last_message_at DESC);

-- ── swap_messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swap_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES swap_conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body             TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_swap_messages_conversation ON swap_messages(conversation_id, created_at);

-- ── swap_reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swap_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID REFERENCES swap_listings(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES swap_conversations(id) ON DELETE CASCADE,
  reporter_id      UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reason           TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT swap_reports_has_target CHECK (listing_id IS NOT NULL OR conversation_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_swap_reports_open ON swap_reports(created_at DESC) WHERE resolved_at IS NULL;

-- ── swap_blocks: residents an admin has stopped from listing ───────────────
CREATE TABLE IF NOT EXISTS swap_blocks (
  member_id   UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  blocked_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  reason      TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS: locked, service-role only ──────────────────────────────────────────
ALTER TABLE swap_listings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_listing_photos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_blocks          ENABLE ROW LEVEL SECURITY;

-- ─── VERIFY ──────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hub_settings
    WHERE hub_type = 'swap' AND enabled = false AND production_enabled = false AND swap_listing_cap = 2
  ) THEN
    -- An existing 'swap' row from a re-run keeps whatever an admin set; only
    -- fail if the row is missing outright.
    IF NOT EXISTS (SELECT 1 FROM hub_settings WHERE hub_type = 'swap') THEN
      RAISE EXCEPTION 'FAIL: hub_settings row for swap was not created';
    END IF;
  END IF;

  FOREACH t IN ARRAY ARRAY['swap_listings','swap_listing_photos','swap_conversations','swap_messages','swap_reports','swap_blocks'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      RAISE EXCEPTION 'FAIL: % was not created', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = t) THEN
      RAISE EXCEPTION 'FAIL: RLS not enabled on %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t) THEN
      RAISE EXCEPTION 'FAIL: % has a policy -- it must be service-role only', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'swap_privacy_ack_at') THEN
    RAISE EXCEPTION 'FAIL: members.swap_privacy_ack_at was not created';
  END IF;

  RAISE NOTICE 'OK: Swap & Sell tables created (RLS-locked), hub_settings swap row hidden in both environments, listing cap column added. Remember to create the public swap-and-sell-images Storage bucket.';
END $$;

COMMIT;
