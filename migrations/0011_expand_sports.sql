PRAGMA foreign_keys = ON;

-- Expand Setbound's sport taxonomy for the historical catalog.
-- INSERT OR IGNORE keeps this safe on databases that already contain any of these.

INSERT OR IGNORE INTO sports (name, slug, sort_order) VALUES
  ('Soccer', 'soccer', 6),
  ('Golf', 'golf', 7),
  ('MMA', 'mma', 8),
  ('Boxing', 'boxing', 9),
  ('Racing', 'racing', 10),
  ('Tennis', 'tennis', 11),
  ('Lacrosse', 'lacrosse', 12),
  ('Cricket', 'cricket', 13),
  ('Multi-Sport', 'multi-sport', 14),
  ('Non-Sport', 'non-sport', 15),
  ('Other', 'other', 99);
