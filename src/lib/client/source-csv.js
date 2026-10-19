// Import explicit card CSV columns without guessing player/team boundaries.
// Rows remain available to the existing manual review workflow.
const value = (v) => String(v ?? '').replace(/\u00a0/g, ' ').trim();
const normalized = (v) => value(v).replace(/^\ufeff/, '').toLowerCase().replace(/[\s-]+/g, '_');
const yes = (v) => ['1','true','yes','y','rc','rookie','x'].includes(value(v).toLowerCase());
const isAutograph = (s) => /autograph|signature|\bauto\b/i.test(s);
const isMemorabilia = (s) => /relic|memorabilia|patch|material/i.test(s);

export async function parseSourceCsv(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), {type:'array', raw:false, cellText:true});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('CSV contains no worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:false, blankrows:false});
  const headers = (rows[0] || []).map(normalized);
  const col = (name) => headers.indexOf(name);
  for (const required of ['card_number','player','team','set']) {
    if (col(required) < 0) throw new Error(`CSV is missing required column: ${required}`);
  }
  const cards = [];
  const warnings = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(v => value(v))) continue;
    const number = value(row[col('card_number')]);
    const subject = value(row[col('player')]);
    const team = value(row[col('team')]);
    const section = value(row[col('set')]);
    if (!number || !subject || !section) {
      warnings.push(`CSV row ${i+1}: missing card number, player, or section; skipped.`);
      continue;
    }
    const type = col('set_type') >= 0 ? value(row[col('set_type')]) : '';
    const rookie = col('rc') >= 0 && yes(row[col('rc')]);
    const affiliation = team || 'NIL';
    cards.push({
      card_number:number, subject, affiliation, affiliation_id:null,
      affiliation_status:team?'source-unverified':'source-nil',
      checklist_name:section, rookie,
      autograph:isAutograph(type) || isAutograph(section),
      memorabilia:isMemorabilia(type) || isMemorabilia(section),
      serial_number:null,
      variation:/variation/i.test(section)?'Variation':null,
      confidence:0.99,
      raw:row.map(value).join(' | ')
    });
  }
  if (!cards.length) throw new Error('CSV contained no usable card rows.');
  const sections = [...new Set(cards.map(c=>c.checklist_name))];
  const checklist_meta = Object.fromEntries(sections.map(section=>[
    section,{card_count_declared:cards.filter(c=>c.checklist_name===section).length,parallels:[],notes:[]}
  ]));
  return {
    cards,sections,checklist_meta,metaSections:sections.length,
    high:cards.length,review:0,lines:rows.length-1,sourceKind:'csv',
    safety:{blocked:false,reasons:[],warnings}
  };
}
