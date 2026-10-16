CREATE TABLE IF NOT EXISTS source_harvester_cache (
  page_url TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  year INTEGER,
  title TEXT,
  entry_json TEXT NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_source_harvester_cache_source_year
  ON source_harvester_cache(source, year);

CREATE INDEX IF NOT EXISTS idx_source_harvester_cache_scanned_at
  ON source_harvester_cache(scanned_at);
