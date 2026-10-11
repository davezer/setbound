PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  format_key TEXT NOT NULL,
  label TEXT NOT NULL,
  details TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, format_key)
);

CREATE INDEX IF NOT EXISTS idx_product_formats_product
ON product_formats(product_id, sort_order);
