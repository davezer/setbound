PRAGMA foreign_keys = ON;

-- Harden the New York Giants repair against old rows whose normalized_name
-- may not exactly equal "new york giants".

-- Baseball historical usage should belong to the current SF Giants franchise.
UPDATE cards
SET
  affiliation_id = (
    SELECT id
    FROM affiliations
    WHERE lower(trim(name)) = 'san francisco giants'
    LIMIT 1
  ),
  affiliation_label = COALESCE(NULLIF(affiliation_label, ''), 'New York Giants')
WHERE product_id IN (
  SELECT p.id
  FROM products p
  JOIN sports s ON s.id = p.sport_id
  WHERE s.slug = 'baseball'
)
AND affiliation_id IN (
  SELECT id
  FROM affiliations
  WHERE lower(trim(name)) = 'new york giants'
     OR lower(trim(normalized_name)) IN ('new york giants', 'new-york-giants')
)
AND EXISTS (
  SELECT 1
  FROM affiliations
  WHERE lower(trim(name)) = 'san francisco giants'
);

-- The globally unique real affiliation row is the current NFL team.
UPDATE affiliations
SET
  name = 'New York Giants',
  normalized_name = 'new york giants',
  sport_id = (SELECT id FROM sports WHERE slug = 'football'),
  league = 'NFL',
  type = 'team'
WHERE lower(trim(name)) = 'new york giants'
   OR lower(trim(normalized_name)) IN ('new york giants', 'new-york-giants');

-- If that row somehow does not exist, create it.
INSERT OR IGNORE INTO affiliations
  (name, normalized_name, sport_id, league, type, aliases_json)
SELECT
  'New York Giants',
  'new york giants',
  id,
  'NFL',
  'team',
  '[]'
FROM sports
WHERE slug = 'football';

-- Ensure Baseball + New York Giants remains a historical alias to SF.
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id)
SELECT
  baseball.id,
  'New York Giants',
  'new york giants',
  sf.id
FROM sports baseball
JOIN affiliations sf
  ON lower(trim(sf.name)) = 'san francisco giants'
WHERE baseball.slug = 'baseball';
