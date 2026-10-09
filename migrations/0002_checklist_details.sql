PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS checklist_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL UNIQUE REFERENCES checklists(id) ON DELETE CASCADE,
  card_count_declared INTEGER,
  parallels_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
