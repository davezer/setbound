import fs from 'node:fs';
import path from 'node:path';
const paths = {
  discovery:'src/routes/api/admin/source-library/discover/+server.js',
  ui:'src/routes/admin/source-library/+page.svelte',
  cache:'src/routes/api/admin/source-library/+server.js',
  export:'src/routes/api/admin/source-library/export/+server.js'
};
const files=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,path.resolve(process.cwd(),p)]));
for(const [key,p] of Object.entries(files)) if(!fs.existsSync(p))throw Error('Missing '+paths[key]);
const original=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p,'utf8')]));
function once(s,anchor,replacement,name){const n=s.split(anchor).length-1;if(n!==1)throw Error(name+': expected exactly one unique anchor, got '+n+' — '+anchor.slice(0,75));return s.replace(anchor,replacement);}
let discovery=original.discovery;
const begin=discovery.indexOf('// Parent checklist links from the homepage release archive');
const end=discovery.indexOf('\nexport async function POST(',begin);
if(begin<0||end<0)throw Error('Discovery old parent scanner anchors missing');
const feed=`// The archive feed supplies authoritative parent release links. Never parse adjacent box links.
function archiveRows(html, archiveYear) {
  const found = new Map();
  for (const match of String(html).matchAll(/<a\\b([^>]*\\bclass\\s*=\\s*["'][^"']*\\blrow\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/a>/gi)) {
    const attrs=match[1];
    const attr=(key)=>attrs.match(new RegExp('\\\\b'+key+'\\\\s*=\\\\s*(?:"([^"]*)"|\\'([^\\']*)\\')','i'));
    const href=attr('href');
    const url=canonical(href?.[1]||href?.[2]||'',ROOT);
    if(!url||!new URL(url).pathname.startsWith('/full-checklist/'))continue;
    const checklist=attr('data-cc');
    if(!checklist||(checklist[1]||checklist[2])!=='1')continue;
    const nameTag=match[2].match(/<span\\b[^>]*class\\s*=\\s*["']n["'][^>]*>([\\s\\S]*?)<\\/span>/i);
    const name=strip(nameTag?.[1]||'')||nameFrom(url);
    const slugYear=new URL(url).pathname.match(/\\/(?:19|20)\\d{2}(?:-\\d{2})?-/)?.[0];
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
`;
discovery=discovery.slice(0,begin)+feed+discovery.slice(end);
const old=`  if (body.catalog === 'homepage-parents') {
    try {
      const response = await fetch(ROOT + '/', { redirect:'manual', headers:{accept:'text/html'} });
      if (!response.ok || !String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))
        return json({message:'Homepage archive HTML unavailable (HTTP '+response.status+'). No changes made.'},{status:502});
      const html=await response.text();
      if (html.length>8_000_000) return json({message:'Homepage HTML exceeds safety limit.'},{status:413});
      const entries=parentArchiveLinks(html);
      // Preview first. No cache mutation unless the admin explicitly requests save.
      if (body.save !== true) return json({ok:true,preview:true,found:entries.length,samples:entries.slice(0,15)});
      const added=await save(db(platform),entries,'homepage-parents');
      return json({ok:true,preview:false,found:entries.length,added,existing:entries.length-added});
    }catch(error){return json({message:error?.message||'Archive extraction failed. No changes made.'},{status:422});}
  }`;
const newer=`  if (body.catalog === 'homepage-parents') {
    const year=Number(body.year);
    if(!Number.isInteger(year)||year<2000||year>new Date().getFullYear()+1)
      return json({message:'Choose a valid archive year.'},{status:400});
    try {
      const entries=await fetchArchiveYear(fetch,year);
      if(body.save!==true)return json({ok:true,preview:true,year,found:entries.length,samples:entries.slice(0,15)});
      const database=db(platform);
      let added=0,updated=0;
      for(let i=0;i<entries.length;i+=50){
        const statements=entries.slice(i,i+50).map(entry=>{
          const year=entry.releaseYear||Number(entry.name.match(/^(?:19|20)\\d{2}/)?.[0])||null;
          const record={pageUrl:entry.pageUrl,name:entry.name,year,archiveYear:entry.archiveYear,archiveParent:true,sourceKind:'candidate',verifiedMaster:false,discoveredOnly:true};
          return database.prepare(\`INSERT OR IGNORE INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))\`)
            .bind(entry.pageUrl,SOURCE,year,entry.name,JSON.stringify(record));
        });
        const result=await database.batch(statements);
        added+=result.reduce((n,r)=>n+Number(r.meta?.changes||0),0);
      }
      // Existing inspected cache records are intentionally untouched. A separate authority list
      // lets us recognize feed parents, even when their names end in 'Box'.
      for(let i=0;i<entries.length;i+=50){
        const statements=entries.slice(i,i+50).map(entry=>database.prepare(\`UPDATE source_harvester_cache
          SET entry_json=json_set(entry_json,'$.archiveParent',json('true'),'$.archiveYear',?)
          WHERE page_url=? AND source=?\`).bind(entry.archiveYear,entry.pageUrl,SOURCE));
        await database.batch(statements);
      }
      return json({ok:true,preview:false,year,found:entries.length,added,existing:entries.length-added});
    }catch(error){return json({message:error?.message||'Feed discovery failed. No changes made.'},{status:422});}
  }`;
