PRAGMA foreign_keys = ON;

-- Historical aliases (e.g. Montréal Expos) should preserve the source label.
-- Source shorthand aliases (e.g. Pittsburgh) should resolve to the canonical
-- team name without displaying the shorthand publicly.
ALTER TABLE affiliation_franchise_aliases
ADD COLUMN preserve_source_label INTEGER NOT NULL DEFAULT 1;

-- Ensure the current MLB teams used by our safe shorthand mappings exist.
INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Pittsburgh Pirates', 'pittsburgh pirates', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Atlanta Braves', 'atlanta braves', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Baltimore Orioles', 'baltimore orioles', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Boston Red Sox', 'boston red sox', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Cincinnati Reds', 'cincinnati reds', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Cleveland Guardians', 'cleveland guardians', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Colorado Rockies', 'colorado rockies', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Detroit Tigers', 'detroit tigers', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Houston Astros', 'houston astros', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Kansas City Royals', 'kansas city royals', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Miami Marlins', 'miami marlins', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Milwaukee Brewers', 'milwaukee brewers', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Minnesota Twins', 'minnesota twins', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Philadelphia Phillies', 'philadelphia phillies', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'San Diego Padres', 'san diego padres', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'San Francisco Giants', 'san francisco giants', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Seattle Mariners', 'seattle mariners', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'St. Louis Cardinals', 'st louis cardinals', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Tampa Bay Rays', 'tampa bay rays', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Texas Rangers', 'texas rangers', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Toronto Blue Jays', 'toronto blue jays', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Washington Nationals', 'washington nationals', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Arizona Diamondbacks', 'arizona diamondbacks', id, 'MLB', 'team', '[]'
FROM sports WHERE slug = 'baseball';

-- Safe, unambiguous MLB shorthand mappings.
-- We intentionally do NOT add New York, Chicago, or Los Angeles because those
-- city names are ambiguous within MLB.
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Pittsburgh', 'pittsburgh', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Pittsburgh Pirates';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Atlanta', 'atlanta', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Atlanta Braves';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Baltimore', 'baltimore', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Baltimore Orioles';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Boston', 'boston', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Boston Red Sox';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Cincinnati', 'cincinnati', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Cincinnati Reds';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Cleveland', 'cleveland', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Cleveland Guardians';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Colorado', 'colorado', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Colorado Rockies';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Detroit', 'detroit', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Detroit Tigers';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Houston', 'houston', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Houston Astros';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Kansas City', 'kansas city', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Kansas City Royals';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Miami', 'miami', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Miami Marlins';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Milwaukee', 'milwaukee', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Milwaukee Brewers';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Minnesota', 'minnesota', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Minnesota Twins';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Philadelphia', 'philadelphia', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Philadelphia Phillies';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'San Diego', 'san diego', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'San Diego Padres';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'San Francisco', 'san francisco', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'San Francisco Giants';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Seattle', 'seattle', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Seattle Mariners';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'St. Louis', 'st louis', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'St. Louis Cardinals';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Tampa Bay', 'tampa bay', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Tampa Bay Rays';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Texas', 'texas', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Texas Rangers';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Toronto', 'toronto', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Toronto Blue Jays';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Washington', 'washington', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Washington Nationals';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Arizona', 'arizona', a.id, 0
FROM sports s, affiliations a
WHERE s.slug = 'baseball' AND a.name = 'Arizona Diamondbacks';
