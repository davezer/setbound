PRAGMA foreign_keys = ON;

ALTER TABLE cards ADD COLUMN affiliation_label TEXT;

CREATE TABLE IF NOT EXISTS affiliation_franchise_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_id INTEGER NOT NULL REFERENCES sports(id),
  alias_name TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  canonical_affiliation_id INTEGER NOT NULL REFERENCES affiliations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sport_id, alias_normalized)
);

CREATE INDEX IF NOT EXISTS idx_affiliation_franchise_aliases_lookup
  ON affiliation_franchise_aliases(sport_id, alias_normalized);

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Washington Nationals','washington nationals',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'San Francisco Giants','san francisco giants',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Los Angeles Dodgers','los angeles dodgers',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Atlanta Braves','atlanta braves',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Milwaukee Brewers','milwaukee brewers',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Baltimore Orioles','baltimore orioles',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Houston Astros','houston astros',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Cleveland Guardians','cleveland guardians',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Miami Marlins','miami marlins',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Tampa Bay Rays','tampa bay rays',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Los Angeles Angels','los angeles angels',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

INSERT OR IGNORE INTO affiliations (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'New York Yankees','new york yankees',id,'MLB','team','[]'
FROM sports WHERE slug='baseball';

UPDATE affiliations
SET sport_id=(SELECT id FROM sports WHERE slug='baseball'),
    league=COALESCE(league,'MLB'),
    type='team'
WHERE name IN (
  'Washington Nationals','San Francisco Giants','Los Angeles Dodgers',
  'Atlanta Braves','Milwaukee Brewers','Baltimore Orioles','Houston Astros',
  'Cleveland Guardians','Miami Marlins','Tampa Bay Rays',
  'Los Angeles Angels','New York Yankees'
)
AND sport_id IS NULL;

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Montréal Expos','montreal expos',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Washington Nationals';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Montreal Expos','montreal expos',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Washington Nationals';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'New York Giants','new york giants',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='San Francisco Giants';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Brooklyn Dodgers','brooklyn dodgers',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Los Angeles Dodgers';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Boston Braves','boston braves',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Atlanta Braves';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Milwaukee Braves','milwaukee braves',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Atlanta Braves';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Seattle Pilots','seattle pilots',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Milwaukee Brewers';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'St. Louis Browns','st louis browns',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Baltimore Orioles';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Houston Colt .45s','houston colt 45s',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Houston Astros';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Cleveland Indians','cleveland indians',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Cleveland Guardians';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Florida Marlins','florida marlins',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Miami Marlins';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Tampa Bay Devil Rays','tampa bay devil rays',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Tampa Bay Rays';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'California Angels','california angels',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Los Angeles Angels';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Anaheim Angels','anaheim angels',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Los Angeles Angels';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'Los Angeles Angels of Anaheim','los angeles angels of anaheim',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='Los Angeles Angels';

INSERT OR IGNORE INTO affiliation_franchise_aliases (sport_id,alias_name,alias_normalized,canonical_affiliation_id)
SELECT s.id,'New York Highlanders','new york highlanders',a.id FROM sports s, affiliations a
WHERE s.slug='baseball' AND a.name='New York Yankees';
