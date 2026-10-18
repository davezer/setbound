/**
 * Strict parser for Topps entertainment checklist tables.
 * Accepts explicit printed card number, product type and subject columns.
 * Ambiguous free text is rejected instead of silently becoming a card.
 */


const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const CODE = /^[A-Z0-9][A-Z0-9._/-]{0,23}$/i;
const TYPE = /^(?:card|sticker)$/i;
const TRAILER = /^(?:puzzle|coupon|checklist|game|back|front|variation)$/i;

function isHeader(line) {
  return /^(?:card\s*#|card\s*number|product\s*type|checklists?\s+provided\s+by|subject\s+to\s+change)/i.test(line);
}

function parseLine(line) {
  const columns = line.split(/\t+/).map(clean).filter(Boolean);
  if (columns.length >= 4 && CODE.test(columns[0]) && TYPE.test(columns[1])) {
    const number = columns[0];
    const type = columns[1];
    const section = columns[2];
    const tail = columns.slice(3);
    if (tail.length > 1 && TRAILER.test(tail.at(-1))) tail.pop();
    const subject = clean(tail.join(' '));
    if (section && subject && !isHeader(subject)) return { number, type, section, subject };
  }
  // The source's visual columns may have been flattened into ordinary spaces.
  // Unlike a broad regex, this requires a known terminal column marker.
  const match = line.match(/^([A-Z0-9][A-Z0-9._/-]{0,23})\s+(Card|Sticker)\s+(\S+)\s+(.+?)\s+(Puzzle|Coupon|Checklist|Game|Back|Front|Variation)(?:\s+.*)?$/i);
  if (!match || !CODE.test(match[1])) return null;
  return { number: match[1], type: match[2], section: match[3], subject: clean(match[4]) };
}

export function parseToppsEntertainmentPdfText(source) {
  const lines = String(source || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cards = [];
  const rejected = [];
  let candidates = 0;
  for (const line of lines) {
    if (isHeader(line)) continue;
    const row = parseLine(line);
    if (row) {
      candidates++;
      cards.push({
        card_number: row.number,
        subject: row.subject,
        affiliation: 'NIL',
        affiliation_id: null,
        affiliation_status: 'source-nil',
        rookie: false,
        autograph: false,
        memorabilia: false,
        serial_number: null,
        variation: null,
        checklist_name: row.section,
        confidence: 0.99,
        raw: line
      });
    } else if (/^[A-Z0-9][A-Z0-9._/-]{0,23}\s+(?:Card|Sticker)\b/i.test(line)) {
      rejected.push(line);
    }
  }
  if (!cards.length) throw new Error('Entertainment checklist layout not recognized: no unambiguous card rows. Import remains blocked.');
  if (rejected.length) throw new Error(`Entertainment checklist has ${rejected.length} ambiguous row(s), e.g. "${rejected[0].slice(0,100)}". Import remains blocked until the layout is supported.`);
  const sections = [...new Set(cards.map((c) => c.checklist_name))];
  const checklist_meta = Object.fromEntries(sections.map((section) => [section, {
    card_count_declared: cards.filter((c) => c.checklist_name === section).length,
    parallels: [], notes: []
  }]));
  return { cards, sections, checklist_meta, metaSections: sections.length,
    high: cards.length, review: 0, lines: lines.length,
    sourceKind: 'topps-entertainment-pdf', parserStats: { candidates, rejected: rejected.length } };
}
