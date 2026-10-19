import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sourceCategory } from '$lib/server/master-source.js';

const SOURCE = 'cardsmithsbreaks';
const HOSTS = new Set(['cardsmithsbreaks.com', 'www.cardsmithsbreaks.com']);
const MAX_HTML = 3_000_000;
const MAX_ITEMS = 12;
const MAX_ARCHIVE = 12_000_000;
const enc = new TextEncoder();

function permitted(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && HOSTS.has(url.hostname) &&
      /^\/(?:full-checklist|csbmaster)\//.test(url.pathname);
  } catch { return false; }
}
function decode(v) {
  return String(v ?? '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
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
function extractCsv(html) {
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
async function getEntry(platform, pageUrl) {
  const entry = await db(platform).prepare('SELECT entry_json FROM source_harvester_cache WHERE page_url = ? AND source = ?')
    .bind(pageUrl, SOURCE).first();
  if (!entry) return null;
  try { return JSON.parse(entry.entry_json); } catch { return null; }
}
async function makeFile(fetchFn, pageUrl) {
  const response = await fetchFn(pageUrl, { redirect: 'manual', headers: { accept: 'text/html' } });
  if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().includes('text/html'))
    throw new Error(`Source page unavailable (HTTP ${response.status}).`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_HTML) throw new Error('Source HTML too large.');
  const html = await response.text();
  if (html.length > MAX_HTML) throw new Error('Source HTML too large.');
  const parsed = extractCsv(html);
  if (!parsed.ok) throw new Error(parsed.reason);
  const name = new URL(pageUrl).pathname.split('/').filter(Boolean).at(-1).replace(/[^a-z0-9-]/gi, '-') + '.csv';
  return { name, bytes: enc.encode(parsed.csv), cards: parsed.cards, sections: parsed.sections };
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const x of bytes) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const chunks = [], dir = []; let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name), data = file.bytes, crc = crc32(data);
    const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
    v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true); h.set(name, 30);
    const d = new Uint8Array(46 + name.length), w = new DataView(d.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true);
    w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true); w.setUint32(42, offset, true); d.set(name, 46);
    chunks.push(h, data); dir.push(d); offset += h.length + data.length;
  }
  const end = new Uint8Array(22), v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true);
  v.setUint32(12, dir.reduce((n, d) => n + d.length, 0), true); v.setUint32(16, offset, true);
  return new Blob([...chunks, ...dir, end], { type: 'application/zip' });
}
export async function POST({ request, platform, fetch }) {
  const body = await request.json().catch(() => ({}));
  const requested = [...new Set((Array.isArray(body.urls) ? body.urls : []).filter(permitted))].slice(0, MAX_ITEMS);
  if (!requested.length) return json({ message: 'Select at least one cached source page.' }, { status: 400 });
  const files = [], failures = [], report = [];
  let size = 0;
  for (const pageUrl of requested) {
    const entry = await getEntry(platform, pageUrl);
    if (!entry) { failures.push({ pageUrl, reason: 'Page has not been cached.' }); continue; }
    if (sourceCategory(pageUrl).kind !== 'candidate' || entry.verifiedMaster !== true) { failures.push({pageUrl,reason:'Select an inspected and verified master checklist.'}); continue; }
    try {
      const file = await makeFile(fetch, pageUrl);
      if (size + file.bytes.length > MAX_ARCHIVE) throw new Error('Combined CSV size limit reached.');
      size += file.bytes.length;
      files.push(file);
      report.push({ pageUrl, file: file.name, cards: file.cards, sections: file.sections, status: 'Generated from source HTML; review before importing.' });
    } catch (e) { failures.push({ pageUrl, reason: e?.message || 'Could not generate CSV.' }); }
  }
  if (!files.length) return json({ message: 'No pages contained extractable card tables. Use their browser CSV buttons.', failures }, { status: 422 });
  files.push({ name: 'export-report.json', bytes: enc.encode(JSON.stringify({ report, failures }, null, 2)) });
  return new Response(zip(files), { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="source-library-generated-csv.zip"', 'cache-control': 'no-store' } });
}
