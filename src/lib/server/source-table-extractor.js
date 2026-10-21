// Shared by source inspection and CSV export; keep verification and exports consistent.
function decode(v) {
  return String(v ?? '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&ndash;/gi, '–').replace(/&mdash;/gi, '—').replace(/&hellip;/gi, '…').replace(/&lsquo;|&rsquo;/gi, '’').replace(/&ldquo;|&rdquo;/gi, '“').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const cp = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    });
}
function clean(value) {
  return decode(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function cells(row) {
  return [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(x => clean(x[1]));
}
function column(header, words) {
  return header.findIndex(x => words.some(w => w.test(x.toLowerCase())));
}
function labelBefore(html, idx) {
  const head = html.slice(Math.max(0, idx - 12000), idx);
  const found = [...head.matchAll(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/gi)].map(m => clean(m[1]));
  return (found.at(-1) || 'Checklist').replace(/\s*\d+\s*cards\b.*/i, '').trim().slice(0, 140) || 'Checklist';
}
function csvLine(row) {
  return row.map(v => '"' + String(v ?? '').replace(/"/g, '""').replace(/^[\s\r\n]*[=+@-](?=.)/, "'$&") + '"').join(',');
}
// Only parse actual HTML tables with a clear card-number/player/team header.
// A browser-only DOM export cannot be reconstructed safely if rows aren't present in the HTML.
export function extractCsv(html) {
  const cards = [];
  const seen = new Set();
  let matchedTables = 0;
  for (const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = [...match[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m => cells(m[0]));
    const headerIndex = rows.findIndex(r => column(r, [/^#$/, /^card\s*(?:number|#|no\.?)/, /^number$/]) >= 0 &&
      column(r, [/^player/, /^subject/, /^name$/, /^character/]) >= 0);
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    const num = column(header, [/^#$/, /^card\s*(?:number|#|no\.?)/, /^number$/]);
    const name = column(header, [/^player/, /^subject/, /^name$/, /^character/]);
    const team = column(header, [/^team/, /^affiliation/, /^club/]);
    const section = labelBefore(html, match.index);
    matchedTables++;
    for (const row of rows.slice(headerIndex + 1)) {
      let number = row[num] || '';
      let player = row[name] || '';
      let affiliation = team >= 0 ? row[team] || '' : '';
      if (!number || !player || number.length > 32 || player.length > 240 || /^(total|number|#)$/i.test(number)) continue;
      const rookie = /(?:^|\s)(?:RC|Rookie)(?:\s|$)/i.test(player) ? '1' : '0';
      player = player.replace(/\s+(?:RC|Rookie)\s*$/i, '').trim();
      // Never infer autograph/memorabilia from an isolated row; section names remain intact for review.
      const type = /autograph|signature/i.test(section) ? 'Autograph'
  : /relic|memorabilia|patch/i.test(section) ? 'Memorabilia'
  : /\bbase\b/i.test(section) ? 'Base'
  : 'Insert';
      const key = [section, number, player, affiliation].join('|').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push([number, player, affiliation, section, type, rookie]);
    }
  }
  if (cards.length < 5) return { ok: false, reason: `No usable HTML card tables were found (${matchedTables} candidate tables; ${cards.length} rows). Use the site's own CSV export instead.` };
  if (cards.length > 12000) return { ok: false, reason: 'The page contained too many rows for a safe single-checklist export.' };
  const csv = '\ufeff' + [
    ['card_number', 'player', 'team', 'set', 'set_type', 'rc'],
    ...cards
  ].map(csvLine).join('\r\n') + '\r\n';
  return { ok: true, csv, cards: cards.length, sections: new Set(cards.map(r => r[3])).size };
}
