-- Migration 010: bar_member_payments
-- Tracks per-member payment status within a reconciliation period.
-- Simple model: once admin marks a member paid, a row is inserted here.

CREATE TABLE IF NOT EXISTS bar_member_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES bar_reconciliations(id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  total_amount      NUMERIC(8,2) NOT NULL,
  paid_at           TIMESTAMPTZ DEFAULT NOW(),
  recorded_by       UUID REFERENCES members(id) ON DELETE SET NULL,
  UNIQUE (reconciliation_id, member_id)
);

ALTER TABLE bar_member_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bar_member_payments_admin_all" ON bar_member_payments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "bar_member_payments_own_read" ON bar_member_payments
  FOR SELECT USING (
    member_id = (SELECT id FROM members WHERE auth_id = auth.uid())
  );
