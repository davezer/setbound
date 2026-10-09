PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS manufacturers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL DEFAULT 'official',
  source_url TEXT,
  original_filename TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_id INTEGER NOT NULL REFERENCES sports(id),
  manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id),
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  primary_source_id INTEGER REFERENCES sources(id),
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'checklist',
  parent_checklist_id INTEGER REFERENCES checklists(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id,slug)
);
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  subject_type TEXT NOT NULL DEFAULT 'athlete'
);
CREATE TABLE IF NOT EXISTS affiliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  sport_id INTEGER REFERENCES sports(id),
  league TEXT,
  type TEXT NOT NULL DEFAULT 'team',
  aliases_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  affiliation_id INTEGER REFERENCES affiliations(id),
  card_number TEXT NOT NULL,
  sort_key TEXT NOT NULL,
  rookie INTEGER NOT NULL DEFAULT 0,
  autograph INTEGER NOT NULL DEFAULT 0,
  memorabilia INTEGER NOT NULL DEFAULT 0,
  serial_number INTEGER,
  variation TEXT,
  notes TEXT,
  confidence REAL,
  raw_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cards_product ON cards(product_id);
CREATE INDEX IF NOT EXISTS idx_cards_checklist ON cards(checklist_id);
CREATE INDEX IF NOT EXISTS idx_cards_subject ON cards(subject_id);
CREATE INDEX IF NOT EXISTS idx_cards_affiliation ON cards(affiliation_id);
CREATE INDEX IF NOT EXISTS idx_cards_number ON cards(card_number);
CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(normalized_name);
