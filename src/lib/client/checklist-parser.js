const ROOKIE_MARKERS = /\b(rookie|rc)\b/i;
const AUTO_MARKERS = /\b(auto|autos|autograph|autographs|autographed)\b/i;
const MEM_MARKERS = /\b(relic|relics|memorabilia|mem|patch|patches|jersey|jerseys)\b/i;
const CARD_START = /^\s*([A-Z0-9][A-Z0-9._\-/]{0,24})\s+(.+)$/i;
const PAGE_NOISE = /^(checklists provided by|page\s+\d+|copyright|topps\b)/i;
const HEADING_HINT = /\b(base|cards?|variations?|inserts?|autographs?|autos?|relics?|memorabilia|parallels?|chrome|mini|short prints?|sp|image variations?|signatures?|patches?|rookies?|stars?|set|checklist|breakout|prospects?|draft|debut|sapphire|diamond)\b/i;
const PARALLEL_LABEL = /^(parallels?|parallel details?)\s*:?$/i;
const DECLARED_COUNT = /^(\d{1,6})\s+cards?\.?$/i;
const YEAR_HEADING = /^(?:19|20)\d{2}\s+(.+)$/;
const ORDINAL_HEADING = /^(\d{1,4}(?:ST|ND|RD|TH))\s+(.+)$/i;

