-- Migration 002: profile fields + Community Bar tables
-- Run in Supabase SQL Editor

-- ─── MEMBERS — new columns ──────────────────────────────────────────────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS house_number TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS bar_opt_in   BOOLEAN DEFAULT false;

-- ─── BAR PRODUCTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bar_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(6,2) NOT NULL CHECK (price >= 0),
  category    TEXT NOT NULL CHECK (category IN ('beer', 'wine', 'spirits', 'soft')),
  icon        TEXT NOT NULL DEFAULT '🍺',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bar_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bar_products_read" ON bar_products
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bar_products_admin_write" ON bar_products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

-- ─── BAR TABS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bar_tabs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES bar_products(id) ON DELETE RESTRICT,
  quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  consumed_at         TIMESTAMPTZ DEFAULT NOW(),
  reconciliation_id   UUID,  -- FK added after bar_reconciliations is created
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bar_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bar_tabs_own_read" ON bar_tabs
  FOR SELECT USING (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );
CREATE POLICY "bar_tabs_own_insert" ON bar_tabs
  FOR INSERT WITH CHECK (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  );
CREATE POLICY "bar_tabs_own_delete" ON bar_tabs
  FOR DELETE USING (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
    AND reconciliation_id IS NULL  -- can only delete unreconciled entries
  );
CREATE POLICY "bar_tabs_admin_write" ON bar_tabs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

-- ─── BAR RECONCILIATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bar_reconciliations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  created_by    UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bar_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bar_reconciliations_read" ON bar_reconciliations
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "bar_reconciliations_admin_write" ON bar_reconciliations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

-- Add FK from bar_tabs to bar_reconciliations now that the table exists
ALTER TABLE bar_tabs
  ADD CONSTRAINT bar_tabs_reconciliation_fk
  FOREIGN KEY (reconciliation_id) REFERENCES bar_reconciliations(id) ON DELETE SET NULL;
