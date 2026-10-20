import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const HOST = 'cardsmithsbreaks.com';
const SOURCE = 'cardsmithsbreaks';
const allowedYears = new Set(['2026','2025','2024','2023','older']);
const formatKeys = new Map([
  ['hobby','Hobby'], ['value','Value'], ['blaster','Blaster'], ['jumbo','Jumbo'],
  ['mega','Mega'], ['hanger','Hanger'], ['retail','Retail'], ['fat pack','Fat Pack'],
  ['choice','Choice'], ['delight','Breaker Delight'], ['breaker delight','Breaker Delight'],
  ['h2','H2'], ['tin','Tin'], ['collector','Collector']
]);
function safeUrl(raw) {
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
    [HOST,'www.'+HOST].includes(u.hostname) && /^\/full-checklist\/[a-z0-9-]+\/$/i.test(u.pathname) ? u.href : null; }
  catch { return null; }
}
function slugOf(url) { return new URL(url).pathname.split('/').filter(Boolean).at(-1); }
function normalized(s) { return String(s || '').toLowerCase().replace(/&(?:amp|#0?38);/g,' and ').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function attrs(s) {
  const m = {};
  for (const a of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) m[a[1].toLowerCase()] = a[2] ?? a[3];
  return m;
}
function decode(s) { return String(s||'').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&ndash;/g,'–').replace(/&mdash;/g,'—'); }
function strip(s) { return decode(String(s||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(); }
async function product(database, id) {
  return database.prepare(`SELECT p.id,p.slug,p.name,p.year,p.release_date,p.product_notes,p.primary_source_id,s.source_url,s.original_filename
    FROM products p LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?`).bind(id).first();
}
async function exactParent(database,p) {
  const rows = await database.prepare(`SELECT entry_json FROM source_harvester_cache WHERE source=? AND json_extract(entry_json,'$.archiveParent')=1 LIMIT 3000`).bind(SOURCE).all();
  const candidates = [];
  const fileSlug = String(p.original_filename||'').replace(/\.csv$/i,'').toLowerCase();
  const primaryUrl = safeUrl(p.source_url);
  for(const row of rows.results||[]) {
    let e;try{e=JSON.parse(row.entry_json)}catch{continue}
    const u=safeUrl(e.pageUrl); if(!u || !allowedYears.has(String(e.archiveYear)))continue;
    const slug=slugOf(u);
    // Only exact parent URL, exact original CSV filename, or exact product slug.
    if(primaryUrl===u || (fileSlug && fileSlug===slug) || p.slug===slug) candidates.push({...e,pageUrl:u});
  }
  const urls = [...new Set(candidates.map(x=>x.pageUrl))];
  return urls.length===1 ? candidates[0] : {ambiguous:urls.length>1,none:!urls.length};
}
async function archiveFacts(fetchFn,entry) {
  const feed=`https://${HOST}/wp-admin/admin-ajax.php?action=csb_cc_archive&y=${encodeURIComponent(entry.archiveYear)}`;
  const res=await fetchFn(feed,{redirect:'manual',headers:{accept:'text/html'}});
  if(!res.ok || !String(res.headers.get('content-type')||'').includes('text/html'))throw Error('Release directory unavailable (HTTP '+res.status+').');
  if(Number(res.headers.get('content-length')||0)>5_000_000)throw Error('Release directory response too large.');
  const html=await res.text();if(html.length>5_000_000)throw Error('Release directory response too large.');
  for(const row of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a=attrs(row[1]);
    if(safeUrl(a.href)!==entry.pageUrl || a['data-cc']!=='1')continue;
    const time=Number(a['data-ts']);
    const date=Number.isSafeInteger(time)&&time>946684800&&time<4102444800 ? new Date(time*1000).toISOString().slice(0,10) : null;
    const display=strip(row[2].match(/<span\b[^>]*class=["']f["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const formats=[...new Set(display.split(/[·,|]/).map(x=>x.trim()).filter(Boolean))].map(label=>({label,key:[...formatKeys].find(([k])=>label.toLowerCase()===k)?.[0]||null}));
    return {date,formats,archiveName:strip(row[2].match(/<span\b[^>]*class=["']n["'][^>]*>([\s\S]*?)<\/span>/i)?.[1])};
  }
  throw Error('Exact parent URL was not present in the archive response. Nothing saved.');
}
export async function POST({request,platform,fetch}) {
  const body=await request.json().catch(()=>({}));
  const id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<1)return json({message:'Invalid product.'},{status:400});
  const database=db(platform),p=await product(database,id);
  if(!p)return json({message:'Product not found.'},{status:404});
  const entry=await exactParent(database,p);
  if(!entry.pageUrl)return json({message:entry.ambiguous?'Multiple exact source matches; review manually.':'No exact archive-confirmed parent checklist matched this import. No metadata was guessed.'},{status:404});
  try {
    const facts=await archiveFacts(fetch,entry);
    if(body.mode==='preview')return json({ok:true,productId:id,sourceUrl:entry.pageUrl,releaseDate:facts.date,existingDate:p.release_date||'',formats:facts.formats,archiveName:facts.archiveName,existingNotes:!!p.product_notes});
    if(body.mode!=='apply')return json({message:'Unknown operation.'},{status:400});
    // Explicitly opt in. Refuse to replace existing dates by default.
    const doDate=body.releaseDate===true && !!facts.date && !p.release_date;
    const chosen=Array.isArray(body.formats)?body.formats:[];
    const recognized=[...new Set(chosen.filter(x=>typeof x==='string' && facts.formats.some(f=>f.key===x)).filter(x=>formatKeys.has(x)))];
    if(!doDate && !recognized.length)return json({message:'No eligible empty fields selected.'},{status:400});
    const statements=[];
    if(doDate)statements.push(database.prepare("UPDATE products SET release_date=?,updated_at=datetime('now') WHERE id=? AND (release_date IS NULL OR release_date='')").bind(facts.date,id));
    for(const key of recognized){
      const exists=await database.prepare('SELECT id FROM product_formats WHERE product_id=? AND format_key=?').bind(id,key).first();
      if(exists)continue;
      const details='Listed as a '+formatKeys.get(key)+' configuration in source release directory.';
      statements.push(database.prepare("INSERT OR IGNORE INTO product_formats (product_id,format_key,label,details,sort_order,updated_at) VALUES (?,?,?,?,100,datetime('now'))").bind(id,key,formatKeys.get(key),details));
    }
    if(!statements.length)return json({message:'All selected fields already have values.'},{status:409});
    await database.batch(statements);
    return json({ok:true,productId:id,releaseDate:doDate?facts.date:null,formatsAdded:statements.length-(doDate?1:0)});
  }catch(e){return json({message:e?.message||'Metadata lookup failed; nothing saved.'},{status:502});}
}
