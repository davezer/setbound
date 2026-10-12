const ROOKIE_MARKERS = /\b(rookie|rc)\b/i;
const AUTO_MARKERS = /\b(auto|autos|autograph|autographs|autographed)\b/i;
const MEM_MARKERS = /\b(relic|relics|memorabilia|mem|patch|patches|jersey|jerseys)\b/i;
const CARD_START = /^\s*([A-Z0-9][A-Z0-9._\-/]{0,24})\s+(.+)$/i;

const PAGE_NOISE =
  /^(checklists provided by|page\s+\d+\b|copyright\b|topps\s+(?:company|checklist\s+provided|all rights reserved)\b)/i;

const HEADING_HINT =
  /\b(base|cards?|variations?|inserts?|autographs?|autos?|relics?|memorabilia|parallels?|chrome|mini|short prints?|sp|image variations?|signatures?|patches?|rookies?|stars?|set|checklist|breakout|prospects?|draft|debut|sapphire|diamond|expose)\b/i;

const PARALLEL_LABEL = /^(parallels?|parallel details?)\s*:?$/i;
const DECLARED_COUNT = /^(\d{1,6})\s+cards?\.?$/i;
const YEAR_HEADING = /^(?:19|20)\d{2}\s+(.+)$/;
const ORDINAL_HEADING = /^(\d{1,4}(?:ST|ND|RD|TH))\s+(.+)$/i;
const NUMERIC_HEADING = /^(\d{1,4})\s+(.+)$/;
const UNRESOLVED = 'UNRESOLVED';
const SOURCE_NIL = '__SOURCE_NIL__';

function normalizeChunk(value = '') {
  return String(value)
    .replace(/[®™©]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

export function normalizeText(value = '') {
  return String(value)
    .split(/\t/)
    .map(normalizeChunk)
    .join('\t')
    .replace(/\t{3,}/g, '\t\t')
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
  return Boolean(rest && rest.length <= 90 && rest.split(/\s+/).length <= 10 && uppercaseRatio(rest) > 0.84);
}

function looksLikeOrdinalHeading(line) {
  const match = line.match(ORDINAL_HEADING);
  if (!match) return false;
  const rest = match[2].trim();
  return Boolean(rest && rest.length <= 90 && rest.split(/\s+/).length <= 10 && uppercaseRatio(rest) > 0.84);
}

function looksLikeNumericHeading(line) {
  const match = line.match(NUMERIC_HEADING);
  if (!match) return false;
  const rest = match[2].trim();
  return Boolean(
    rest &&
    rest.length <= 90 &&
    rest.split(/\s+/).length <= 10 &&
    uppercaseRatio(rest) > 0.84 &&
    HEADING_HINT.test(rest)
  );
}

function looksLikeHeading(line) {
  if (!line || line.length > 100) return false;
  if (PAGE_NOISE.test(line) || PARALLEL_LABEL.test(line)) return false;

  if (looksLikeYearHeading(line) || looksLikeOrdinalHeading(line) || looksLikeNumericHeading(line)) {
    return true;
  }

  if (/^\d/.test(line)) return false;

  const upperRatio = uppercaseRatio(line);
  if (/\bchecklist\b/i.test(line) && line.split(/\s+/).length <= 10) return true;

  return upperRatio > 0.84 && (HEADING_HINT.test(line) || line.split(/\s+/).length <= 8);
}

function affiliationMatch(text, affiliations) {
  const haystack = normalizeChunk(text).toLowerCase();
  let best = null;

  for (const item of affiliations) {
    const candidates = [item.name, ...(item.aliases || [])].filter(Boolean);

    for (const candidate of candidates) {
      const needle = normalizeChunk(candidate).toLowerCase();

      if (needle && haystack.endsWith(needle) && (!best || needle.length > best.needle.length)) {
        best = { item, needle, source: text.slice(text.length - candidate.length) };
      }
    }
  }

  return best;
}

function parseSerial(text) {
  const match = text.match(/(?:#?\s*\/\s*|numbered\s+to\s+)(\d{1,6})\b/i);
  return match ? Number(match[1]) : null;
}

function structuredColumns(rest) {
  if (!rest.includes('\t')) return null;

  const parts = rest.split('\t').map(normalizeChunk);
  if (parts.length < 2) return null;

  const subject = parts[0];
  const affiliation = parts[1];

  if (!subject) return null;

  if (affiliation === SOURCE_NIL) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(2) };
  }

  if (!affiliation || /^(rookie|rc|auto|autograph|relic|memorabilia)$/i.test(affiliation)) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(1) };
  }

  return { subject, affiliation, sourceNil: false, trailing: parts.slice(2) };
}

