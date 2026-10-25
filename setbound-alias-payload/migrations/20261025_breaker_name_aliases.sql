-- Verified mapping for Breaker Name List exports only; original subject/card records never change.
CREATE TABLE IF NOT EXISTS breaker_name_aliases (
  alias_key TEXT PRIMARY KEY,
  alias_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
