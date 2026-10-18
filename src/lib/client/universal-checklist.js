// Universal, conservative fallback for machine-readable PDF text and CSV files.
// No manufacturer assumptions: preserve source rows, leave uncertain cells reviewable.
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const token = (s) => tidy(s).toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
const idPattern = /^(?:\d{1,5}[A-Z]?|[A-Z]{1,8}[-_.]\d{1,6}[A-Z]?|[A-Z0-9]{2,12}-[A-Z0-9]{1,12})$/i;
const headingPattern = /\b(base|insert|auto(?:graph)?s?|relic|variation|short print|rookie|parallel|checklist|subset|cards?|set|signatures?)\b/i;
const rejectLine = /(?:checklists provided by|subject to change|packs? per box|cards? per pack|©|copyright|odds may vary|all rights reserved)/i;
const headerWords = {
  number: /^(?:card\s*(?:#|no\.?|number)?|#|number|no\.?|card id)$/i,
  subject: /^(?:name|subject|player|player name|athlete|character|description|card name)$/i,
  affiliation: /^(?:team|club|country|school|college|organization|affiliation|nation)$/i,
  section: /^(?:subset|set|set name|card set|insert set|checklist|product type|type)$/i
};
const normalizedCell = (value) => tidy(value).replace(/\u00a0/g, ' ');
function columnRole(value) {
  const header = normalizedCell(value);
  return Object.keys(headerWords).find((role) => headerWords[role].test(header)) || null;
}
function getHeadings(fields) {
  const roles = fields.map(columnRole);
  if (roles.includes('number') && roles.includes('subject')) return roles;
  return null;
}
function sectionHeading(line) {
  if (line.length > 90 || !headingPattern.test(line) || idPattern.test(line.split(/\s+/)[0])) return false;
  const letters = line.replace(/[^a-z]/gi, '');
  if (letters.length < 3) return false;
  const uppercase = [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
  return uppercase > .83 && line.split(/\s+/).length <= 9;
}
function card(number, subject, affiliation, section, raw, certainty) {
  const aff = tidy(affiliation);
  return {
    card_number: tidy(number), subject: tidy(subject),
    affiliation: aff || 'NIL',
    affiliation_id: null,
    affiliation_status: aff ? 'source-unverified' : 'source-nil',
    checklist_name: tidy(section) || 'Base',
    confidence: certainty,
    rookie: /\(RC\)|\brookie\b/i.test(subject),
    autograph: /\bauto(?:graph)?s?\b/i.test(section),
    memorabilia: /\b(?:relic|memorabilia|patch)\b/i.test(section),
    serial_number: null,
    variation: /\bvariation\b/i.test(section) ? 'Variation' : null,
    raw
  };
}
function result(cards, warnings, family) {
  const sections = [...new Set(cards.map((c) => c.checklist_name))];
  const checklist_meta = Object.fromEntries(sections.map((section) => [section, {
    card_count_declared: cards.filter((c) => c.checklist_name === section).length,
    parallels: [], notes: []
  }]));
  return {
    cards, sections, checklist_meta, high: cards.filter((c) => c.confidence >= .85).length,
    review: cards.filter((c) => c.confidence < .85).length,
    parserFamily: family,
    safety: { blocked: cards.length === 0 || warnings.some((w) => w.startsWith('BLOCK:')),
      reasons: warnings.filter((w) => w.startsWith('BLOCK:')),
      warnings: warnings.filter((w) => !w.startsWith('BLOCK:')) }
  };
}
function chooseSeparated(line) {
  if (line.includes('\t')) return line.split(/\t+/).map(normalizedCell).filter(Boolean);
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(normalizedCell).filter(Boolean);
  return null;
}
export function parseUniversalPdfText(source) {
  const lines = String(source || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const cards = []; const warnings = [];
  let section = 'Base'; let roles = null; let skipSection = false;
  let ambiguous = 0, structured = 0;
  for (const line of lines) {
    if (rejectLine.test(line)) continue;
    if (sectionHeading(line) && !getHeadings(chooseSeparated(line) || [])) {
      section = tidy(line); roles = null;
      skipSection = /\b(?:parallel|odds|configuration|wrapper parallel)\b/i.test(section);
      continue;
    }
    if (skipSection) continue;
    const fields = chooseSeparated(line);
    if (fields) {
      const nextRoles = getHeadings(fields);
      if (nextRoles) { roles = nextRoles; continue; }
      if (roles) {
        const ix = (role) => roles.indexOf(role);
        const number = fields[ix('number')]; const subject = fields[ix('subject')];
        if (idPattern.test(number || '') && subject && !columnRole(subject)) {
          cards.push(card(number, subject, ix('affiliation') >= 0 ? fields[ix('affiliation')] : '',
            ix('section') >= 0 ? (fields[ix('section')] || section) : section, line, .97));
          structured++; continue;
        }
      }
      // Headerless table: card number | [optional category] | subject | [optional affiliation].
      if (fields.length >= 2 && idPattern.test(fields[0]) && !columnRole(fields[1])) {
        const isKind = /^(base|insert|variation|auto(?:graph)?s?|relic)$/i.test(fields[1]);
        const subject = isKind ? fields[2] : fields[1];
        const aff = isKind ? '' : fields[2] || '';
        const currentSection = isKind ? (/^(base|insert)$/i.test(fields[1]) ? section : fields[1]) : section;
        if (subject && !/^(?:all (?:base|above) subjects|\d+ subjects)$/i.test(fields[0])) {
          cards.push(card(fields[0], subject, aff, currentSection, line, isKind ? .92 : .87));
          structured++; continue;
        }
      }
    }
    // Two-column fallback: card number then subject. No guessed affiliation.
    const match = line.match(/^(\d{1,5}[A-Z]?|[A-Z]{1,8}[-_.]\d{1,6}[A-Z]?|[A-Z0-9]{2,12}-[A-Z0-9]{1,12})\s+(.+)$/i);
    if (match && match[2].length <= 125 && !rejectLine.test(match[2]) && !/^\d+\s+(?:cards?|packs?|boxes?)\b/i.test(match[2])) {
      if (match[2].includes('\t')) { ambiguous++; continue; }
      cards.push(card(match[1], match[2], '', section, line, .74));
      continue;
    }
    if (/^\d+[A-Z]?\s/.test(line)) ambiguous++;
  }
  if (ambiguous) warnings.push(`${ambiguous} source row(s) need column review; not included in draft.`);
  if (!structured && cards.length >= 20) warnings.push('BLOCK: Two-column rows alone are insufficient to verify subject boundaries; manual review required.');
  if (!cards.length) warnings.push('BLOCK: Universal PDF fallback found no safely readable card rows.');
  return result(cards, warnings, 'universal-pdf-fallback');
}
export function parseUniversalDelimited(source, delimiter = ',') {
  // RFC4180-like quoted CSV/TSV parser (newlines and double quotes supported).
  const rows=[]; let row=[], field='', quoted=false;
  const text=String(source||'');
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"' && quoted && text[i+1]==='"'){field+='"';i++;}
    else if(char==='"'){quoted=!quoted;}
    else if(char===delimiter&&!quoted){row.push(field);field='';}
    else if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(field);rows.push(row);row=[];field='';
    }else field+=char;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  const warnings=[],cards=[];let roles=null;let section='Base';let incomplete=0;
  for(const raw of rows){
    const fields=raw.map(normalizedCell);
    const next=getHeadings(fields);
    if(next){roles=next;continue;}
    if(!roles){if(fields.filter(Boolean).length===1&&sectionHeading(fields.find(Boolean)))section=fields.find(Boolean);continue;}
    const at=(role)=>{const idx=roles.indexOf(role);return idx<0?'':fields[idx];};
    const number=at('number'), subject=at('subject');
    if(!number&&!subject&&fields.filter(Boolean).length===1){section=fields.find(Boolean);continue;}
    if(!idPattern.test(number)||!subject){if(fields.some(Boolean))incomplete++;continue;}
    cards.push(card(number,subject,at('affiliation'),at('section')||section,raw.join(delimiter),.98));
  }
  if(incomplete)warnings.push(`${incomplete} incomplete/non-card spreadsheet rows require review.`);
  if(!cards.length)warnings.push('BLOCK: No valid numbered rows found with a recognizable card/subject header.');
  return result(cards,warnings,'universal-delimited-fallback');
}