discovery=once(discovery,old,newer,'discovery feed handler');
let ui=original.ui;
const oldFunction=`body:JSON.stringify({catalog:'homepage-parents',save})`;
ui=once(ui,oldFunction,`body:JSON.stringify({catalog:'homepage-parents',year:archiveFeedYear,save})`,'ui payload');
ui=once(ui,` let links = $state('');`,` let archiveFeedYear = $state(2026);\n let archivePreview = $state([]);\n let links = $state('');`,'ui state');
const oldNote=`     note=save
       ? 'Homepage parent links: '+result.found+' found · '+result.added+' newly cached · '+result.existing+' already cached. Existing inspections preserved.'
       : 'PREVIEW ONLY: '+result.found+' year-prefixed parent link(s) found; '+result.samples.map(x=>x.name).slice(0,5).join(' · ')+'. No records changed. Verify these are top-level releases before saving.';`;
const newNote=`     archivePreview = save ? [] : result.samples||[];
     note=save
       ? 'Archive year '+result.year+': '+result.found+' parent releases · '+result.added+' new · '+result.existing+' already cached. Inspections preserved.'
       : 'PREVIEW ONLY: '+result.found+' top-level release links in '+result.year+'. No records changed.';`;
ui=once(ui,oldNote,newNote,'ui result');
const start=ui.indexOf('<div class="panel"><strong>Homepage release archive');
const finish=ui.indexOf('\n<div class="panel discovery">',start);
if(start<0||finish<0)throw Error('UI archive panel anchors missing');
const panel=`<div class="panel"><strong>Top-level release archive</strong><p>Discover parent checklists from the release directory (not box-format product listings). Preview before caching; existing D1 records and inspections remain untouched.</p><div class="tools"><label for="archive-feed-year">Archive year</label><select id="archive-feed-year" bind:value={archiveFeedYear} disabled={discoveryBusy || bulkBusy}>{#each Array.from({length:27},(_,i)=>2026-i) as y}<option value={y}>{y}</option>{/each}</select><button type="button" onclick={() => discoverHomepageParents(false)} disabled={discoveryBusy || busy || bulkBusy}>Preview parent releases</button><button type="button" class="secondary" onclick={() => discoverHomepageParents(true)} disabled={discoveryBusy || busy || bulkBusy}>Cache this year</button></div>{#if archivePreview.length}<div class="archive-preview"><strong>Sample parent releases</strong>{#each archivePreview as release}<div><a href={release.pageUrl} target="_blank" rel="noreferrer">{release.name}</a></div>{/each}</div>{/if}<small>One archive year per request. The archive's year can differ from the year in a product name. Formats next to release links are ignored. Previous product-format scan remains below for reference only.</small></div>`;
ui=ui.slice(0,start)+panel+ui.slice(finish);
ui=once(ui,'.panel{padding:', '.archive-preview{max-height:250px;overflow:auto;font-size:.8rem;display:grid;gap:.3rem}.archive-preview a{color:var(--blue)}.panel{padding:','ui CSS');
let cache=original.cache;
// Treat authoritative archive parents as candidates, even when heuristic suffix classification says format.
const previous=`sourceKind:sourceCategory(JSON.parse(row.entry_json).pageUrl).kind`;
cache=once(cache,previous,`sourceKind:JSON.parse(row.entry_json).archiveParent===true?'candidate':sourceCategory(JSON.parse(row.entry_json).pageUrl).kind`,'cache classification');
const priorCat=`const category = sourceCategory(url);`;
cache=once(cache,priorCat,`const previousEntry = await database.prepare('SELECT entry_json FROM source_harvester_cache WHERE page_url=? AND source=?').bind(url,SOURCE).first();
      let archiveParent=false, downloadedAt=null, archiveYear=null;
      try{const old=JSON.parse(previousEntry?.entry_json||'{}');archiveParent=old.archiveParent===true;downloadedAt=old.downloadedAt||null;archiveYear=old.archiveYear||null;}catch{}
      const rawCategory=sourceCategory(url);
      const category=archiveParent ? {kind:'candidate',masterUrl:null} : rawCategory;`,'inspection classification');
cache=once(cache,`resolvedUrl, csvUrl:links.csv,`,`resolvedUrl, archiveParent, archiveYear, downloadedAt, csvUrl:links.csv,`,'inspection preserve markers');
let exp=original.export;
exp=once(exp,`if (sourceCategory(pageUrl).kind !== 'candidate' || entry.extractionStatus !== 'ready')`,`if ((sourceCategory(pageUrl).kind !== 'candidate' && entry.archiveParent !== true) || entry.extractionStatus !== 'ready')`,'export authority');
const changed={discovery,ui,cache,export:exp};
const backups=path.resolve(process.cwd(),'.setbound-backups','archive-feed-'+Date.now());
fs.mkdirSync(backups,{recursive:true});
for(const [k,p] of Object.entries(files))fs.writeFileSync(path.join(backups,k+'.original'),original[k]);
try{for(const [k,p] of Object.entries(files))fs.writeFileSync(p,changed[k]);}
catch(e){for(const [k,p] of Object.entries(files))fs.writeFileSync(p,original[k]);throw e;}
console.log('Installed release archive feed discovery. Original files backed up to '+backups);
