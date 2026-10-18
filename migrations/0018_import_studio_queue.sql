-- Durable metadata index. Complete parsed snapshots are stored in R2, never inline in D1.
CREATE TABLE IF NOT EXISTS studio_intake_queue (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL,
  card_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  blob_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_studio_queue_updated ON studio_intake_queue(updated_at DESC);
