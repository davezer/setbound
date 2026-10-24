import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// Extract per-checklist parallel ladders, not the optional editorial Parallel Guide.
// Fail closed: if a declared section count cannot be recovered exactly, do not publish.
const HOST = 'cardsmithsbreaks.com';
const MAX_HTML = 3_000_000;
const decode = value => String(value ?? '')
  .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;|&#38;/gi, '&')
  .replace(/&quot;|&#34;/gi, '"').replace(/&apos;|&#39;|&#039;/gi, "'")
  .replace(/&ndash;|&#8211;/gi, '–').replace(/&mdash;|&#8212;/gi, '—')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const plain = value => decode(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norm = value => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function approved(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
      [HOST, 'www.' + HOST].includes(u.hostname) && /^\/full-checklist\/[a-z0-9-]+\/$/i.test(u.pathname) ? u.href : null;
  } catch { return null; }
}
async function findParent(database, p) {
  const rows = await database.prepare("SELECT entry_json FROM source_harvester_cache WHERE source='cardsmithsbreaks' AND json_extract(entry_json,'$.archiveParent')=1 LIMIT 3000").all();
  const slug = String(p.original_filename || '').replace(/\.csv$/i, '').toLowerCase();
  const hits = [];
  for (const row of rows.results || []) {
    let entry; try { entry = JSON.parse(row.entry_json); } catch { continue; }
    const url = approved(entry.pageUrl);
    if (!url) continue;
    const name = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    if (approved(p.source_url) === url || slug === name || p.slug === name) hits.push(url);
  }
  const unique = [...new Set(hits)];
  if (unique.length !== 1) throw Error(unique.length ? 'Ambiguous parent source. Check product matching.' : 'No verified exact parent page found.');
  return unique[0];
}
function formatNumber(raw) {
  const value = plain(raw).replace(/,/g, '').trim();
  if (/^(?:base|standard)$/i.test(value)) return 'Base';
  if (/^(?:unnumbered|un-numbered|—|–|-)$/i.test(value)) return 'Unnumbered';
  if (/^(?:1\s*\/\s*1|one.of.one)$/i.test(value)) return '1/1';
  if (/^\/?\d{1,5}$/.test(value)) return '/' + value.replace(/^\//, '');
  return null;
}
function cleanParallelName(raw) {
  return plain(raw).replace(/\s+(?:HOBBY|VALUE|RETAIL|JUMBO|BREAKER(?: DELIGHT)?|FAT PACK|MEGA)\s+ONLY\b/gi, '').trim();
}
function formatAvailability(raw) {
  const text = plain(raw);
  const match = text.match(/\b(Hobby|Value|Retail|Jumbo|Breaker(?: Delight)?|Fat Pack|Mega)\s+Only\b/i);
  return match ? match[1] + ' only' : '';
}
function parseParallelChunk(html) {
  // Capture list items, cells and badges as separate text nodes before combining.
  const items = [];
  const unique = new Set();
  function add(name, number, availability = '') {
    name = cleanParallelName(name);
    number = formatNumber(number);
    if (!name || !number || name.length > 120 || /^base$/i.test(name)) return;
    const signature = norm(name) + '|' + number;
    if (unique.has(signature)) return;
    unique.add(signature);
    items.push({ name, number, availability: formatAvailability(availability || name) });
  }
  // First use naturally bounded elements if each parallel is a badge, list item, or row.
  for (const match of html.matchAll(/<(?:li|span|div|button)\b[^>]*>([\s\S]*?)<\/(?:li|span|div|button)>/gi)) {
    const element = match[0];
    if (element.length > 650 || /<(?:li|div|table|tr)\b/i.test(match[1])) continue;
    const text = plain(match[1]);
    if (!text || text.length > 160) continue;
    let result = text.match(/^(.+?)\s*(\/\d{1,5}|1\s*\/\s*1)\s*(?:\b|$)/i);
    if (result) add(result[1], result[2], text);
    else if (/\bunnumbered\b/i.test(text)) {
      result = text.match(/^(.+?)\s+(unnumbered)(?:\b|$)/i);
      if (result) add(result[1], result[2], text);
    }
  }
  // The source can flatten a list into a single text run. Recover numbered
  // entries from contiguous text, preserving order; never guess unnumbered names.
  if (!items.length) {
    const text = plain(html);
    const token = /([\p{L}][\p{L}\p{N}&'’().+\- ]{1,80}?)\s*(\/\d{1,5}|1\s*\/\s*1)(?=\s|$)/gu;
    for (const match of text.matchAll(token)) {
      const name = match[1].trim();
      if (name.length <= 75) add(name, match[2], name);
    }
  }
  return items;
}

// Capture HTML elements without assuming the source's expandable ladder is a heading.
// A selector option is NOT a parallel definition. The initially rendered ladder is
// often for __ALLBASE__ and must never be attributed to every checklist.
function htmlAttr(tag, key) {
  const match=tag.match(new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27)','i'));
  return decode(match?.[1]??match?.[2]??'');
}
function rowParallelDefinitions(html) {
  const groups = new Map();
  const table = html.match(/<table\b[^>]*class\s*=\s*["'][^"']*ladw-table[^"']*["'][^>]*>[\s\S]*?<\/table>/i)
    || html.match(/<tbody\b[^>]*class\s*=\s*["'][^"']*ladw-rows[^"']*["'][^>]*>[\s\S]*?<\/tbody>/i);
  if (!table) return groups;
  for (const m of table[0].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const attrs=m[1], cells=[...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>c[1]);
    if(cells.length<2)continue;
    const key=htmlAttr(attrs,'data-k');
    const section=key.split('|')[0];
    if(!section || /^__allbase__$/i.test(section))continue;
    const num=formatNumber(cells[0]), name=cleanParallelName(cells[1]);
    if(!num||!name||/^base$/i.test(name))continue;
    const availability=formatAvailability(cells[1]);
    const items=groups.get(section)||[];
    if(!items.some(x=>norm(x.name)===norm(name)&&x.number===num))items.push({name,number:num,availability});
    groups.set(section,items);
  }
  return groups;
}
function listParallelDefinitions(chunk) {
  // The checklist accordion prints each parallel name as a distinct item.
  // Support both separated badges and inline strings such as 'Sky Blue/499'.
  const entries=[];const seen=new Set();
  const add=(rawName,rawNumber,availability='')=>{
    const name=cleanParallelName(rawName).replace(/^[\s|:,·–-]+|[\s|:,·–-]+$/g,'');
    const number=formatNumber(rawNumber);
    if(!name||!number||name.length>100||/^base$/i.test(name))return;
    const key=norm(name)+'|'+number;if(seen.has(key))return;seen.add(key);
    entries.push({name,number,availability:formatAvailability(availability||rawName)});
  };
  const text=decode(chunk.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<\/\s*(?:li|span|div|p|a|strong|b|td|button)\s*>/gi,' | ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  for(const unit of text.split(/\s*\|\s*/).filter(Boolean)){
    const piece=unit.replace(/\s+/g,' ').trim();
    let m=piece.match(/^(.+?)\s*(\/\d{1,5}|1\s*\/\s*1)(?:\s|$)/i);
    if(m)add(m[1],m[2],piece);
    else if((m=piece.match(/^(.+?)\s+(unnumbered)\b/i)))add(m[1],m[2],piece);
    // Do not guess that a bare name is unnumbered. The text may be incomplete.
  }
  return entries;
}
function sectionsFromHtml(html) {
  const renderedRows=rowParallelDefinitions(html);
  const headings=[];
  // Source accordion headings often mix the checklist name with badges such
  // as '100 cards' and '22 parallels', rather than using heading tags.
  for (const m of html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const label=plain(m[2]);
    const count=label.match(/\b(\d{1,3})\s+parallels?\b/i);
    if(!count)continue;
    const name=label.slice(0,count.index).replace(/\b[\d,]+\s+cards?\b.*$/i,'').trim();
    if(!name||/every parallel|numbered ladder|parallel guide/i.test(name))continue;
    headings.push({start:m.index+m[0].length,name,expected:Number(count[1])});
  }
  const sections=[];
  for(let i=0;i<headings.length;i++){
    const h=headings[i];
    const next=headings[i+1]?.start||html.length;
    const chunk=html.slice(h.start,Math.min(next,h.start+25000));
    // Try the section accordion text, then section-keyed rows if present.
    // Non-sectioned __ALLBASE__ rows cannot prove a per-section match.
    const fromList=listParallelDefinitions(chunk.split(/<h[1-6]\b[^>]*>\s*Parallel Guide/i)[0]);
    const fromRows=renderedRows.get(h.name)||[];
    const entries=fromList.length===h.expected?fromList:fromRows.length===h.expected?fromRows:fromList;
    sections.push({name:h.name,expected:h.expected,parallels:entries});
  }
  return sections;
}

async function build(database, id, fetcher) {
  const product = await database.prepare('SELECT p.id,p.slug,p.name,p.year,s.source_url,s.original_filename FROM products p LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?').bind(id).first();
  if (!product) throw Error('Product not found.');
  const url = await findParent(database, product);
  const response = await fetcher(url, { redirect: 'manual', headers: { accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw Error('Source did not return HTML.');
  if (Number(response.headers.get('content-length') || 0) > MAX_HTML) throw Error('Source page exceeds limit.');
  const html = await response.text();
  if (html.length > MAX_HTML) throw Error('Source page exceeds limit.');
  const raw = sectionsFromHtml(html);
  if (!raw.length) throw Error('No per-checklist parallel counts found. Source layout is unsupported; nothing saved.');
  const rows = await database.prepare('SELECT cl.id, cl.name, cd.parallels_json FROM checklists cl LEFT JOIN checklist_details cd ON cd.checklist_id=cl.id WHERE cl.product_id=? ORDER BY cl.sort_order').bind(id).all();
  const lists = rows.results || [];
  const proposals = []; const incomplete = []; const unmatched = [];
  let entries = 0;
  for (const section of raw) {
    entries += section.parallels.length;
    const matches = lists.filter(item => norm(item.name) === norm(section.name));
    if (matches.length !== 1) { unmatched.push({ section: section.name, reason: 'No unique exact checklist match' }); continue; }
    if (section.parallels.length !== section.expected) {
      incomplete.push({ section: section.name, expected: section.expected, found: section.parallels.length });
      continue;
    }
    const item = matches[0];
    proposals.push({ checklistId: item.id, checklistName: item.name, parallels: section.parallels });
  }
  const existing = lists.filter(item => item.parallels_json && item.parallels_json.trim() !== '[]').map(item => item.name);
  // For bulk safety, all declared source sections must be extractable and matched.
  const complete = !incomplete.length && !unmatched.length && proposals.length === raw.length && proposals.length > 0;
  return { url, entries, proposals, unmatched: unmatched.slice(0,15), unmatchedCount: unmatched.length, incomplete, declaredSections: raw.length, complete, existing };
}
export async function POST({ request, platform, fetch, locals }) {
  if (!locals.isAdmin) return json({ message: 'Admin access required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body.productId);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ message: 'Invalid product ID.' }, { status: 400 });
  if (!['preview', 'apply'].includes(body.mode)) return json({ message: 'Invalid mode.' }, { status: 400 });
  try {
    const database = db(platform);
    const report = await build(database, id, fetch);
    if (body.mode === 'preview') return json({ ok: true, productId: id, ...report });
    if (body.confirmed !== true) return json({ message: 'Review confirmation required.' }, { status: 400 });
    if (!report.complete) return json({ message: `Incomplete parallel extraction (${report.incomplete.length} count mismatches, ${report.unmatchedCount} unmatched sections). No data saved.`, incomplete: report.incomplete }, { status: 409 });
    const statements = report.proposals.map(item => database.prepare(`INSERT INTO checklist_details (checklist_id,parallels_json,notes_json,updated_at) VALUES (?,?,'[]',datetime('now')) ON CONFLICT(checklist_id) DO UPDATE SET parallels_json=excluded.parallels_json,updated_at=datetime('now') WHERE checklist_details.parallels_json IS NULL OR TRIM(checklist_details.parallels_json)='' OR TRIM(checklist_details.parallels_json)='[]'`).bind(item.checklistId, JSON.stringify(item.parallels)));
    const results = await database.batch(statements);
    return json({ ok: true, saved: results.reduce((n, item) => n + Number(item.meta?.changes || 0), 0), sections: report.proposals.length, skippedExisting: report.existing.length });
  } catch (error) { return json({ message: error?.message || 'Parallel scan failed.' }, { status: 422 }); }
}
