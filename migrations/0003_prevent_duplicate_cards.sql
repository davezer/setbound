PRAGMA foreign_keys = ON;

-- Remove exact duplicate card rows created by repeated imports.
-- Keep the oldest copy of each logical card.
DELETE FROM cards
WHERE id NOT IN (
  SELECT MIN(id)
  FROM cards
  GROUP BY
    product_id,
    checklist_id,
    subject_id,
    IFNULL(affiliation_id, -1),
    card_number,
    rookie,
    autograph,
    memorabilia,
    IFNULL(serial_number, -1),
    IFNULL(variation, '')
);

-- Database-level safety net: the same logical card cannot be inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_unique_identity
ON cards (
  product_id,
  checklist_id,
  subject_id,
  IFNULL(affiliation_id, -1),
  card_number,
  rookie,
  autograph,
  memorabilia,
  IFNULL(serial_number, -1),
  IFNULL(variation, '')
);
