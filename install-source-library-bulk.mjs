import fs from 'node:fs';
import path from 'node:path';

const pagePath='src/routes/admin/source-library/+page.svelte';
const discoverPath='src/routes/api/admin/source-library/discover/+server.js';
const masterPath='src/lib/server/master-source.js';
for (const p of [pagePath,discoverPath,masterPath]) if (!fs.existsSync(p)) throw Error('Missing '+p+'. Run from your Setbound project root.');
const originals=new Map([pagePath,discoverPath,masterPath].map(p=>[p,fs.readFileSync(p,'utf8')]));
const next=new Map(originals);
function swap(p,oldText,newText) {
 const s=next.get(p); const parts=s.split(oldText);
 if(parts.length!==2) throw Error('Expected one exact anchor in '+p+': '+oldText.slice(0,110)+' (found '+(parts.length-1)+'). Nothing changed.');
 next.set(p,parts.join(newText));
}
// Format-specific suffixes, preserving standalone product names.
if (!next.get(masterPath).includes('value-box(?:-(?:ea|se|cee))?')) swap(masterPath,
'const FORMAT_SUFFIX = /(?:-(?:mega-box|jumbo-box|value-box|hanger-box|blaster-box|hobby-box|hobby-tins?|advent-calendar|retail-box|fat-pack|fat-packs|breaker-box|collector-box|super-box|tin|tins))$/i;',
'const FORMAT_SUFFIX = /-(?:mega-box|jumbo-box|value-box(?:-(?:ea|se|cee))?|hanger-box|blaster-box|hobby-box|hobby-tins?|advent-calendar|retail-box|fat-packs?|breaker-box|breaker-delight|collector-box|super-box|tins?)(?:-[a-z]{2,3})?$/i;');
if (!next.get(pagePath).includes("x.sourceKind==='candidate' && x.extractionStatus==='ready').length")) swap(pagePath,"let masterCount = $derived(entries.filter(x=>x.extractionStatus==='ready').length);", "let masterCount = $derived(entries.filter(x=>x.sourceKind==='candidate' && x.extractionStatus==='ready').length);");
swap(pagePath,"let statusFilter = $state('ready');", "let statusFilter = $state('ready');\n let bulkBusy = $state(false), stopRequested = $state(false), bulkProgress = $state('');\n let readyVisible = $derived(showing.filter(x => x.sourceKind==='candidate' && x.extractionStatus==='ready'));\n let generatedSelected = $derived(chosen.filter(x=>x.endsWith('|csv-generated') && entries.some(e=>e.pageUrl===x.slice(0,-14) && e.sourceKind==='candidate' && e.extractionStatus==='ready')));");
// do not create a forward dependency cycle: showing derives only from entries and filter, safe for readyVisible.
swap(pagePath,
" async function catalogStep(reset = false) {",
` async function refreshSources(){
   const r=await fetch('/api/admin/source-library');
   if(!r.ok)throw Error('Unable to refresh source cache (HTTP '+r.status+').');
   const j=await r.json();entries=j.entries||[];
 }
 function stopBulk(){stopRequested=true;bulkProgress='Stopping after the current request…';}
 function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
 async function scanTwenty(){
   if(bulkBusy||busy||discoveryBusy||!discoveryNextPage)return;
   bulkBusy=true;stopRequested=false;error='';note='';
   let checked=0, added=0;
   try{
     while(checked<20 && discoveryNextPage && !stopRequested){
       const left=20-checked;
       const r=await fetch('/api/admin/source-library/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nextPage:discoveryNextPage,totalPages:discoveryTotalPages,limit:Math.min(3,left)})});
       const j=await r.json();if(!r.ok)throw Error(j.message||'Catalog scan failed.');
       const n=j.pagesScanned||0;if(!n)throw Error('No pages returned. Stopped to prevent repeating the same page.');
       checked+=n;added+=j.added||0;discoveryScanned+=n;discoveredPages+=j.links||0;newPages+=j.added||0;
       discoveryNextPage=j.nextPage;discoveryTotalPages=j.totalPages||discoveryTotalPages;
       bulkProgress='Scanned '+checked+'/20 archive pages · '+added+' new entries';
       if(checked<20&&!stopRequested)await sleep(350);
     }
     await refreshSources();note=bulkProgress+(stopRequested?' · Stopped.':' · Finished.');
   }catch(e){error=(e?.message||'Scan failed')+' Completed '+checked+' pages; resume using the next-page control.';try{await refreshSources()}catch{}}
   finally{bulkBusy=false;stopRequested=false;}
 }
 async function inspectSixty(){
   if(bulkBusy||busy||discoveryBusy)return;
   bulkBusy=true;stopRequested=false;error='';note='';
   let checked=0,ready=0,unavailable=0,failed=0;
   try{
     while(checked<60&&!stopRequested){
       const urls=entries.filter(x=>x.sourceKind==='candidate'&&!x.extractionStatus).slice(0,Math.min(12,60-checked)).map(x=>x.pageUrl);
       if(!urls.length)break;
       const r=await fetch('/api/admin/source-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})});
       const j=await r.json();if(!r.ok)throw Error(j.message||'Batch inspection failed');
       checked+=urls.length;ready+=(j.results||[]).filter(x=>x.extractionStatus==='ready').length;
       unavailable+=(j.results||[]).filter(x=>x.extractionStatus==='unavailable').length;
       failed+=(j.results||[]).filter(x=>!x.ok).length;
       entries=j.entries||[];
       bulkProgress='Inspected '+checked+'/60 · '+ready+' CSV ready · '+unavailable+' unavailable · '+failed+' request failures';
       if(failed){note='Stopped on request failures; retry after investigating.';break;}
       if(checked<60&&!stopRequested)await sleep(350);
     }
     note=bulkProgress+(stopRequested?' · Stopped.':' · Finished.');
   }catch(e){error=(e?.message||'Inspection failed')+' · '+checked+' inspected so far.';try{await refreshSources()}catch{}}
   finally{bulkBusy=false;stopRequested=false;}
 }
 function selectReadyFifty(){
   const picks=readyVisible.slice(0,50).map(x=>x.pageUrl+'|csv-generated');
   chosen=[...new Set([...chosen,...picks])];note='Selected '+picks.length+' CSV-ready master checklists (from current filter).';
 }
 async function downloadFifty(){
   const urls=[...new Set(generatedSelected.map(v=>v.slice(0,-14)))].slice(0,50);
   if(!urls.length){error='Select at least one CSV-ready release first.';return;}
   if(bulkBusy||busy||discoveryBusy)return;
   bulkBusy=true;stopRequested=false;error='';note='';
   let done=0;
   try{
     for(let i=0;i<urls.length&&!stopRequested;i+=10){
       const segment=urls.slice(i,i+10);
       const r=await fetch('/api/admin/source-library/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls:segment})});
       if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.message||'CSV export batch '+(i/10+1)+' failed');}
       download('source-library-csv-'+String(i/10+1).padStart(2,'0')+'.zip',await r.blob());
       done+=segment.length;bulkProgress='Downloaded '+done+'/'+urls.length+' selected CSV sources';
       if(i+10<urls.length&&!stopRequested)await sleep(900);
     }
     note=bulkProgress+(stopRequested?' · Stopped.':' · Check each ZIP report before importing.');
   }catch(e){error=(e?.message||'Download failed')+'. '+done+' selected sources already downloaded.';}
   finally{bulkBusy=false;stopRequested=false;}
 }
 async function catalogStep(reset = false) {`);
