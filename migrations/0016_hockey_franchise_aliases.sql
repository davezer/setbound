PRAGMA foreign_keys = ON;

-- Historical NHL franchise names should stay visible on the card while
-- grouping under the current franchise for browsing/filtering.
--
-- affiliation_franchise_aliases is sport-aware, so "Colorado Rockies"
-- here does NOT conflict with the current MLB Colorado Rockies.

-- Ensure canonical current NHL franchises exist.
INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'New Jersey Devils', 'new jersey devils', id, 'NHL', 'team', '[]'
FROM sports WHERE slug = 'hockey';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Colorado Avalanche', 'colorado avalanche', id, 'NHL', 'team', '[]'
FROM sports WHERE slug = 'hockey';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Carolina Hurricanes', 'carolina hurricanes', id, 'NHL', 'team', '[]'
FROM sports WHERE slug = 'hockey';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Dallas Stars', 'dallas stars', id, 'NHL', 'team', '[]'
FROM sports WHERE slug = 'hockey';

INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT 'Winnipeg Jets', 'winnipeg jets', id, 'NHL', 'team', '[]'
FROM sports WHERE slug = 'hockey';

-- Fill missing metadata for already-existing rows.
UPDATE affiliations
SET
  sport_id = (SELECT id FROM sports WHERE slug = 'hockey'),
  league = COALESCE(league, 'NHL'),
  type = 'team'
WHERE name IN (
  'New Jersey Devils',
  'Colorado Avalanche',
  'Carolina Hurricanes',
  'Dallas Stars',
  'Winnipeg Jets'
)
AND sport_id IS NULL;

-- Kansas City Scouts -> Colorado Rockies -> New Jersey Devils
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Kansas City Scouts', 'kansas city scouts', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'New Jersey Devils';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Colorado Rockies', 'colorado rockies', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'New Jersey Devils';

-- Quebec Nordiques -> Colorado Avalanche
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Quebec Nordiques', 'quebec nordiques', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'Colorado Avalanche';

INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Québec Nordiques', 'quebec nordiques', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'Colorado Avalanche';

-- Hartford Whalers -> Carolina Hurricanes
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Hartford Whalers', 'hartford whalers', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'Carolina Hurricanes';

-- Minnesota North Stars -> Dallas Stars
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Minnesota North Stars', 'minnesota north stars', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'Dallas Stars';

-- Atlanta Thrashers -> current Winnipeg Jets
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id, preserve_source_label)
SELECT s.id, 'Atlanta Thrashers', 'atlanta thrashers', a.id, 1
FROM sports s, affiliations a
WHERE s.slug = 'hockey' AND a.name = 'Winnipeg Jets';
