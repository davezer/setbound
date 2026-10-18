import { browser } from '$app/environment';

// The 2026 GPK Halloween PDF has four consistent visual columns:
// card number | subset/type | character name | card back/artist.
// Parse by PDF coordinates rather than flattening those columns into words.
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const numberCode = /^(?:[1-9]|1\d|2[0-5])[ABC]$/i;
const autographNumber = /^(?:10|[1-9])$/;
const headings = new Map([
  ['C NAMES', 'C Names'],
  ['SCREAM QUEENS', 'Scream Queens'],
  ['ART VARIATION', 'Art Variation'],
  ['AUTOGRAPHS', 'Autographs'],
  ['SLIME BASE PARALLELS', 'Slime Base Parallels'],
  ['WRAPPERS', 'Wrappers'],
  ['WRAPPER PARALLEL', 'Wrapper Parallel'],
  ['SKETCH CARD ARTIST', 'Sketch Card Artists']
]);

function makeCard(number, subject, section, raw, extra = {}) {
  return {
    card_number: number,
    subject,
    affiliation: 'NIL',
    affiliation_id: null,
    affiliation_status: 'source-nil',
    rookie: false,
    autograph: section === 'Autographs',
    memorabilia: false,
    serial_number: null,
    variation: section === 'Art Variation' ? 'Art Variation' : null,
    checklist_name: section,
    confidence: 0.99,
    raw,
    ...extra
  };
}

function rowsFromItems(items) {
  const lines = [];
  for (const item of items) {
    if (!('str' in item) || !clean(item.str)) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    let row = lines.find((candidate) => Math.abs(candidate.y - y) < 2.6);
    if (!row) { row = { y, fragments: [] }; lines.push(row); }
    row.fragments.push({ x, text: clean(item.str) });
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => {
    line.fragments.sort((a, b) => a.x - b.x);
    const columns = [[], [], [], []];
    for (const fragment of line.fragments) {
      // Tuned against the PDF's measured columns (x ~53, 144, 193, 327).
      const col = fragment.x < 116 ? 0 : fragment.x < 182 ? 1 : fragment.x < 313 ? 2 : 3;
      columns[col].push(fragment.text);
    }
    return { text: clean(line.fragments.map((i) => i.text).join(' ')), cells: columns.map((parts) => clean(parts.join(' '))) };
  });
}

export async function parseGpkHalloweenPdf(file) {
  if (!browser) throw new Error('PDF parsing is only available in the browser.');
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const cards = [];
  let section = 'Base';
  let witnessedHeader = false;
  let witnessedSpecialSections = false;
  let rejectedNumberedRows = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const row of rowsFromItems(content.items)) {
      const [number, kind, subject, note] = row.cells;
      const label = row.text.toUpperCase();
      if (label.includes('CARD #') && label.includes('SUBSET') && label.includes('NAME')) witnessedHeader = true;
      if (headings.has(label)) {
        section = headings.get(label);
        if (section === 'Scream Queens' || section === 'C Names') witnessedSpecialSections = true;
        continue;
      }
      if (/^CHECKLISTS PROVIDED BY TOPPS|^PRODUCT AT THE TIME OF PRODUCTION/i.test(label)) continue;
      if (section === 'Slime Base Parallels' || section === 'Wrappers' || section === 'Wrapper Parallel' || section === 'Sketch Card Artists') continue;

      if (section === 'Autographs') {
        // Autograph rows have no card # in the first column on this source;
        // their numerals sit immediately before "Autos" in the subset column.
        let autoNumber = number;
        let autoKind = kind;
        if (!autoNumber && /^(?:10|[1-9])\s+Autos$/i.test(kind)) {
          const m = kind.match(/^(10|[1-9])\s+Autos$/i);
          autoNumber = m[1]; autoKind = 'Autos';
        }
        if (autographNumber.test(autoNumber) && /^Autos$/i.test(autoKind) && subject && note) {
          cards.push(makeCard(autoNumber, subject, 'Autographs', row.text));
        }
        continue;
      }
      if (!numberCode.test(number)) {
        if (/^\d{1,2}[A-C]$/i.test(number) && (kind || subject)) rejectedNumberedRows++;
        continue;
      }
      const expectedKind = section === 'Base' ? 'Base' : section === 'Art Variation' ? 'Variation' : 'Insert';
      if (clean(kind).toLowerCase() !== expectedKind.toLowerCase() || !subject) {
        rejectedNumberedRows++;
        continue;
      }
      // Card numbers repeat between Base, Scream Queens, and Art Variation;
      // they must remain separate checklists, never merged by card number.
      cards.push(makeCard(number.toUpperCase(), subject, section, row.text));
    }
  }

  const counts = Object.fromEntries(['Base', 'C Names', 'Scream Queens', 'Art Variation', 'Autographs'].map((name) => [name, cards.filter((card) => card.checklist_name === name).length]));
  const expected = { Base: 50, 'C Names': 25, 'Scream Queens': 10, 'Art Variation': 10, Autographs: 10 };
  const problems = [];
  if (!witnessedHeader || !witnessedSpecialSections) problems.push('Missing the expected Halloween PDF table header or sections.');
  for (const [name, count] of Object.entries(expected)) if (counts[name] !== count) problems.push(`${name}: extracted ${counts[name]}, expected ${count}.`);
  if (rejectedNumberedRows) problems.push(`${rejectedNumberedRows} numbered rows did not match their section layout.`);
  if (pdf.numPages !== 5) problems.push(`Source has ${pdf.numPages} pages; the verified checklist has 5.`);

  const sections = [...new Set(cards.map((card) => card.checklist_name))];
  const checklist_meta = Object.fromEntries(sections.map((name) => [name, { card_count_declared: expected[name], parallels: [], notes: [] }]));
  return {
    cards, sections, checklist_meta,
    metaSections: sections.length, high: cards.length, review: 0, lines: cards.length,
    sourceKind: 'gpk-halloween-visual-columns',
    safety: { blocked: problems.length > 0, reasons: problems, warnings: [] }
  };
}
