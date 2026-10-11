PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS odds_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  original_filename TEXT,
  source_url TEXT,
  disclaimer TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_odds_sources_product
ON odds_sources(product_id);

CREATE TABLE IF NOT EXISTS odds_formats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES odds_sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, name)
);

CREATE INDEX IF NOT EXISTS idx_odds_formats_source
ON odds_formats(source_id, sort_order);

CREATE TABLE IF NOT EXISTS odds_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES odds_sources(id) ON DELETE CASCADE,
  checklist_id INTEGER REFERENCES checklists(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_odds_entries_source
ON odds_entries(source_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_odds_entries_checklist
ON odds_entries(checklist_id);

CREATE TABLE IF NOT EXISTS odds_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES odds_entries(id) ON DELETE CASCADE,
  format_id INTEGER NOT NULL REFERENCES odds_formats(id) ON DELETE CASCADE,
  odds_text TEXT NOT NULL,
  denominator INTEGER,
  UNIQUE(entry_id, format_id)
);

CREATE INDEX IF NOT EXISTS idx_odds_values_entry
ON odds_values(entry_id);

CREATE INDEX IF NOT EXISTS idx_odds_values_format
ON odds_values(format_id);
