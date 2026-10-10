PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN release_date TEXT;
ALTER TABLE products ADD COLUMN product_notes TEXT;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS collection_cards (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('owned','wanted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_cards_user_status ON collection_cards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_cards_card ON collection_cards(card_id);
