PRAGMA foreign_keys = ON;

-- 1) Make sure the baseball historical alias still resolves to the current MLB franchise.
INSERT OR IGNORE INTO affiliation_franchise_aliases
  (sport_id, alias_name, alias_normalized, canonical_affiliation_id)
SELECT
  bs.id,
  'New York Giants',
  'new york giants',
  sf.id
FROM sports bs
JOIN affiliations sf
  ON sf.name = 'San Francisco Giants'
WHERE bs.slug = 'baseball';

-- 2) Repair any baseball cards that may still point directly at a "New York Giants"
-- affiliation. Baseball cards should display the historical label, but belong to
-- the San Francisco Giants franchise bucket.
UPDATE cards
SET
  affiliation_id = (
    SELECT sf.id
    FROM affiliations sf
    WHERE sf.name = 'San Francisco Giants'
    LIMIT 1
  ),
  affiliation_label = COALESCE(NULLIF(affiliation_label, ''), 'New York Giants')
WHERE affiliation_id IN (
  SELECT nyg.id
  FROM affiliations nyg
  WHERE nyg.normalized_name = 'new york giants'
)
AND product_id IN (
  SELECT p.id
  FROM products p
  JOIN sports s ON s.id = p.sport_id
  WHERE s.slug = 'baseball'
)
AND EXISTS (
  SELECT 1 FROM affiliations sf WHERE sf.name = 'San Francisco Giants'
);

-- 3) The actual "New York Giants" affiliation row now belongs to football.
-- Baseball no longer needs its own row because historical baseball usage resolves
-- through affiliation_franchise_aliases above.
UPDATE affiliations
SET
  sport_id = (SELECT id FROM sports WHERE slug = 'football'),
  league = 'NFL',
  type = 'team'
WHERE normalized_name = 'new york giants';

-- If no New York Giants affiliation exists yet, create the football one.
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
