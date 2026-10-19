<script>
  import { onMount } from 'svelte';
  let entries = $state([]);
  let archiveYear = $state('2026');
  let preview = $state([]);
  let previewCount = $state(0);
  let filter = $state('pending');
  let query = $state('');
  let selected = $state([]);
  let busy = $state(false);
  let stopping = $state(false);
  let status = $state('');
  let error = $state('');
  let progress = $state('');
  let batchSize = $state(120);
  const parents = $derived(entries.filter(x => x.archiveParent === true && !x.pageUrl.includes('/__trashed')));
  const pending = $derived(parents.filter(x => !x.extractionStatus));
  const ready = $derived(parents.filter(x => x.extractionStatus === 'ready' && !x.downloadedAt));
  const downloaded = $derived(parents.filter(x => x.extractionStatus === 'ready' && !!x.downloadedAt));
  const attention = $derived(parents.filter(x => x.extractionStatus === 'attention' || x.extractionStatus === 'unavailable'));
  const shown = $derived(parents.filter(x => {
    if (filter === 'pending' && x.extractionStatus) return false;
    if (filter === 'ready' && (x.extractionStatus !== 'ready' || x.downloadedAt)) return false;
    if (filter === 'downloaded' && (!x.downloadedAt || x.extractionStatus !== 'ready')) return false;
    if (filter === 'attention' && !['attention','unavailable'].includes(x.extractionStatus)) return false;
    return (`${x.name} ${x.pageUrl}`).toLowerCase().includes(query.toLowerCase());
  }));
  const selectedShown = $derived(shown.filter(x => selected.includes(x.pageUrl)));
  const selectedReady = $derived(parents.filter(x => selected.includes(x.pageUrl) && x.extractionStatus === 'ready'));
  async function refresh() {
    const r = await fetch('/api/admin/source-library');
    const j = await r.json();
    if (!r.ok) throw Error(j.message || 'Unable to load source catalog');
    entries = j.entries || [];
    selected = selected.filter(url => entries.some(e => e.pageUrl === url));
  }
  onMount(() => { refresh().catch(e => error = e.message); });
  async function archive(save) {
    if (busy) return;
    busy = true; error = ''; status = '';
    try {
      const r = await fetch('/api/admin/source-library/discover', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({catalog:'homepage-parents',year:archiveYear,save})});
      const j = await r.json(); if (!r.ok) throw Error(j.message || 'Archive request failed');
      previewCount = j.found;
      preview = save ? [] : j.samples || [];
      status = save ? `${j.found} release links · ${j.added} new, ${j.existing} previously cached.` : `${j.found} release links in ${archiveYear}. Preview only: nothing saved.`;
      if (save) await refresh();
    } catch(e) { error = e.message; }
    finally {busy = false;}
  }
  function selectAllShown() { selected = [...new Set([...selected, ...shown.map(x => x.pageUrl)])]; }
  function clearSelection() { selected = []; }
  function toggle(url, checked) { selected = checked ? [...new Set([...selected,url])] : selected.filter(x => x !== url); }
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function inspect() {
    if (busy) return;
    const targets = (selected.length ? parents.filter(x => selected.includes(x.pageUrl) && !x.extractionStatus) : pending).slice(0,batchSize).map(x=>x.pageUrl);
    if (!targets.length) { status = 'No uninspected parent releases in this selection.'; return; }
    busy = true; stopping = false; error = ''; status = '';
    let done = 0, good = 0, failed = 0;
    try {
      for (let i=0;i<targets.length && !stopping;i+=8) {
        const urls=targets.slice(i,i+8);
        const r=await fetch('/api/admin/source-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})});
        const j=await r.json(); if(!r.ok)throw Error(j.message || 'Inspection failed');
        good += (j.results||[]).filter(x=>x.extractionStatus==='ready').length;
        failed += (j.results||[]).filter(x=>!x.ok).length;
        done+=urls.length;
        progress=`Inspected ${done}/${targets.length} · ${good} CSV-ready · ${failed} request errors`;
        if (i+8<targets.length && !stopping)await pause(350);
      }
      await refresh(); status=progress+(stopping?' · Stopped.':' · Complete.');
    }catch(e){error=e.message+' · '+done+' inspected.'; await refresh().catch(()=>{});}
    finally {busy=false;stopping=false;}
  }
  function triggerDownload(name,blob) {
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download=name; document.body.append(link); link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function mark(urls,downloaded) {
    for(let i=0;i<urls.length;i+=12) {
      const r=await fetch('/api/admin/source-library',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({urls:urls.slice(i,i+12),downloaded})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Download status update failed');
    }
    await refresh();
  }
  async function downloadSelected() {
    if(busy) return;
    const targets=selectedReady.filter(x=>!x.downloadedAt).map(x=>x.pageUrl);
    if(!targets.length){status='Select CSV-ready, not-yet-downloaded releases.';return;}
    busy=true;stopping=false;error='';status=''; let done=0, zipCount=0;
    try {
      for(let i=0;i<targets.length && !stopping;i+=20){
        const urls=targets.slice(i,i+20);
        const r=await fetch('/api/admin/source-library/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})});
        if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.message||`Export failed for batch ${zipCount+1}`);}
        const header=r.headers.get('x-generated-urls');
        if(!header)throw Error('Missing success manifest; nothing marked downloaded.');
        const generated=JSON.parse(decodeURIComponent(header));
        const blob=await r.blob();
        const isCsv=r.headers.get('content-type')?.includes('text/csv');
        triggerDownload(isCsv ? new URL(generated[0]).pathname.split('/').filter(Boolean).at(-1)+'.csv' : `setbound-checklists-${String(++zipCount).padStart(2,'0')}.zip`,blob);
        await mark(generated,true);
        selected=selected.filter(x=>!generated.includes(x));
        done+=generated.length; progress=`Prepared ${done}/${targets.length} CSVs · ${zipCount} ZIPs`;
        if(i+20<targets.length && !stopping)await pause(500);
      }
      status=`${done} CSVs sent to browser downloads. ${zipCount} ZIP file(s). Check your downloads and each ZIP report.`;
    }catch(e){error=e.message+` · ${done} CSVs generated before the error.`;}
    finally{busy=false;stopping=false;}
  }
  async function undo() {
    if(busy || !selectedReady.length)return;
    busy=true;error='';
    try {await mark(selectedReady.map(x=>x.pageUrl),false); selected=[];status='Selected releases returned to the download queue.';}
    catch(e){error=e.message;}finally{busy=false;}
  }
</script>
<svelte:head><title>Checklist source library — Setbound</title></svelte:head>
<section class="shell source">
  <header><div class="eyebrow">Admin / Sources</div><h1>Checklist Source Library</h1><p>Parent releases from the official release directory. Inspect, download, and review before importing. Nothing is published automatically.</p></header>
  <div class="metrics">
    <div><strong>{parents.length}</strong><span>Parent releases</span></div>
    <div><strong>{pending.length}</strong><span>Awaiting inspection</span></div>
    <div><strong>{ready.length}</strong><span>Ready to download</span></div>
    <div><strong>{downloaded.length}</strong><span>Downloaded</span></div>
    <div><strong>{attention.length}</strong><span>Needs attention</span></div>
  </div>
  <section class="panel"><h2>1. Discover releases</h2><p>Choose an archive category. Preview is read-only; Cache stores parent links and preserves existing inspections.</p><div class="toolbar"><label>Archive <select bind:value={archiveYear} disabled={busy}><option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option><option value="2023">2023</option><option value="older">Older (2022 and earlier)</option></select></label><button disabled={busy} onclick={()=>archive(false)}>Preview releases</button><button class="secondary" disabled={busy} onclick={()=>archive(true)}>Cache archive</button></div>{#if preview.length}<details><summary>View {previewCount} previewed releases</summary><div class="preview">{#each preview as item}<a href={item.pageUrl} target="_blank" rel="noreferrer">{item.name}</a>{/each}</div></details>{/if}</section>
  <section class="panel"><h2>2. Inspect and download</h2><div class="toolbar"><label>Show <select bind:value={filter} disabled={busy}><option value="pending">Awaiting inspection</option><option value="ready">Ready to download</option><option value="downloaded">Downloaded</option><option value="attention">Needs attention</option><option value="all">All parent releases</option></select></label><label>Search <input bind:value={query} placeholder="Release name or URL" /></label><label>Inspect up to <select bind:value={batchSize}><option value={60}>60</option><option value={120}>120</option><option value={240}>240</option><option value={500}>500</option></select></label></div><div class="toolbar"><button class="secondary" disabled={busy || !shown.length} onclick={selectAllShown}>Select all visible ({shown.length})</button><button class="secondary" disabled={busy || !selected.length} onclick={clearSelection}>Clear selection</button><span>{selected.length} selected</span></div><div class="toolbar"><button disabled={busy || (!pending.length && !selected.length)} onclick={inspect}>Inspect {selected.length ? 'selected pending' : 'next pending'} (up to {batchSize})</button><button disabled={busy || !selectedReady.some(x=>!x.downloadedAt)} onclick={downloadSelected}>Download selected CSVs ({selectedReady.filter(x=>!x.downloadedAt).length})</button>{#if filter==='downloaded'}<button class="secondary" disabled={busy || !selectedReady.length} onclick={undo}>Mark selected not downloaded</button>{/if}{#if busy}<button class="secondary" onclick={()=>stopping=true} disabled={stopping}>Stop after current batch</button>{/if}</div><p class="hint">Single CSVs download directly. Multiple CSVs are grouped into ZIPs of up to 20, with an export report. Inspections run in small batches to avoid overloading the source site.</p></section>
  {#if progress}<p role="status">{progress}</p>{/if}
  {#if status}<p role="status" class="ok">{status}</p>{/if}
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  <div class="list">{#each shown as item (item.pageUrl)}<article><label><input type="checkbox" checked={selected.includes(item.pageUrl)} disabled={busy} onchange={e=>toggle(item.pageUrl,e.currentTarget.checked)}/><strong>{item.name}</strong></label><div class="details"><span>{item.year||'Year unknown'} · {item.extractionStatus==='ready'?`${item.extractedCards||0} cards · ${item.extractedSections||0} sections`:item.extractionStatus==='unavailable'?'No usable table':item.extractionStatus==='attention'?'Needs attention':'Not inspected'}</span><span>{item.downloadedAt?'Downloaded '+new Date(item.downloadedAt).toLocaleDateString():''}</span><a href={item.pageUrl} target="_blank" rel="noreferrer">Source ↗</a></div></article>{/each}{#if !shown.length}<p class="empty">No matching parent releases.</p>{/if}</div>
  <p class="hint">Only archive-confirmed parent URLs appear in this workspace. The old product-format discovery records are not shown or exported here. ZIPs are generated on demand; existing imported sets are untouched.</p>
  <a href="/admin/import-bulk">Open bulk checklist importer →</a>
</section>
<style>
.source{padding:3rem 0 5rem}.source h1{font-size:clamp(2.2rem,5vw,4rem);letter-spacing:-.05em;margin:.3rem 0}.source header{margin-bottom:1.3rem}.source header p,.panel p,.hint{color:var(--muted);font-size:.82rem}.metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.7rem;margin:1.2rem 0}.metrics>div{border:1px solid var(--line);border-radius:.8rem;padding:1rem;background:white;display:grid;gap:.2rem}.metrics strong{font-size:1.8rem}.metrics span{color:var(--muted);font-size:.72rem}.panel{border:1px solid var(--line);border-radius:.8rem;padding:1.2rem;margin:1rem 0;background:#faf9f7}.panel h2{font-size:1.1rem;margin:0}.toolbar{display:flex;align-items:end;gap:.7rem;flex-wrap:wrap;margin:.8rem 0}.toolbar label{display:grid;gap:.35rem;font-size:.72rem;font-weight:800}.toolbar input,.toolbar select{border:1px solid var(--line-strong);border-radius:.5rem;padding:.65rem;font:inherit;min-width:130px;background:white}.toolbar input{min-width:260px}button{border:0;border-radius:.5rem;background:var(--ink);color:#fff;font:inherit;font-size:.78rem;font-weight:800;padding:.75rem .9rem;cursor:pointer}.secondary{background:#eee;color:#222}button:disabled{opacity:.45}.list{display:grid;gap:.5rem;margin:1rem 0}.list article{display:grid;gap:.5rem;border:1px solid var(--line);border-radius:.65rem;padding:.85rem 1rem;background:#fff}.list label{display:flex;gap:.65rem;align-items:center;overflow-wrap:anywhere}.list input{width:17px;height:17px}.details{display:flex;flex-wrap:wrap;gap:.8rem;font-size:.74rem;color:var(--muted);padding-left:1.7rem}.details a,.preview a{color:var(--blue)}.preview{display:grid;gap:.3rem;max-height:280px;overflow:auto;margin-top:.65rem;font-size:.75rem}.ok{color:#267244}.error{color:#a33124}.empty{padding:2rem;text-align:center;color:var(--muted)}@media(max-width:850px){.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