// limit server requests to max 3 and allow final 2 for exact 20-page action
swap(discoverPath,"  const database = db(platform);\n  let totalPages", "  const database = db(platform);\n  const batchSize = Math.min(PAGE_BATCH, Math.max(1, Number.isInteger(body.limit) ? body.limit : PAGE_BATCH));\n  let totalPages");
swap(discoverPath,"first + PAGE_BATCH - 1","first + batchSize - 1");
swap(pagePath,"<button type=\"button\" class=\"secondary\" onclick={() => catalogStep(false)}", "<button type=\"button\" class=\"secondary\" onclick={scanTwenty} disabled={busy || discoveryBusy || bulkBusy || !discoveryNextPage}>Scan next 20 pages</button><button type=\"button\" class=\"secondary\" onclick={() => catalogStep(false)}");
swap(pagePath,"<button type=\"button\" class=\"secondary\" onclick={inspectVisible}","<button type=\"button\" class=\"secondary\" onclick={inspectSixty} disabled={busy || discoveryBusy || bulkBusy || !awaiting}>Inspect next 60</button><button type=\"button\" class=\"secondary\" onclick={inspectVisible}");
swap(pagePath,"<div class=\"panel\"><label for=\"urls\">", "{#if bulkBusy || bulkProgress}<div class=\"tools\"><small role=\"status\">{bulkProgress || 'Working…'}</small>{#if bulkBusy}<button type=\"button\" class=\"secondary\" onclick={stopBulk}>Stop after current batch</button>{/if}</div>{/if}\n <div class=\"panel\"><label for=\"urls\">");
swap(pagePath,"<button class=\"secondary\" type=\"button\" onclick={generateCsvZip}", "<button class=\"secondary\" type=\"button\" onclick={selectReadyFifty} disabled={busy || bulkBusy || !readyVisible.length}>Select up to 50 CSV-ready</button><button class=\"secondary\" type=\"button\" onclick={downloadFifty} disabled={busy || bulkBusy || !generatedSelected.length}>Download selected CSVs ({Math.min(50,generatedSelected.length)})</button><button class=\"secondary\" type=\"button\" onclick={generateCsvZip}");
swap(pagePath,"disabled={busy||!chosen.some(x=>x.endsWith('|csv-generated'))}","disabled={busy || bulkBusy || !chosen.some(x=>x.endsWith('|csv-generated'))}");
// old button can safely still export <=12; clarify to prevent surprise
swap(pagePath,"Generate selected CSV ({chosen.filter(x=>x.endsWith('|csv-generated')).length})", "Generate first 12 CSVs ({chosen.filter(x=>x.endsWith('|csv-generated')).length} selected)");
// Remove misleading source example from public-facing placeholder (internal provenance remains accurate)
swap(pagePath,"let links = $state('https://cardsmithsbreaks.com/full-checklist/2026-topps-holiday-baseball/');", "let links = $state('');");
// Write only after all anchors validated. Backups timestamped.
const suffix='.backup-'+new Date().toISOString().replace(/[:.]/g,'-');
for(const [p,s] of next){ if(s===originals.get(p))continue;fs.writeFileSync(p+suffix,originals.get(p)); }
for(const [p,s] of next){ if(s===originals.get(p))continue;fs.writeFileSync(p,s);console.log('Updated '+p); }
console.log('Backups saved with suffix '+suffix);
