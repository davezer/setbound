// Source Library CSV adapter. No AI, network, or remote mutation.
// Keeps the source's section, explicit rookie flag, and section classification.
const value = (v) => String(v ?? '').replace(/\u00a0/g, ' ').trim();
const truth = (v) => /^(?:1|true|yes|y|rc|rookie)$/i.test(value(v));

export async function parseSourceCsv(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    defval: '', raw: false, blankrows: false
  });
  if (!rows.length) throw new Error('The CSV is empty.');
  const headings = Object.keys(rows[0]);
  const lookup = (names) => headings.find(h => names.includes(h.replace(/^\uFEFF/, '').trim().toLowerCase()));
  const number = lookup(['card_number', 'card number', 'card #']);
  const player = lookup(['player', 'subject', 'name']);
  const team = lookup(['team', 'affiliation', 'club']);
  const section = lookup(['set', 'checklist', 'checklist_name', 'subset']);
  const kind = lookup(['set_type', 'type']);
  const rookie = lookup(['rc', 'rookie']);
  if (!number || !player || !section) throw new Error('CSV needs card_number, player, and set columns.');

  const cards = [], warnings = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cardNumber = value(row[number]);
    const subject = value(row[player]);
    const checklistName = value(row[section]);
    if (!cardNumber || !subject || !checklistName) {
      warnings.push(`Row ${i + 2} is incomplete and was skipped.`);
      continue;
    }
    const affiliation = team ? value(row[team]) : '';
    const type = kind ? value(row[kind]) : '';
    const auto = /autograph|signature/i.test(type) || /autograph|signature/i.test(checklistName);
    const mem = /memorabilia|relic|patch|material/i.test(type) || /memorabilia|relic|patch|material/i.test(checklistName);
    cards.push({
      card_number: cardNumber, subject, affiliation: affiliation || 'NIL',
      affiliation_id: null, affiliation_status: affiliation ? 'source-unverified' : 'source-nil',
      checklist_name: checklistName, rookie: rookie ? truth(row[rookie]) : false,
      autograph: auto, memorabilia: mem, serial_number: null, variation: null,
      confidence: 0.99, raw: [cardNumber, subject, affiliation, checklistName, type].join(' | ')
    });
  }
  if (!cards.length) throw new Error('No complete cards found in this CSV.');
  const sections = [...new Set(cards.map(c => c.checklist_name))];
  const checklist_meta = Object.fromEntries(sections.map(name => [name, {
    card_count_declared: cards.filter(c => c.checklist_name === name).length,
    parallels: [], notes: []
  }]));
  return { cards, sections, checklist_meta, high: cards.length, review: 0,
    parserFamily: 'source-library-csv', safety: { blocked: false, reasons: [], warnings } };
}
