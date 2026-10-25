-- Optional beta permission. Existing Collector/Admin accounts stay unchanged.
ALTER TABLE users ADD COLUMN is_breaker INTEGER NOT NULL DEFAULT 0;
