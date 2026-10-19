import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sourceCategory } from '$lib/server/master-source.js';

// Keep original source identifiers for internal provenance, not UI branding.
const HOST = 'cardsmithsbreaks.com';
const SOURCE = 'cardsmithsbreaks';
const ROOT = `https://${HOST}`;
const ARCHIVES = { past: 'past-releases', upcoming: 'upcoming-releases' };
const PAGE_BATCH = 3;
const MAX_PAGE = 180;
const MAX_HTML = 2_000_000;
const WRITE_CHUNK = 65;

function decode(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ');
}
function strip(value) { return decode(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function canonical(raw, base = ROOT) {
  try {
    const u = new URL(decode(raw), base);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || ![HOST, `www.${HOST}`].includes(u.hostname)) return null;
    if (!/^\/(?:full-checklist|csbmaster)\/[^/]+\/?$/i.test(u.pathname)) return null;
    u.hostname = HOST;
    u.search = ''; u.hash = '';
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    return u.href;
  } catch { return null; }
}
function nameFrom(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function discoverLinks(html, base) {
  const found = new Map();
  for (const match of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!href) continue;
    const url = canonical(href[1] || href[2] || href[3], base);
    if (!url) continue;
    // Ignore text from neighboring product links; use the stable path slug.
    if (!found.has(url)) found.set(url, { pageUrl: url, name: nameFrom(url) });
  }
  return [...found.values()];
}
async function getPage(fetchFn, page, catalog) {
  const url = `${ROOT}/${ARCHIVES[catalog]}/?product-page=${page}`;
  const response = await fetchFn(url, { redirect: 'manual', headers: { accept: 'text/html' } });
  if (!response.ok) throw new Error(`Catalog page ${page}: HTTP ${response.status}`);
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error(`Catalog page ${page}: not HTML`);
  if (Number(response.headers.get('content-length') || 0) > MAX_HTML) throw new Error(`Catalog page ${page}: too large`);
  const html = await response.text();
  if (html.length > MAX_HTML) throw new Error(`Catalog page ${page}: too large`);
  return { url, html };
}
async function save(database, entries, catalog) {
  let inserted = 0;
  for (let n = 0; n < entries.length; n += WRITE_CHUNK) {
    const statements = entries.slice(n, n + WRITE_CHUNK).map(({pageUrl, name}) => {
      const year = Number(new URL(pageUrl).pathname.match(/\b20\d{2}\b/)?.[0] || 0) || null;
      const category=sourceCategory(pageUrl);
      const entry = {pageUrl, name, year, csvUrl: null, pdfUrl: null, csvButton: false, pdfButton: false, discoveredOnly: true, sourceKind:category.kind, masterUrl:category.masterUrl||null, verifiedMaster:false, discoveredIn:catalog};
      return database.prepare(`INSERT OR IGNORE INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
        .bind(pageUrl, SOURCE, year, name, JSON.stringify(entry));
    });
    const results = await database.batch(statements);
    inserted += results.reduce((sum, r) => sum + Number(r.meta?.changes || 0), 0);
  }
  return inserted;
}

// The archive feed supplies authoritative parent release links. Never parse adjacent box links.
function archiveRows(html, archiveYear) {
  const found = new Map();
  for (const match of String(html).matchAll(/<a\b([^>]*\bclass\s*=\s*["'][^"']*\blrow\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs=match[1];
    const attr=(key)=>attrs.match(new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));
    const href=attr('href');
    const url=canonical(href?.[1]||href?.[2]||'',ROOT);
    if(!url||!new URL(url).pathname.startsWith('/full-checklist/'))continue;
    const checklist=attr('data-cc');
    if(!checklist||(checklist[1]||checklist[2])!=='1')continue;
    const nameTag=match[2].match(/<span\b[^>]*class\s*=\s*["']n["'][^>]*>([\s\S]*?)<\/span>/i);
    const name=strip(nameTag?.[1]||'')||nameFrom(url);
    const slugYear=new URL(url).pathname.match(/\/(?:19|20)\d{2}(?:-\d{2})?-/)?.[0];
    found.set(url,{pageUrl:url,name:name.slice(0,180),archiveYear,releaseYear:slugYear?Number(slugYear.slice(1,5)):null});
  }
  if(!found.size)throw Error('No parent checklist rows detected for '+archiveYear+'. No records changed.');
  return [...found.values()];
}
async function fetchArchiveYear(fetchFn, year){
  const endpoint=ROOT+'/wp-admin/admin-ajax.php?action=csb_cc_archive&y='+year;
  const response=await fetchFn(endpoint,{redirect:'manual',headers:{accept:'text/html'}});
  if(!response.ok)throw Error('Archive feed '+year+' returned HTTP '+response.status);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('text/html'))throw Error('Archive feed returned unexpected content type: '+type);
  if(Number(response.headers.get('content-length')||0)>5_000_000)throw Error('Archive feed too large');
  const html=await response.text();
  if(html.length>5_000_000)throw Error('Archive feed too large');
  return archiveRows(html,year);
}

export async function POST({ request, platform, fetch }) {
  const body = await request.json().catch(() => ({}));
  const catalog = body.catalog === 'upcoming' ? 'upcoming' : body.catalog === 'past' || body.catalog == null ? 'past' : null;
  if (!catalog && body.catalog !== 'homepage-parents') return json({message:'Invalid catalog.'},{status:400});

  if (body.catalog === 'homepage-parents') {
    const year=Number(body.year);
    if(!Number.isInteger(year)||year<2000||year>new Date().getFullYear()+1)
      return json({message:'Choose a valid archive year.'},{status:400});
    try {
      const entries=await fetchArchiveYear(fetch,year);
      if(body.save!==true)return json({ok:true,preview:true,year,found:entries.length,samples:entries});
      const database=db(platform);
      let added=0,updated=0;
      for(let i=0;i<entries.length;i+=50){
        const statements=entries.slice(i,i+50).map(entry=>{
          const year=entry.releaseYear||Number(entry.name.match(/^(?:19|20)\d{2}/)?.[0])||null;
          const record={pageUrl:entry.pageUrl,name:entry.name,year,archiveYear:entry.archiveYear,archiveParent:true,sourceKind:'candidate',verifiedMaster:false,discoveredOnly:true};
          return database.prepare(`INSERT OR IGNORE INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))`)
            .bind(entry.pageUrl,SOURCE,year,entry.name,JSON.stringify(record));
        });
        const result=await database.batch(statements);
        added+=result.reduce((n,r)=>n+Number(r.meta?.changes||0),0);
      }
      // Existing inspected cache records are intentionally untouched. A separate authority list
      // lets us recognize feed parents, even when their names end in 'Box'.
      for(let i=0;i<entries.length;i+=50){
        const statements=entries.slice(i,i+50).map(entry=>database.prepare(`UPDATE source_harvester_cache
          SET entry_json=json_set(entry_json,'$.archiveParent',json('true'),'$.archiveYear',?)
          WHERE page_url=? AND source=?`).bind(entry.archiveYear,entry.pageUrl,SOURCE));
        await database.batch(statements);
      }
      return json({ok:true,preview:false,year,found:entries.length,added,existing:entries.length-added});
    }catch(error){return json({message:error?.message||'Feed discovery failed. No changes made.'},{status:422});}
  }
  const first = body.reset === true ? 1 : Number(body.nextPage);
  if (!Number.isSafeInteger(first) || first < 1 || first > MAX_PAGE) return json({message:'Invalid archive page.'},{status:400});
  const database = db(platform);
  const batchSize = Math.min(PAGE_BATCH, Math.max(1, Number.isInteger(body.limit) ? body.limit : PAGE_BATCH));
  let totalPages = Math.min(MAX_PAGE, Math.max(1, Number(body.totalPages) || MAX_PAGE));
  const pageResults = [];
  const seen = new Map();
  let lastPage = first - 1;
  for (let page = first; page <= Math.min(totalPages, first + batchSize - 1); page++) {
    try {
      const { url, html } = await getPage(fetch, page, catalog);
      if (page === 1) {
        const match = html.match(/Showing\s+\d+[\s\S]{0,200}?of\s+([\d,]+)\s+results/i);
        if (match) totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(Number(match[1].replace(/,/g, '')) / 12)));
        // Check pagination links as a fallback, without trusting unbounded page counts.
        for (const m of html.matchAll(/[?&]product-page=(\d+)/gi)) totalPages = Math.max(totalPages === MAX_PAGE ? 1 : totalPages, Math.min(MAX_PAGE, Number(m[1])));
      }
      const found = discoverLinks(html, url);
      if (!found.length) {
        return json({message:`Catalog page ${page} contained no recognizable checklist links. Scanning paused; no pages skipped.`,page,checked:pageResults},{status:422});
      }
      for (const entry of found) seen.set(entry.pageUrl, entry);
      pageResults.push({page, links:found.length});
      lastPage = page;
    } catch (e) {
      return json({message:e?.message || 'Could not inspect catalog page.',page,checked:pageResults},{status:502});
    }
  }
  const added = await save(database, [...seen.values()], catalog);
  return json({ok:true,kind:'archive',catalog,pagesScanned:pageResults.length,links:seen.size,added,existing:seen.size-added,
    nextPage:lastPage < totalPages ? lastPage+1 : null,totalPages,details:pageResults});
}
