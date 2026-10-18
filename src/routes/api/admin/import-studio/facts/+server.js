import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { parseChecklistInsiderEnrichment } from '$lib/server/checklist-insider-enrichment.js';

const FORMAT = {
  hobby: ['Hobby box', 10], breaker: ['Breaker box', 20], blaster: ['Blaster / Value box', 30],
  mega: ['Mega box', 40], jumbo: ['Jumbo box', 50], retail: ['Retail box', 60],
  fat_pack: ['Fat pack', 70], hanger: ['Hanger', 80], collector: ['Collector / Tin', 90],
  inserts: ['Notable inserts', 100]
};
const VARIANTS = ['sapphire','black','logofractor','cosmic','galaxy','pristine','finest','sterling',
  'midnight','definitive','dynasty','museum','heritage','inception','tribute','gilded',
  'chrome','mega','jumbo','blaster','breaker','update','series 1','series 2','flagship',
  'platinum','anniversary','bowman u','best','hoops','three','topps now','first edition'];
const COMMON = new Set(['topps','bowman','upper','deck','panini','cards','card','baseball','basketball','football',
  'hockey','soccer','wrestling','racing','trading','box','hobby','sealed','case','edition','2025','2026','2027']);
function canonical(s='') {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/®|™/g,'').replace(/\bbowman university\b/g,'bowman u')
    .replace(/^\s*\d{4}(?:\s*[-–]\s*\d{2,4})?\s+/,'')
    .replace(/\b(preorder|pre order|hobby box|sealed case)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function has(s,word) { const a=` ${canonical(s)} `; return a.includes(` ${word} `); }
function safeMatch(productName, candidateName) {
  if (!candidateName) return false;
  for (const word of VARIANTS) if (has(productName,word)!==has(candidateName,word)) return false;
  const a=canonical(productName).split(' ').filter(x=>x&&!COMMON.has(x));
  const b=new Set(canonical(candidateName).split(' '));
  if (!a.length) return canonical(productName)===canonical(candidateName);
  return a.every(x=>b.has(x));
}
function parseJson(s) { try {return JSON.parse(s||'{}');}catch{return null;} }
function cleanup(s='') {
  const text=String(s).replace(/\r/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ');
  return text.split(/\n+/).map(x=>x.trim()).filter(Boolean).filter(x=>
    !/(all sales are final|art subject to change|not responsible for typographical|terms and conditions|estimated shipping)/i.test(x));
}
// Deliberately limited to explicit, self-contained quantities. No guessed odds or hits.
function explicitConfiguration(text='') {
  const result=[];
  const lines=cleanup(text);
  const patterns=[
    /\b\d+\s+cards?\s+per\s+pack\b/i,
    /\b\d+\s+packs?\s+per\s+box\b/i,
    /\b\d+\s+boxes?\s+per\s+case\b/i,
    /\b\d+\s+(?:chrome\s+)?autographs?\s+(?:per|in\s+each)\s+box\b/i,
    /\b\d+\s+(?:autograph\s+)?relics?\s+per\s+box\b/i,
    /\b\d+\s+(?:numbered\s+)?parallels?\s+per\s+box\b/i
  ];
  for (const line of lines) {
    // Keep only simple fact fragments; never ingest a paragraph of marketing copy.
    const chunks=line.split(/[;•]/).map(x=>x.trim());
    for (const chunk of chunks) if (chunk.length<=130 && patterns.some(p=>p.test(chunk))) result.push(chunk);
  }
  return [...new Set(result)].slice(0,15).join('\n');
}
function formatFromLaunch(name='') {
  const v=canonical(name);
  if (/\b(jumbo)\b/.test(v)) return 'jumbo';
  if (/\b(mega)\b/.test(v)) return 'mega';
  if (/\b(blaster|value box)\b/.test(v)) return 'blaster';
  if (/\b(breaker)\b/.test(v)) return 'breaker';
  if (/\b(hanger)\b/.test(v)) return 'hanger';
  if (/\b(retail)\b/.test(v)) return 'retail';
  if (/\b(collector|tin)\b/.test(v)) return 'collector';
  if (/\b(hobby)\b/.test(v)) return 'hobby';
  return null;
}
async function productRow(database,id) {
  return database.prepare(`SELECT p.id,p.name,p.year,p.slug,p.release_date,p.image_key,
    m.name manufacturer_name, sp.name sport_name, s.source_url checklist_url
    FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id JOIN sports sp ON sp.id=p.sport_id
    LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?`).bind(id).first();
}
async function buildDraft(database,fetch,id) {
  const p=await productRow(database,id);
  if (!p) return {id,status:'missing',message:'Product not found.'};
  const formats=await database.prepare('SELECT format_key,details FROM product_formats WHERE product_id=?').bind(id).all();
  const existing=new Set((formats.results||[]).filter(r=>String(r.details||'').trim()).map(r=>r.format_key));
  const proposals=[];const sources=[];
  const cache=await database.prepare(`SELECT source,page_url,entry_json FROM source_harvester_cache
    WHERE source IN ('topps-launch-metadata','topps-metadata','checklistinsider') AND (year=? OR year IS NULL)
    LIMIT 5000`).bind(Number(p.year)).all();
  const entries=(cache.results||[]).map(r=>({...r,entry:parseJson(r.entry_json)})).filter(x=>x.entry);
  const manufacturer=String(p.manufacturer_name||'').toLowerCase();
  if (manufacturer==='topps'||manufacturer==='bowman') {
    for (const r of entries.filter(r=>r.source==='topps-launch-metadata')) {
      const e=r.entry;
      if (Number(e.productId)!==Number(id) || !safeMatch(p.name,e.launchProduct||'')) continue;
      const key=formatFromLaunch(e.launchProduct||'');
      const details=explicitConfiguration(e.description||e.overview||'');
      if(key && !existing.has(key) && details) proposals.push({key,details,source:'Topps launch cache',sourceUrl:e.sourceUrl||'',sourceName:e.launchProduct});
      sources.push({name:'Topps launch cache',url:e.sourceUrl||'',status:details?'structured facts found':'no explicit configuration'});
    }
    for(const r of entries.filter(r=>r.source==='topps-metadata')) {
      const e=r.entry;
      if(!safeMatch(p.name,e.name||'')) continue;
      sources.push({name:'Topps product cache',url:e.pageUrl||'',status:'overview only; no box figures approved'});
    }
  }
// Preferred facts source: Checklist Insider, even when the checklist was imported
// from a manufacturer's own download URL. Only high-certainty identity matches
// are cached. An uncertain match is not a match.
const ciRows = entries.filter((row) => row.source === 'checklistinsider');
const stable = (value = '') => canonical(value)
  .replace(/\b(checklist|guide|download|review|cards|trading|card)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
const sourceIdentity = (row) => row.entry.name || row.entry.title || '';
const expectedIdentity = stable(p.name);
const expectedTokens = expectedIdentity.split(' ').filter(Boolean);
const identityIsSafe = (name) => {
  const got = stable(name);
  if (!got || !expectedIdentity) return false;
  // Never confuse product families or special variants. Require all meaningful
  // tokens to agree, not substring/Jaccard matching.
  if (!safeMatch(expectedIdentity, got) || !safeMatch(got, expectedIdentity)) return false;
  const actualTokens = got.split(' ').filter(Boolean);
  return expectedTokens.length === actualTokens.length &&
    expectedTokens.every((token, i) => token === actualTokens[i]);
};
const sourceManufacturerMatches = (row) => {
  const stated = canonical(row.entry.manufacturer || row.entry.brand || '');
  if (!stated) return true; // Unspecified is not evidence of a mismatch.
  const expected = canonical(p.manufacturer_name || '');
  if (stated === expected) return true;
  return (expected === 'bowman' && stated === 'topps') ||
    (expected === 'topps' && stated === 'bowman' && /\bbowman\b/i.test(p.name));
};
const sourceSportMatches = (row) => {
  const stated = canonical(row.entry.sport || '');
  if (!stated || !p.sport_name || stated === 'unknown sport') return true;
  return stated === canonical(p.sport_name);
};
const ciCandidates = ciRows.filter((row) => {
  const entry = row.entry;
  if (Number(entry.year || p.year) !== Number(p.year)) return false;
  if (!sourceManufacturerMatches(row) || !sourceSportMatches(row)) return false;
  if (p.checklist_url && entry.checklistUrl === p.checklist_url) {
    return identityIsSafe(sourceIdentity(row));
  }
  return identityIsSafe(sourceIdentity(row));
});
const uniqueCi = [...new Map(ciCandidates.map((row) => [row.entry.pageUrl || row.page_url, row])).values()];
let ci = uniqueCi.length === 1 ? uniqueCi[0] : null;
// A previously confirmed connection can be reused when the source catalog
// has rotated. Validate the stored product identity and fetched H1 again.
if (!ci && uniqueCi.length === 0) {
  const linked = await database.prepare(`SELECT entry_json FROM source_harvester_cache
    WHERE source='studio-ci-link' AND page_url=? LIMIT 1`)
    .bind(`studio-ci:${p.id}`).first();
  const saved = parseJson(linked?.entry_json);
  if (Number(saved?.productId) === Number(p.id) &&
      identityIsSafe(saved?.productName) && identityIsSafe(saved?.sourceTitle)) {
    ci = {page_url:saved.pageUrl,entry:{pageUrl:saved.pageUrl,name:saved.sourceTitle,year:p.year}};
  }
}
if (uniqueCi.length > 1) sources.push({
  name: 'Checklist Insider', url: '', status: `${uniqueCi.length} matching article candidates; manual source review required`
});
if (ci) {
  const page = ci.entry.pageUrl || ci.page_url;
  try {
    const u = new URL(page);
    if (u.protocol === 'https:' && /(^|\.)checklistinsider\.com$/.test(u.hostname)) {
      const response = await fetch(u.href, {headers:{accept:'text/html','user-agent':'Setbound/1.0'}});
      if (response.ok) {
        const html = await response.text();
        const parsed = parseChecklistInsiderEnrichment(html, u.href, p.name);
        // The article H1 must independently confirm identity. Do not trust the
        // parser's fallback to the requested product name if no H1 exists.
        const pageTitlePresent = /<h1\b/i.test(html);
        if (identityIsSafe(parsed.title) && pageTitlePresent) {
          for (const f of parsed.formats || []) {
            const key = String(f.key || '');
            const details = explicitConfiguration(f.details || '');
            if (FORMAT[key] && !existing.has(key) && details) {
              const previous = proposals.findIndex(x => x.key === key);
              if (previous >= 0) proposals.splice(previous, 1); // CI wins a field-level tie.
              proposals.push({key,details,source:'Checklist Insider',sourceUrl:u.href,sourceName:parsed.title});
            }
          }
          const date = String(parsed.releaseDate || '');
          if (!p.release_date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            proposals.push({key:'release_date',details:date,source:'Checklist Insider',sourceUrl:u.href,sourceName:parsed.title});
          }
          sources.push({name:'Checklist Insider',url:u.href,status:'verified product identity'});
          // Save a product-ID-specific source bridge. Never changes the source
          // associated with the imported checklist.
          await database.prepare(`INSERT INTO source_harvester_cache
            (page_url,source,year,title,entry_json,scanned_at,updated_at)
            VALUES (?,'studio-ci-link',?,?,?,datetime('now'),datetime('now'))
            ON CONFLICT(page_url) DO UPDATE SET
              entry_json=excluded.entry_json,updated_at=datetime('now')`)
            .bind(`studio-ci:${p.id}`,Number(p.year),p.name,
              JSON.stringify({productId:p.id,productName:p.name,pageUrl:u.href,sourceTitle:parsed.title}))
            .run();
        } else {
          sources.push({name:'Checklist Insider',url:u.href,status:'article identity mismatch; rejected'});
        }
      } else sources.push({name:'Checklist Insider',url:u.href,status:`HTTP ${response.status}`});
    }
  } catch { sources.push({name:'Checklist Insider',url:'',status:'article unavailable'}); }
}

  return {id,product:p.name,status:proposals.length?'review':'no-facts',proposals,sources,
    existing:{releaseDate:p.release_date,artwork:!!p.image_key,formats:[...existing]},
    message:proposals.length?`${proposals.length} missing factual fields proposed`:'No safely matched missing configurations found.'};
}
export async function GET({url,platform,fetch}) {
  const id=Number(url.searchParams.get('productId'));
  if(!Number.isSafeInteger(id)||id<1) return json({message:'Invalid product ID.'},{status:400});
  try{return json(await buildDraft(db(platform),fetch,id));}catch(error){return json({message:error?.message||'Facts gathering failed.'},{status:500});}
}
export async function POST({request,platform,fetch}) {
  const body=await request.json();const id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<1||!Array.isArray(body.keys))return json({message:'Invalid review selection.'},{status:400});
  const approved=[...new Set(body.keys.map(String))];
  if(!approved.length) return json({message:'Select at least one proposed fact.'},{status:400});
  const database=db(platform);
  // Recompute proposals server-side: client values are never trusted.
  const draft=await buildDraft(database,fetch,id);
  if(draft.status!=='review')return json({message:'No verified missing facts to apply.'},{status:409});
  const available=new Map(draft.proposals.map(p=>[p.key,p]));
  const statements=[];const applied=[];
  for(const key of approved) {
    const p=available.get(key);if(!p)continue;
    if(key==='release_date'){
      statements.push(database.prepare(`UPDATE products SET release_date=?,updated_at=datetime('now') WHERE id=? AND (release_date IS NULL OR trim(release_date)='')`).bind(p.details,id));
    }else if(FORMAT[key]){
      const [label,sort]=FORMAT[key];
      // Idempotent insert; existing configurations are never overwritten.
      statements.push(database.prepare(`INSERT OR IGNORE INTO product_formats(product_id,format_key,label,details,sort_order,updated_at)
        VALUES(?,?,?,?,?,datetime('now'))`).bind(id,key,label,p.details,sort));
    }
    applied.push(key);
  }
  if(statements.length)await database.batch(statements);
  return json({ok:true,applied,productId:id});
}
