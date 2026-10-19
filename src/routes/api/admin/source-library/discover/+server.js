import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// Source identifiers are retained internally for provenance. Never expose source-specific labels in the admin UI.
const HOST = 'cardsmithsbreaks.com';
const SOURCE = 'cardsmithsbreaks';
const ROOT = `https://${HOST}`;
const MAX_SITEMAP_BYTES = 2_000_000;
const MAX_LINKS = 4000;
const CHUNK = 75;

function safeUrl(value, sitemap = false) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || ![HOST, `www.${HOST}`].includes(u.hostname)) return null;
    u.hash = '';
    if (sitemap && !/\.xml(?:$|\?)/i.test(u.pathname + u.search)) return null;
    return u.href;
  } catch { return null; }
}
function decode(s) { return String(s).replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'"); }
function links(xml) { return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => decode(m[1].trim())); }
function isProduct(url) {
  const u = safeUrl(url);
  if (!u) return false;
  return /^\/(?:full-checklist|csbmaster)\/[^/]+\/?$/.test(new URL(u).pathname);
}
function productName(url) {
  const last = new URL(url).pathname.split('/').filter(Boolean).at(-1) || '';
  return last.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
async function readXml(fetchFn, url) {
  const r = await fetchFn(url, { redirect: 'manual', headers: { accept: 'application/xml,text/xml,*/*' } });
  if (!r.ok) throw new Error(`Catalog source returned HTTP ${r.status}.`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX_SITEMAP_BYTES) throw new Error('Catalog index exceeds safe size limit.');
  const xml = await r.text();
  if (xml.length > MAX_SITEMAP_BYTES || !/<(?:urlset|sitemapindex)\b/i.test(xml)) throw new Error('Catalog source was not a supported XML sitemap.');
  return xml;
}
async function saveDiscovery(database, urls) {
  let added = 0;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const batch = urls.slice(i, i + CHUNK).map(url => {
      const year = Number(url.match(/(?:^|\D)(20\d{2})(?:\D|$)/)?.[1] || 0) || null;
      const entry = { pageUrl: url, name: productName(url), year, csvUrl: null, pdfUrl: null, csvButton: false, pdfButton: false, discoveredOnly: true };
      return database.prepare(`INSERT OR IGNORE INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).bind(url, SOURCE, year, entry.name, JSON.stringify(entry));
    });
    const res = await database.batch(batch);
    added += res.reduce((n, result) => n + Number(result.meta?.changes || 0), 0);
  }
  return added;
}

// Each click fetches one sitemap only. The client stores the remaining sitemap URLs
// and resumes on the next click; this avoids long-running workers and accidental bursts.
export async function POST({ request, platform, fetch }) {
  const body = await request.json().catch(() => ({}));
  const cursor = body.cursor == null ? `${ROOT}/sitemap_index.xml` : safeUrl(body.cursor, true);
  if (!cursor) return json({ message: 'Invalid catalog cursor.' }, { status: 400 });
  const database = db(platform);
  let xml;
  let tried = [cursor];
  try {
    xml = await readXml(fetch, cursor);
  } catch (e) {
    // Only the initial sitemap index receives a WordPress sitemap fallback.
    if (body.cursor != null) return json({ message: e?.message || 'Could not read catalog index.', cursor }, { status: 502 });
    try { tried.push(`${ROOT}/wp-sitemap.xml`); xml = await readXml(fetch, tried.at(-1)); }
    catch { try { tried.push(`${ROOT}/sitemap.xml`); xml = await readXml(fetch, tried.at(-1)); }
      catch { return json({ message: `No accessible sitemap found at ${tried.map(x => new URL(x).pathname).join(', ')}.` }, { status: 502 }); } }
  }
  if (/<sitemapindex\b/i.test(xml)) {
    const childSitemaps = [...new Set(links(xml).map(u => safeUrl(u, true)).filter(Boolean))].slice(0, 250);
    return json({ ok: true, kind: 'index', sitemaps: childSitemaps, count: childSitemaps.length, pages: 0, added: 0 });
  }
  const urls = [...new Set(links(xml).filter(isProduct))].slice(0, MAX_LINKS);
  const added = await saveDiscovery(database, urls);
  return json({ ok: true, kind: 'pages', pages: urls.length, added, existing: urls.length - added, index: new URL(cursor).pathname });
}
