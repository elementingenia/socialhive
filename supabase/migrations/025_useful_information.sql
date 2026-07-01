-- Migration 025: Useful Information hub
-- Tables: document_categories, documents, contact_categories, contacts, contact_category_members

-- ─── DOCUMENT CATEGORIES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  display_order INTEGER     NOT NULL DEFAULT 0,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO document_categories (name, display_order) VALUES
  ('General Documents', 0),
  ('Policy Documents',  1),
  ('Committee Meetings',2);

ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_categories_read"        ON document_categories FOR SELECT USING (true);
CREATE POLICY "doc_categories_admin_write" ON document_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── DOCUMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT,
  category_id   UUID        REFERENCES document_categories(id) ON DELETE SET NULL,
  file_url      TEXT        NOT NULL,
  file_name     TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  uploaded_by   UUID        REFERENCES members(id) ON DELETE SET NULL,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_read"        ON documents FOR SELECT USING (active = true);
CREATE POLICY "documents_admin_write" ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── CONTACT CATEGORIES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  display_order INTEGER     NOT NULL DEFAULT 0,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO contact_categories (name, display_order) VALUES
  ('Committee',   0),
  ('Social Hive', 1);

ALTER TABLE contact_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_categories_read"        ON contact_categories FOR SELECT USING (true);
CREATE POLICY "contact_categories_admin_write" ON contact_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── CONTACTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  title         TEXT,
  phone         TEXT,
  email         TEXT,
  house_number  TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_read"        ON contacts FOR SELECT USING (active = true);
CREATE POLICY "contacts_admin_write" ON contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);

-- ─── CONTACT CATEGORY MEMBERS (junction) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_category_members (
  contact_id  UUID NOT NULL REFERENCES contacts(id)           ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES contact_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, category_id)
);

ALTER TABLE contact_category_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ccm_read"        ON contact_category_members FOR SELECT USING (true);
CREATE POLICY "ccm_admin_write" ON contact_category_members FOR ALL USING (
  EXISTS (SELECT 1 FROM members WHERE auth_id = auth.uid() AND is_admin = true)
);