export function normalizeText(value = '') {
  return value
    .replace(/[®™©]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function uppercaseRatio(value) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (!letters) return 0;
  return [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
}

function looksLikeYearHeading(line) {
  const match = line.match(YEAR_HEADING);
  if (!match) return false;

  const rest = match[1].trim();
  if (!rest || rest.length > 90 || rest.split(/\s+/).length > 10) return false;

  return uppercaseRatio(rest) > 0.84;
}

function looksLikeOrdinalHeading(line) {
  const match = line.match(ORDINAL_HEADING);
  if (!match) return false;

  const rest = match[2].trim();
  if (!rest || rest.length > 90 || rest.split(/\s+/).length > 10) return false;

  // Examples from official manufacturer PDFs:
  // "75TH DIAMOND AUTOGRAPHS"
  // "25TH ANNIVERSARY AUTOGRAPHS"
  // These look like card rows because the ordinal can be parsed as a card number.
  // A short, strongly-uppercase phrase after an ordinal is treated as a section header.
  return uppercaseRatio(rest) > 0.84;
}

function looksLikeHeading(line) {
  if (!line || line.length > 100) return false;
  if (PAGE_NOISE.test(line) || PARALLEL_LABEL.test(line)) return false;

  if (looksLikeYearHeading(line) || looksLikeOrdinalHeading(line)) return true;
  if (/^\d/.test(line)) return false;

  const upperRatio = uppercaseRatio(line);

  if (/\bchecklist\b/i.test(line) && line.split(' ').length <= 10) return true;

  return upperRatio > 0.84 && (HEADING_HINT.test(line) || line.split(' ').length <= 8);
}

function affiliationMatch(text, affiliations) {
  const haystack = normalizeText(text).toLowerCase();
  let best = null;

  for (const item of affiliations) {
    const candidates = [item.name, ...(item.aliases || [])].filter(Boolean);

    for (const candidate of candidates) {
      const needle = normalizeText(candidate).toLowerCase();

      if (
        needle &&
        haystack.endsWith(needle) &&
        (!best || needle.length > best.needle.length)
      ) {
        best = {
          item,
          needle,
          source: text.slice(text.length - candidate.length)
        };
      }
    }
  }

  return best;
}

function parseSerial(text) {
  const match = text.match(/(?:#?\s*\/\s*|numbered\s+to\s+)(\d{1,6})\b/i);
  return match ? Number(match[1]) : null;
}

function parseCard(line, section, affiliations) {
  const m = line.match(CARD_START);
  if (!m) return null;

  const cardNumber = m[1];
  let rest = normalizeText(m[2]);

  if (!/\d/.test(cardNumber) && !cardNumber.includes('-')) return null;

  // Safety nets for headings that superficially resemble numbered card rows.
  if (/^(?:19|20)\d{2}$/.test(cardNumber) && uppercaseRatio(rest) > 0.84) return null;
  if (/^\d{1,4}(?:ST|ND|RD|TH)$/i.test(cardNumber) && uppercaseRatio(rest) > 0.84) return null;

  const flags = {
    rookie: ROOKIE_MARKERS.test(rest),
    autograph: AUTO_MARKERS.test(`${section} ${rest}`),
    memorabilia: MEM_MARKERS.test(`${section} ${rest}`)
  };

  rest = rest
    .replace(/\bRookie\b/gi, '')
    .replace(/\bRC\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const affiliation = affiliationMatch(rest, affiliations);

  let subject = rest;
  let affiliationValue = 'NIL';
  let affiliationId = null;
  let confidence = 0.78;

  if (affiliation) {
    subject = rest
      .slice(0, rest.length - affiliation.source.length)
      .replace(/\s+-\s*$/, '')
      .trim();

    affiliationValue = affiliation.item.name;
    affiliationId = affiliation.item.id ?? null;
    confidence += 0.14;
  } else {
    confidence -= 0.04;
  }

  if (/^[A-Z0-9][A-Z0-9-]*$/i.test(cardNumber)) confidence += 0.04;
  if (flags.rookie) confidence += 0.02;
  if (!subject || subject.length < 2) confidence = 0.35;

  return {
    card_number: cardNumber,
    subject,
    affiliation: affiliationValue,
    affiliation_id: affiliationId,
    rookie: flags.rookie,
    autograph: flags.autograph,
    memorabilia: flags.memorabilia,
    serial_number: parseSerial(line),
    checklist_name: section || 'Uncategorized',
    confidence: Math.min(.99, Number(confidence.toFixed(2))),
    raw: line
  };
}

function ensureMeta(meta, section) {
  if (!meta[section]) {
    meta[section] = {
      card_count_declared: null,
      parallels: [],
      notes: []
    };
  }

  return meta[section];
}

export function parseChecklistText(text, affiliations = []) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean);

  const sections = [];
  const cards = [];
  const checklist_meta = {};

  let section = 'Uncategorized';
  let captureParallels = false;

  ensureMeta(checklist_meta, section);

  for (const line of lines) {
    if (PAGE_NOISE.test(line)) continue;

    if (PARALLEL_LABEL.test(line)) {
      captureParallels = true;
      ensureMeta(checklist_meta, section);
      continue;
    }

    const countMatch = line.match(DECLARED_COUNT);

    if (countMatch) {
      ensureMeta(checklist_meta, section).card_count_declared = Number(countMatch[1]);
      continue;
    }

    if (looksLikeHeading(line)) {
      section = line.replace(/^INSERT$/i, 'Inserts');
      captureParallels = false;

      if (!sections.includes(section)) sections.push(section);

      ensureMeta(checklist_meta, section);
      continue;
    }

    const card = parseCard(line, section, affiliations);

    if (card) {
      captureParallels = false;
      cards.push(card);
      continue;
    }

    if (captureParallels) {
      const meta = ensureMeta(checklist_meta, section);

      if (line.length <= 240 && !meta.parallels.includes(line)) {
        meta.parallels.push(line);
      }
    }
  }

  const high = cards.filter((c) => c.confidence >= .85).length;
  const review = cards.filter((c) => c.confidence < .85).length;
  const metaSections = Object.values(checklist_meta)
    .filter((m) => m.parallels.length || m.card_count_declared)
    .length;

  return {
    sections,
    cards,
    checklist_meta,
    metaSections,
    high,
    review,
    lines: lines.length
  };
}

export function groupByChecklist(cards) {
  return cards.reduce((acc, card) => {
    (acc[card.checklist_name] ||= []).push(card);
    return acc;
  }, {});
}