function parseCard(line, section, affiliations) {
  const m = line.match(CARD_START);
  if (!m) return null;

  const cardNumber = m[1];
  let rest = normalizeText(m[2]);

  if (!/\d/.test(cardNumber) && !cardNumber.includes('-')) return null;
  if (/^(?:19|20)\d{2}$/.test(cardNumber) && uppercaseRatio(rest) > 0.84) return null;

  if (/^\d{1,4}(?:ST|ND|RD|TH)$/i.test(cardNumber) && uppercaseRatio(rest) > 0.84) {
    return null;
  }

  const rawRest = rest;
  const columns = structuredColumns(rawRest);

  const flags = {
    rookie: ROOKIE_MARKERS.test(rawRest),
    autograph: AUTO_MARKERS.test(`${section} ${rawRest}`),
    memorabilia: MEM_MARKERS.test(`${section} ${rawRest}`)
  };

  let subject;
  let affiliationValue = UNRESOLVED;
  let affiliationId = null;
  let affiliationStatus = 'unresolved';
  let confidence = 0.76;

  if (columns) {
    subject = columns.subject
      .replace(/\bRookie\b/gi, '')
      .replace(/\bRC\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (columns.sourceNil) {
      affiliationValue = 'NIL';
      affiliationStatus = 'source-nil';
      confidence = 0.98;
    } else if (columns.affiliation) {
      affiliationValue = columns.affiliation;
      affiliationStatus = 'source';
      confidence = 0.98;

      const known = affiliationMatch(affiliationValue, affiliations);

      if (
        known &&
        normalizeChunk(known.source).toLowerCase() === normalizeChunk(affiliationValue).toLowerCase()
      ) {
        affiliationId = known.item.id ?? null;
        affiliationValue = known.item.name;
      }
    }
  } else {
    rest = rest
      .replace(/\bRookie\b/gi, '')
      .replace(/\bRC\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const affiliation = affiliationMatch(rest, affiliations);
    subject = rest;

    if (affiliation) {
      subject = rest
        .slice(0, rest.length - affiliation.source.length)
        .replace(/\s+-\s*$/, '')
        .trim();

      affiliationValue = affiliation.item.name;
      affiliationId = affiliation.item.id ?? null;
      affiliationStatus = 'dictionary';
      confidence = 0.90;
    }
  }

  if (/^[A-Z0-9][A-Z0-9-]*$/i.test(cardNumber)) confidence += 0.01;
  if (!subject || subject.length < 2) confidence = 0.35;

  return {
    card_number: cardNumber,
    subject,
    affiliation: affiliationValue,
    affiliation_id: affiliationId,
    affiliation_status: affiliationStatus,
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
    meta[section] = { card_count_declared: null, parallels: [], notes: [] };
  }
  return meta[section];
}

export function parseChecklistText(text, affiliations = []) {
  const lines = text.split(/\r?\n/).map(normalizeText).filter(Boolean);
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
      if (line.length <= 240 && !meta.parallels.includes(line)) meta.parallels.push(line);
    }
  }

  const usedSections = [...new Set(cards.map((card) => card.checklist_name).filter(Boolean))];
  const filteredMeta = {};

  for (const name of usedSections) {
    if (checklist_meta[name]) filteredMeta[name] = checklist_meta[name];
  }

  return {
    sections: usedSections,
    cards,
    checklist_meta: filteredMeta,
    metaSections: Object.values(filteredMeta).filter((m) => m.parallels.length || m.card_count_declared).length,
    high: cards.filter((c) => c.confidence >= .85).length,
    review: cards.filter((c) => c.confidence < .85).length,
    lines: lines.length
  };
}

export function groupByChecklist(cards) {
  return cards.reduce((acc, card) => {
    (acc[card.checklist_name] ||= []).push(card);
    return acc;
  }, {});
}
