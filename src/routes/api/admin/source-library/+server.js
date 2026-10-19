import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const HOST = 'cardsmithsbreaks.com';
const SOURCE = 'cardsmithsbreaks';
const MAX_PAGES = 12;
const MAX_FILE = 12 * 1024 * 1024;
const normalize = (value) => String(value || '').trim();
function siteUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || ![HOST, 'www.' + HOST].includes(u.hostname)) return null;
    if (!/^\/(?:full-checklist|csbmaster)\//.test(u.pathname)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
function decode(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}
function downloadLinks(html, base) {
  const result = { csv: null, pdf: null };
  const links = [...String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  for (const match of links) {
    try {
      const href = new URL(decode(match[1]), base);
      if (href.protocol !== 'https:' || ![HOST, 'www.' + HOST].includes(href.hostname)) continue;
      const path = (href.pathname + href.search).toLowerCase();
      for (const ext of ['csv', 'pdf']) {
        if (!result[ext] && (new RegExp('\\.' + ext + '(?:$|[?&#])').test(path) || new RegExp('[?&](?:download|format|type)=' + ext + '(?:$|&)').test(path))) result[ext] = href.href;
      }
    } catch {}
  }
  return result;
}
function titleFrom(html, url) {
  const title = decode(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  return title.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/\s*(?:Checklist|\|.*)$/i, '').trim().slice(0, 180) || new URL(url).pathname.split('/').filter(Boolean).pop();
}
async function cached(database) {
  const rows = await database.prepare(`SELECT entry_json, scanned_at FROM source_harvester_cache WHERE source = ? ORDER BY scanned_at DESC LIMIT 2500`).bind(SOURCE).all();
  return (rows.results || []).flatMap(row => { try { return [{...JSON.parse(row.entry_json), scannedAt:row.scanned_at}]; } catch { return []; } });
}
export async function GET({ platform }) {
  return json({ ok:true, entries:await cached(db(platform)) });
}
export async function POST({request, platform, fetch}) {
  const body = await request.json().catch(() => ({}));
  const urls = [...new Set((Array.isArray(body.urls) ? body.urls : []).map(siteUrl).filter(Boolean))].slice(0, MAX_PAGES);
  if (!urls.length) return json({message:'Paste at least one Source full-checklist or csbmaster URL.'},{status:400});
  const database = db(platform);
  const results = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {redirect:'manual', headers:{accept:'text/html', 'user-agent':'Setbound checklist catalog/1.0'}});
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`Page returned HTTP ${response.status} or non-HTML content.`);
      const html = (await response.text()).slice(0, 1200000);
      const links = downloadLinks(html,url);
      const entry = {pageUrl:url,name:titleFrom(html,url),year:Number(String(url).match(/\b20\d{2}\b/)?.[0] || 0) || null,
        csvUrl:links.csv,pdfUrl:links.pdf, csvButton:/\b(?:Download\s*)?CSV\b/i.test(html), pdfButton:/\bDownload\s*PDF\b/i.test(html),checkedAt:new Date().toISOString()};
      await database.prepare(`INSERT INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'),datetime('now')) ON CONFLICT(page_url) DO UPDATE SET source=excluded.source,year=excluded.year,title=excluded.title,entry_json=excluded.entry_json,scanned_at=datetime('now'),updated_at=datetime('now')`).bind(url,SOURCE,entry.year,entry.name,JSON.stringify(entry)).run();
      results.push({ ...entry, ok:true });
    } catch(e) { results.push({pageUrl:url,ok:false,error:e?.message || 'Page could not be inspected.'}); }
  }
  return json({ok:true,results,entries:await cached(database)});
}
// Basic uncompressed ZIP writer; no extra dependency or server-side temp storage.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let k=0;k<8;k++) crc = (crc>>>1) ^ ((crc&1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function archive(files) {
  const encoder=new TextEncoder(), parts=[], directory=[];
  let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name), size=file.bytes.length, crc=crc32(file.bytes);
    const head=new Uint8Array(30+name.length), d=new DataView(head.buffer);
    d.setUint32(0,0x04034b50,true); d.setUint16(4,20,true); d.setUint32(14,crc,true);
    d.setUint32(18,size,true); d.setUint32(22,size,true); d.setUint16(26,name.length,true); head.set(name,30);
    parts.push(head,file.bytes);
    const central=new Uint8Array(46+name.length), c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true);
    c.setUint32(16,crc,true); c.setUint32(20,size,true); c.setUint32(24,size,true);
    c.setUint16(28,name.length,true); c.setUint32(42,offset,true); central.set(name,46);
    directory.push(central); offset+=head.length+size;
  }
  const directorySize=directory.reduce((n,b)=>n+b.length,0);
  const footer=new Uint8Array(22), end=new DataView(footer.buffer);
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);
  end.setUint16(10,files.length,true);end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...directory,footer],{type:'application/zip'});
}
// Download only a direct source file discovered from a cached entry. Never fetch an arbitrary user-supplied URL.
export async function PUT({request,platform,fetch}) {
  const body = await request.json().catch(()=>({}));
  const requested = Array.isArray(body.items) ? body.items.slice(0,30) : [];
  if (!requested.length) return json({message:'Select at least one available file.'},{status:400});
  const entries = await cached(db(platform));
  const byUrl = new Map(entries.map(x=>[x.pageUrl,x]));
  const files = [], failed = [];
  let total = 0;
  for (const item of requested) {
    const entry = byUrl.get(item.pageUrl);
    const ext = item.format === 'pdf' ? 'pdf' : item.format === 'csv' ? 'csv' : null;
    const link = ext && entry?.[ext+'Url'];
    if (!link || !siteUrl(new URL(entry.pageUrl).href)) { failed.push({pageUrl:item.pageUrl,format:ext,reason:'No verified direct download'});continue; }
    try {
      const u = new URL(link);
      if(u.protocol !== 'https:' || ![HOST,'www.'+HOST].includes(u.hostname)) throw new Error('Host not permitted');
      const response = await fetch(link, {redirect:'manual',headers:{accept:ext==='pdf'?'application/pdf':'text/csv,text/plain,application/octet-stream'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if(bytes.length > MAX_FILE || (total += bytes.length) > 80*1024*1024)throw new Error('Download size limit exceeded');
      if(ext==='pdf' && String.fromCharCode(...bytes.slice(0,4)) !== '%PDF')throw new Error('Not a PDF file');
      if(ext==='csv' && !/csv|plain|octet-stream/.test(response.headers.get('content-type')||''))throw new Error('Not a CSV response');
      const slug = new URL(entry.pageUrl).pathname.split('/').filter(Boolean).pop().replace(/[^a-z0-9-]/gi,'-');
      files.push({name:`${slug}.${ext}`,bytes});
    } catch(e){failed.push({pageUrl:item.pageUrl,format:ext,reason:e?.message||'Download failed'});}
  }
  if (!files.length) return json({message:'No directly downloadable files were available.',failed},{status:422});
  files.push({name:'download-report.json',bytes:new TextEncoder().encode(JSON.stringify({downloaded:files.map(x=>x.name),failed},null,2))});
  return new Response(archive(files),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="cardsmiths-checklists.zip"','cache-control':'no-store'}});
}
