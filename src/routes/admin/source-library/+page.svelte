<script>
 import { onMount } from 'svelte';
 let discoveryNextPage = $state(1), discoveryTotalPages = $state(180), discoveryBusy = $state(false), discoveredPages = $state(0), newPages = $state(0), discoveryScanned = $state(0);
 let links = $state('https://cardsmithsbreaks.com/full-checklist/2026-topps-holiday-baseball/');
 let entries = $state([]), chosen = $state([]), error = $state(''), note = $state(''), busy = $state(false), search = $state('');
 let statusFilter = $state('ready');
 let showing = $derived(entries.filter(x => x.sourceKind !== 'format' && (statusFilter === 'all' || (statusFilter === 'ready' && x.extractionStatus === 'ready') || (statusFilter === 'pending' && !x.extractionStatus) || (statusFilter === 'unavailable' && x.extractionStatus === 'unavailable')) && `${x.name} ${x.pageUrl}`.toLowerCase().includes(search.toLowerCase())));
 let masterCount = $derived(entries.filter(x=>x.extractionStatus==='ready').length);
 let unavailable = $derived(entries.filter(x=>x.sourceKind!=='format' && x.extractionStatus==='unavailable').length);
 let awaiting = $derived(entries.filter(x=>x.sourceKind!=='format' && !x.extractionStatus).length);
 let excluded = $derived(entries.filter(x=>x.sourceKind==='format').length);
 onMount(async()=>{try{const r=await fetch('/api/admin/source-library');const j=await r.json();entries=j.entries||[];}catch{}});
 async function catalogStep(reset = false) {
   if (discoveryBusy) return;
   discoveryBusy = true; error = ''; note = '';
   try {
     const next = reset ? 1 : discoveryNextPage;
     if (!next) { note = 'Catalog scan is complete.'; return; }
     const r = await fetch('/api/admin/source-library/discover', {
       method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ reset, nextPage:next, totalPages:discoveryTotalPages })
     });
     const j = await r.json();
     if (!r.ok) throw new Error(j.message || 'Catalog discovery failed.');
     if (reset) { discoveredPages=0; newPages=0; discoveryScanned=0; }
     discoveryScanned += j.pagesScanned || 0;
     discoveredPages += j.links || 0;
     newPages += j.added || 0;
     discoveryTotalPages = j.totalPages || discoveryTotalPages;
     discoveryNextPage = j.nextPage;
     note = 'Scanned ' + discoveryScanned + ' archive pages · ' + discoveredPages + ' links seen · ' + newPages + ' new entries. ' + (discoveryNextPage ? 'Next page: '+discoveryNextPage+'.' : 'Archive scan complete.');
     const list = await fetch('/api/admin/source-library');
     if (list.ok) entries = (await list.json()).entries || [];
   } catch(e) { error = e?.message || 'Catalog discovery failed. You can retry the same page.'; }
   finally { discoveryBusy = false; }
 }
 async function inspectVisible(){
   if(busy)return;
   const urls = entries.filter(x => x.sourceKind !== 'format' && !x.extractionStatus).slice(0,12).map(x => x.pageUrl);
   if (!urls.length) { note = 'No uninspected sources in the current filter.'; return; }
   busy=true;error='';note='';
   try { const r=await fetch('/api/admin/source-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})}); const j=await r.json(); if(!r.ok)throw new Error(j.message||'Inspection failed'); entries=j.entries||[]; const failures=(j.results||[]).filter(x=>!x.ok); const ready=(j.results||[]).filter(x=>x.extractionStatus==='ready').length; note=`Checked ${urls.length} source(s): ${ready} extractable, ${(j.results||[]).filter(x=>x.extractionStatus==='unavailable').length} without usable card tables, ${failures.length} request failures.`; if(failures.length)error=failures.map(x=>x.error).join(' · '); } catch(e) { error=e?.message||'Inspection failed'; } finally { busy=false; }
 }
 async function recheckPrevious(){
   if(busy)return;
   const urls=entries.filter(x=>x.sourceKind!=='format' && x.extractionStatus==null && x.checkedAt).slice(0,12).map(x=>x.pageUrl);
   if(!urls.length){note='No earlier inspections need rechecking.';return;}
   busy=true;error='';note='';
   try{const r=await fetch('/api/admin/source-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})});const j=await r.json();if(!r.ok)throw Error(j.message||'Recheck failed');entries=j.entries||[];note='Rechecked '+urls.length+' existing sources: '+(j.results||[]).filter(x=>x.extractionStatus==='ready').length+' CSV-ready.';}
   catch(e){error=e?.message||'Recheck failed';}finally{busy=false;}
 }
 async function scan(){busy=true;error='';note='';try{const r=await fetch('/api/admin/source-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls:links.split(/[\n\s,]+/).filter(Boolean)})});const j=await r.json();if(!r.ok)throw new Error(j.message);entries=j.entries||[];note=`Inspected ${(j.results||[]).length} page(s); ${(j.results||[]).filter(x=>x.ok).length} saved to D1 cache.`; const failures=(j.results||[]).filter(x=>!x.ok);if(failures.length)error=failures.map(x=>x.error).join(' · ');}catch(e){error=e.message;}finally{busy=false;}}
 async function generateCsvZip(){
   const urls=[...new Set(chosen.filter(v=>v.endsWith('|csv-generated')).map(v=>v.slice(0,-14)))];
   if(!urls.length){error='Select a Generate CSV checkbox first.';return;}
   busy=true;error='';note='';
   try {
     const response=await fetch('/api/admin/source-library/export',{
       method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})
     });
     if(!response.ok){const result=await response.json();throw new Error([result.message,...(result.failures||[]).map(x=>x.reason)].filter(Boolean).join(' · '));}
     download('source-library-generated-csv.zip',await response.blob());
     note='Generated CSV ZIP downloaded. Review export-report.json and every checklist before importing.';
   }catch(e){error=e?.message||'CSV generation failed.';}finally{busy=false;}
 }
 function toggle(id){chosen=chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id];}
 function pickVisible(){chosen=[...new Set([...chosen,...showing.flatMap(x=>['csv','pdf'].filter(k=>x[k+'Url']).map(k=>x.pageUrl+'|'+k))])];}
 function download(name,blob){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 async function bulk(){busy=true;error='';note='';try{const items=chosen.map(v=>{const split=v.lastIndexOf('|');return {pageUrl:v.slice(0,split),format:v.slice(split+1)};});const r=await fetch('/api/admin/source-library',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})});if(!r.ok){const j=await r.json();throw new Error(j.message||'Download failed');}download('checklist-sources.zip',await r.blob());note='ZIP downloaded. Check download-report.json inside for successful and failed files.';}catch(e){error=e.message;}finally{busy=false;}}</script>
<svelte:head><title>Checklist sources — Setbound</title></svelte:head>
<section class="shell page">
 <div class="heading"><div><div class="eyebrow">Admin / Harvester pilot</div><h1>Checklist sources</h1><p>Cache checklist pages and download directly available original CSV/PDF files. No AI, parsing or publishing.</p></div><a href="/admin/import-studio">Open manual Import Studio ↗</a></div>
<div class="panel discovery"><strong>Catalog discovery</strong><p>Find releases from the published archive, three pages per scan. Results are cached as uninspected sources and existing reviews are preserved.</p><div class="tools"><button type="button" onclick={() => catalogStep(true)} disabled={discoveryBusy || busy}>{discoveryBusy ? 'Scanning…' : 'Start archive scan'}</button><button type="button" class="secondary" onclick={() => catalogStep(false)} disabled={discoveryBusy || busy || !discoveryNextPage}>Scan next 3 pages {discoveryNextPage ? '(' + discoveryNextPage + ')' : ''}</button><button type="button" class="secondary" onclick={inspectVisible} disabled={busy || discoveryBusy || !entries.some(x=>x.sourceKind!=='format' && !x.extractionStatus)}>Inspect next 12 visible ({awaiting})</button></div><small>{discoveryScanned} archive pages scanned · {discoveredPages} links seen · {newPages} new entries · {discoveryNextPage ? 'next page '+discoveryNextPage : 'scan complete'}. Discovered links must be inspected before CSV export.</small></div>
 <div class="panel"><label for="urls">Checklist page URLs (up to 12 per scan)</label><textarea id="urls" bind:value={links} rows="4" placeholder="Paste one source checklist URL per line"></textarea><div class="tools"><button onclick={scan} disabled={busy}>{busy?'Working…':'Inspect & cache pages'}</button><span>Pages with JavaScript-generated download buttons may not expose direct file URLs. Those stay marked unavailable.</span></div></div>
 {#if error}<p class="error" role="alert">{error}</p>{/if}{#if note}<p class="note" role="status">{note}</p>{/if}
 <div class="tools"><input bind:value={search} placeholder="Search cached releases…" aria-label="Search cached releases"/><button class="secondary" onclick={pickVisible} disabled={busy}>Select available files</button><button onclick={bulk} disabled={busy||!chosen.length}>Download selected ({chosen.length})</button><button class="secondary" type="button" onclick={generateCsvZip} disabled={busy||!chosen.some(x=>x.endsWith('|csv-generated'))}>Generate selected CSV ({chosen.filter(x=>x.endsWith('|csv-generated')).length})</button><a href="/admin/import-studio">Review/import downloaded CSV ↗</a></div>
 <p class="note">{masterCount} CSV-ready · {awaiting} awaiting extraction check · {unavailable} no usable table · {excluded} format pages excluded. Earlier inspections require a one-time quality recheck.</p>
 <div class="tools"><label for="status-filter">Show</label><select id="status-filter" bind:value={statusFilter}><option value="ready">CSV ready</option><option value="pending">Awaiting check</option><option value="unavailable">No usable table</option><option value="all">All master candidates</option></select><button type="button" class="secondary" disabled={busy || discoveryBusy} onclick={recheckPrevious}>Recheck 12 earlier inspections</button></div>
 <div class="list">{#each showing as x (x.pageUrl)}<article><div class="name"><strong>{x.name}</strong><a href={x.pageUrl} target="_blank" rel="noreferrer">Source ↗</a></div><small>{x.year || 'Year unknown'} · {x.extractionStatus==='ready' ? `${x.extractedCards} cards · ${x.extractedSections} sections · CSV ready` : x.extractionStatus==='unavailable' ? `No usable card table: ${x.extractionReason || 'Extraction returned no rows'}` : 'Awaiting extraction check'} · cached {x.scannedAt || x.checkedAt || '—'}</small><div class="formats">{#each ['csv','pdf'] as format}<label><input type="checkbox" checked={chosen.includes(x.pageUrl+'|'+format)} disabled={!x[format+'Url']||busy} onchange={()=>toggle(x.pageUrl+'|'+format)}/>{format.toUpperCase()}: {x[format+'Url']?'Direct download':x[format+'Button']?'Browser export only':'Not detected'}</label>{/each}{#if x.extractionStatus==='ready'}<label><input type="checkbox" checked={chosen.includes(x.pageUrl+'|csv-generated')} disabled={busy || x.extractionStatus!=='ready'} onchange={()=>toggle(x.pageUrl+'|csv-generated')}/>Generate verified CSV</label>{/if}</div></article>{/each}{#if !showing.length}<p>No sources match this filter. Choose Awaiting check or All master candidates to see other entries.</p>{/if}</div>
 <p class="note">Discovery reads available release archives. Only individually inspected pages with a recognizable checklist are eligible for export. Format-specific sources stay cached but are not imported.  Bulk download only uses links confirmed in cached page markup. Use the source page's CSV button manually for browser-only exports. Check the site's usage terms before scaling automated downloads.</p>
</section>
<style>
 .page{padding:3rem 0 5rem}.heading{display:flex;justify-content:space-between;gap:2rem;align-items:start;margin-bottom:2rem}.heading h1{font-size:clamp(2.5rem,5vw,4rem);letter-spacing:-.05em;margin:.5rem 0}.heading p{color:var(--muted);max-width:650px}.heading a,.name a,.tools a{color:var(--blue);font-size:.8rem;font-weight:800}.panel{padding:1.3rem;background:#faf9f7;border:1px solid var(--line);border-radius:.8rem;display:grid;gap:.65rem}textarea,input,select{font:inherit;border:1px solid var(--line-strong);border-radius:.5rem;padding:.65rem;width:100%}label{font-size:.8rem;font-weight:800}.tools{display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin:1rem 0}.tools input{max-width:400px}.tools span,.note,small{font-size:.73rem;color:var(--muted)}button{border:0;border-radius:.5rem;background:var(--ink);color:white;font:inherit;font-size:.8rem;font-weight:800;padding:.7rem .95rem;cursor:pointer}.secondary{background:#eee;color:#222}button:disabled{opacity:.5}.error{color:#8d3028}.list{display:grid;gap:.6rem}.list article{border:1px solid var(--line);border-radius:.7rem;padding:1rem;display:grid;gap:.5rem}.name,.formats{display:flex;gap:1rem;align-items:center;flex-wrap:wrap}.name strong{flex:1}.formats label{display:flex;gap:.35rem;align-items:center;font-size:.75rem}.formats input{width:auto}.note{line-height:1.5}@media(max-width:720px){.heading{display:block}}
</style>
