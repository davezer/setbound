import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const HOST = 'cardsmithsbreaks.com';
const MAX_HTML = 3_000_000;
const clean = s => String(s ?? '').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#0*39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;/gi,'–').replace(/&mdash;/gi,'—').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function approved(raw) {
  try { const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&[HOST,'www.'+HOST].includes(u.hostname)&&/^\/full-checklist\/[a-z0-9-]+\/$/i.test(u.pathname)?u.href:null; }catch{return null;}
}
async function findParent(database,p) {
  const rows=await database.prepare("SELECT entry_json FROM source_harvester_cache WHERE source='cardsmithsbreaks' AND json_extract(entry_json,'$.archiveParent')=1 LIMIT 3000").all();
  const slug=String(p.original_filename||'').replace(/\.csv$/i,'').toLowerCase();const hits=[];
  for(const row of rows.results||[]){let e;try{e=JSON.parse(row.entry_json)}catch{continue}const u=approved(e.pageUrl);if(!u)continue;const name=new URL(u).pathname.split('/').filter(Boolean).at(-1);if(approved(p.source_url)===u||slug===name||p.slug===name)hits.push(u);}
  const matches=[...new Set(hits)];if(matches.length!==1)throw Error(matches.length?'Ambiguous source page: verify product mapping.':'No exact verified source page match.');return matches[0];
}
function extract(html) {
  // Extract only the editorial Parallel Guide, not the odds table or card rows.
  const heading=/<h[2-4]\b[^>]*>\s*Parallel Guide\s*<\/h[2-4]>/i.exec(html);
  if(!heading)return [];
  const start=heading.index+heading[0].length;
  const next=/<h[1-3]\b[^>]*>/i.exec(html.slice(start));
  const section=html.slice(start,start+(next?next.index:Math.min(90000,html.length-start)));
  const entries=[];
  for(const m of section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
    const line=clean(m[1]); if(!line||line.length>550)continue;
    const match=line.match(/^(.+?)\s*[–—-]\s*(unnumbered|#?[’']?d to\s*[\d,]+|1\s*\/\s*1|\/?\d+)\s*(?:\((.+)\))?$/i);
    if(!match)continue;
    const name=match[1].trim();let number=match[2].replace(/,/g,'').trim();
    if(/unnumbered/i.test(number))number='Unnumbered';else if(/1\s*\/\s*1/.test(number))number='1/1';else number='/'+(number.match(/\d+/)?.[0]||'');
    const context=match[3]||'';
    const bits=context.split(/;\s*/);const sectionNames=(bits[0]||'').trim();
    const exclusive=bits.slice(1).join('; ').trim();
    if(!name||number==='/'||name.length>110)continue;
    entries.push({name,number,appliesTo:sectionNames,availability:exclusive});
  }
  return entries.slice(0,600);
}
function matchesSection(context,name) {
  const normalized=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const c=normalized(context), n=normalized(name);
  // Only exact named checklist sections or explicit 'and' separated names; no fuzzy guessing.
  if(!c||/\b\d+\s+(?:insert|autograph|base|relic)\s+sets?\b/i.test(context))return false;
  const segments=context.split(/\s*(?:,|\band\b)\s*/i).map(normalized);
  return segments.includes(n) || c===n;
}
async function build(database,id,fetcher){
  const p=await database.prepare('SELECT p.id,p.slug,p.name,p.year,p.primary_source_id,s.source_url,s.original_filename FROM products p LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?').bind(id).first();
  if(!p)throw Error('Product not found.');
  const url=await findParent(database,p);
  const response=await fetcher(url,{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(12000)});
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))throw Error('Source HTML unavailable.');
  if(Number(response.headers.get('content-length')||0)>MAX_HTML)throw Error('Source HTML too large.');
  const html=await response.text();if(html.length>MAX_HTML)throw Error('Source HTML too large.');
  const entries=extract(html); if(!entries.length)throw Error('No structured Parallel Guide found. Nothing changed.');
  const checklists=await database.prepare('SELECT cl.id,cl.name,cd.parallels_json FROM checklists cl LEFT JOIN checklist_details cd ON cd.checklist_id=cl.id WHERE cl.product_id=? ORDER BY cl.sort_order').bind(id).all();
  const proposals=[];const unmatched=[];
  for(const entry of entries){
    const matches=(checklists.results||[]).filter(c=>matchesSection(entry.appliesTo,c.name));
    if(matches.length===0){unmatched.push(entry);continue;}
    for(const cl of matches)proposals.push({checklistId:cl.id,checklistName:cl.name,name:entry.name,number:entry.number,availability:entry.availability});
  }
  const existing=(checklists.results||[]).filter(x=>x.parallels_json&&x.parallels_json!=='[]').map(x=>x.name);
  const grouped=new Map();for(const p of proposals){if(!grouped.has(p.checklistId))grouped.set(p.checklistId,[]);const list=grouped.get(p.checklistId);if(!list.some(x=>x.name===p.name&&x.number===p.number))list.push({name:p.name,number:p.number,availability:p.availability});}
  return {url,entries:entries.length,proposals:[...grouped].map(([checklistId,parallels])=>({checklistId,checklistName:(checklists.results||[]).find(x=>x.id===checklistId)?.name,parallels})),unmatched:unmatched.slice(0,15),unmatchedCount:unmatched.length,existing};
}
export async function POST({request,platform,fetch,locals}){
  if(!locals.isAdmin)return json({message:'Admin access required.'},{status:403});
  const body=await request.json().catch(()=>({}));const id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<=0)return json({message:'Invalid product ID.'},{status:400});
  if(!['preview','apply'].includes(body.mode))return json({message:'Invalid mode.'},{status:400});
  try{
    const database=db(platform);const report=await build(database,id,fetch);
    if(body.mode==='preview')return json({ok:true,productId:id,...report});
    if(body.confirmed!==true)return json({message:'Review confirmation is required.'},{status:400});
    if(!report.proposals.length)return json({message:'No exact checklist matches. Nothing changed.'},{status:409});
    // Review and save only new parallel data, never overwrite an existing curated ladder.
    const statements=[];
    for(const item of report.proposals){
      statements.push(database.prepare(`INSERT INTO checklist_details (checklist_id,parallels_json,notes_json,updated_at) VALUES (?,?,'[]',datetime('now')) ON CONFLICT(checklist_id) DO UPDATE SET parallels_json=excluded.parallels_json,updated_at=datetime('now') WHERE checklist_details.parallels_json IS NULL OR TRIM(checklist_details.parallels_json)='' OR TRIM(checklist_details.parallels_json)='[]'`).bind(item.checklistId,JSON.stringify(item.parallels)));
    }
    const outcomes=await database.batch(statements);
    return json({ok:true,saved:outcomes.reduce((n,r)=>n+Number(r.meta?.changes||0),0),sections:report.proposals.length,skippedExisting:report.existing.length});
  }catch(e){return json({message:e?.message||'Parallel source scan failed.'},{status:422});}
}
