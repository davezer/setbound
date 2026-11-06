-- Setbound SEO recovery: navigation history only. Does not change cards, sets, or subjects.
CREATE TABLE IF NOT EXISTS seo_redirects (
  old_path TEXT PRIMARY KEY,
  new_path TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (substr(old_path, 1, 1) = '/' AND substr(new_path, 1, 1) = '/'),
  CHECK (old_path <> new_path)
);

CREATE INDEX IF NOT EXISTS idx_seo_redirects_new_path ON seo_redirects(new_path);

-- Capture FUTURE slug changes, including changes made outside the admin UI.
-- Existing historical slugs cannot be reconstructed reliably and can be entered in /admin/seo.
CREATE TRIGGER IF NOT EXISTS setbound_product_slug_redirect
AFTER UPDATE OF slug ON products
WHEN OLD.slug <> NEW.slug AND OLD.published = 1
BEGIN
  INSERT INTO seo_redirects (old_path, new_path, reason)
  VALUES ('/sets/' || OLD.slug, '/sets/' || NEW.slug, 'product-slug-change')
  ON CONFLICT(old_path) DO UPDATE SET
    new_path = excluded.new_path,
    reason = excluded.reason,
    updated_at = datetime('now');
END;
