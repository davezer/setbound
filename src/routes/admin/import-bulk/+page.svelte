<script>
  import { parseSourceCsv } from '$lib/client/source-csv.js';
  import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
  import { extractPdfText } from '$lib/client/pdf.js';
  import { parseChecklistText } from '$lib/client/checklist-parser.js';
  import { validateChecklistImport } from '$lib/checklist-validation.js';

  let { data } = $props();
  let queue = $state([]);
  let reading = $state(false);
  let importing = $state(false);
  let stop = $state(false);
  let message = $state('');
  let fileInput = $state(null);
  let active = $state(null);
  let onlySelected = $derived(queue.filter(x => x.selected && x.status === 'ready'));
  let importedCount = $derived(queue.filter(x => x.status === 'imported').length);
  let readyCount = $derived(queue.filter(x => x.status === 'ready').length);

  const extension = file => file.name.split('.').pop().toLowerCase();
  const SPECIAL = new Map(Object.entries({
    nba:'NBA', nfl:'NFL', mlb:'MLB', nhl:'NHL', mls:'MLS', wwe:'WWE', ufc:'UFC', fifa:'FIFA',
    f1:'F1', wnba:'WNBA', ncaa:'NCAA', rc:'RC', sdcc:'SDCC', nycc:'NYCC', nscc:'NSCC',
    prizm:'Prizm', topps:'Topps', bowman:'Bowman', chrome:'Chrome', 'o-pee-chee':'O-Pee-Chee'
  }));
  function titleWord(word) {
    if (word.toLowerCase() === 'x') return 'x';
    if (SPECIAL.has(word.toLowerCase())) return SPECIAL.get(word.toLowerCase());
    return word.split(/([-'])/).map((part, i, parts) => part === '-' || part === "'" ? part : (i > 0 && parts[i-1] === "'" && part.toLowerCase() === 's') ? 's' :
      (SPECIAL.get(part.toLowerCase()) || (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    ).join('');
  }
  function formattedName(file) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const season = file.name.match(/^(19\d{2}|20\d{2})[-_](\d{2})(?:[-_]|\.)/);
    const year = file.name.match(/^(19\d{2}|20\d{2})(?:[-_\s]|\.)/);
    const prefix = season ? season[1] + '-' + season[2] : year ? year[1] : String(new Date().getFullYear());
    const rest = base.replace(/^(?:19|20)\d{2}(?:\s+\d{2})?\s*/, '').trim();
    return { year: Number(prefix.slice(0,4)), name: prefix + ' ' + (rest || base).split(/\s+/).map(titleWord).join(' ').replace(/\bO Pee Chee\b/g, 'O-Pee-Chee') };
  }

  function guess(file) {
    const { year, name } = formattedName(file);
    const manufacturer = data.manufacturers.find(x=>new RegExp('\\b'+x.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(name));
    const sportTerms = [{word:/baseball|bowman(?! university)/i,match:/baseball/i},{word:/football|nfl/i,match:/football/i},{word:/basketball|nba|hoops/i,match:/basketball/i},{word:/hockey|nhl|o pee chee/i,match:/hockey/i},{word:/soccer|mls|fifa|world cup/i,match:/soccer/i},{word:/formula.?1|f1/i,match:/racing|motorsport|formula/i},{word:/wwe|wrestling/i,match:/wrestling/i},{word:/ufc/i,match:/mma|ufc/i}];
    const term=sportTerms.find(t=>t.word.test(name));
    const sport=term && data.sports.find(x=>term.match.test(x.name));
    return {year,name,manufacturerId:manufacturer?.id ?? data.manufacturers[0]?.id ?? '',sportId:sport?.id ?? data.sports[0]?.id ?? ''};
  }
  async function addFiles(files) {
    if(importing || reading || !files.length)return;
    reading=true;message='';
    const duplicates=new Set(queue.map(x=>x.filename.toLowerCase()));
    for (const file of files) {
      if(duplicates.has(file.name.toLowerCase()))continue;
      duplicates.add(file.name.toLowerCase());
      const info=guess(file);
      const item={id:crypto.randomUUID(),filename:file.name,size:file.size,...info,sourceUrl:'',selected:true,status:'reading',error:'',cards:[],sections:[],checklistMeta:{},issues:[],warnings:[],slug:''};
      queue=[...queue,item];
      try {
        let parsed;
        const ext=extension(file);
        if(ext==='csv') parsed=await parseSourceCsv(file);
        else if(ext==='xlsx'||ext==='xls')parsed=await extractSpreadsheetChecklist(file);
        else if(ext==='pdf')parsed=parseChecklistText(await extractPdfText(file),data.affiliations);
        else throw new Error('Use CSV, XLS, XLSX or PDF.');
        if(!parsed.cards?.length)throw new Error('No usable cards found.');
        const audit=validateChecklistImport(parsed.cards,parsed.checklist_meta,parsed.sections);
        queue=queue.map(x=>x.id===item.id?{...x,status:'ready',cards:parsed.cards,sections:parsed.sections,checklistMeta:parsed.checklist_meta,issues:audit.issues||[],warnings:parsed.safety?.warnings||[],auditCanImport:audit.canImport}:x);
      }catch(e){queue=queue.map(x=>x.id===item.id?{...x,status:'failed',error:e?.message||'Unable to read file'}:x);}
    }
    reading=false;
    if(fileInput)fileInput.value='';
  }
  function onFileChange(event){addFiles([...event.currentTarget.files]);}
  function patch(id,key,value){queue=queue.map(x=>x.id===id?{...x,[key]:value}:x);}
  function remove(id){if(importing)return;queue=queue.filter(x=>x.id!==id);if(active===id)active=null;}
  function slugFor(item){return `/admin/sets/preview/${item.slug}`;}
  async function importOne(item) {
    if(item.status!=='ready')return;
    if(!item.name.trim()||!Number.isInteger(Number(item.year))||!item.sportId||!item.manufacturerId){patch(item.id,'error','Enter a product name, year, sport and manufacturer.');return;}
    const audit=validateChecklistImport(item.cards,item.checklistMeta,item.sections);
    if(!audit.canImport){patch(item.id,'error','Validation blocks this import. Open the single-file editor to resolve row issues.');return;}
    queue=queue.map(x=>x.id===item.id?{...x,status:'importing',error:''}:x);
    try{
      const response=await fetch('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({year:Number(item.year),name:item.name.trim(),sportId:Number(item.sportId),manufacturerId:Number(item.manufacturerId),sourceUrl:item.sourceUrl,sourceFilename:item.filename,cards:item.cards,checklistMeta:item.checklistMeta,sections:item.sections})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.message||`Import failed (HTTP ${response.status}).`);
      queue=queue.map(x=>x.id===item.id?{...x,status:'imported',slug:result.slug,selected:false,error:''}:x);
    }catch(e){queue=queue.map(x=>x.id===item.id?{...x,status:'failed',error:e?.message||'Import failed. This file was not marked imported.'}:x);}
  }
  async function importSelected(){
    if(importing||reading||!onlySelected.length)return;
    if(!confirm(`Import ${onlySelected.length} selected checklist(s) as unpublished drafts? Existing products will not be overwritten.`))return;
    importing=true;stop=false;
    const ids=onlySelected.map(x=>x.id);
    for(const id of ids){if(stop)break;const item=queue.find(x=>x.id===id);if(item)await importOne(item);}
    importing=false;stop=false;
    message='Batch complete. Review each result below; successful products are unpublished drafts.';
  }
</script>
<svelte:head><title>Bulk checklist importer — Setbound</title></svelte:head>
<section class="shell bulk">
  <header><div class="eyebrow">Admin / Import</div><h1>Checklist importer</h1><p>One file or many. Review release details, import unpublished drafts, and open individual previews. Nothing publishes automatically.</p></header>
  <div class="upload">
    <label for="checklist-files">Add checklists</label>
    <input id="checklist-files" type="file" accept=".csv,.xls,.xlsx,.pdf" multiple bind:this={fileInput} onchange={onFileChange} disabled={reading||importing}/>
    <small>CSV, Excel and PDF · Files are parsed locally; imports are sent to D1 one set at a time. Files with the same filename are skipped in this queue.</small>
  </div>
  <div class="summary"><strong>{queue.length} files</strong><span>{readyCount} ready</span><span>{importedCount} imported</span><span>{queue.filter(x=>x.status==='failed').length} need attention</span></div>
  <div class="controls">
    <button onclick={importSelected} disabled={importing||reading||!onlySelected.length}>Import selected drafts ({onlySelected.length})</button>
    {#if importing}<button class="secondary" onclick={()=>stop=true} disabled={stop}>{stop?'Stopping…':'Stop after current file'}</button>{/if}
    <button class="secondary" onclick={()=>queue=queue.map(x=>({...x,selected:x.status==='ready'}))} disabled={importing}>Select ready</button>
    <button class="secondary" onclick={()=>queue=queue.map(x=>({...x,selected:false}))} disabled={importing}>Clear selection</button>
    <a href="/admin/import">Single-file detailed editor ↗</a>
  </div>
  {#if message}<p role="status" class="message">{message}</p>{/if}
  <div class="items">
    {#each queue as item (item.id)}
      <article class:failed={item.status==='failed'}>
        <div class="itemtop"><label class="tick"><input type="checkbox" checked={item.selected} disabled={item.status!=='ready'||importing} onchange={e=>patch(item.id,'selected',e.currentTarget.checked)} /><strong>{item.filename}</strong></label><span class="status">{item.status}</span></div>
        <small>{item.cards.length.toLocaleString()} cards · {item.sections.length} sections {item.warnings.length ? `· ${item.warnings.length} parser warnings` : ''} {item.issues.length ? `· ${item.issues.length} validation flags` : ''}</small>
        {#if item.status==='ready' || item.status==='failed'}
          <div class="fields">
            <label>Name<input value={item.name} oninput={e=>patch(item.id,'name',e.currentTarget.value)} disabled={importing}/></label>
            <label>Year<input type="number" min="1800" max="2200" value={item.year} oninput={e=>patch(item.id,'year',Number(e.currentTarget.value))} disabled={importing}/></label>
            <label>Sport<select value={item.sportId} onchange={e=>patch(item.id,'sportId',Number(e.currentTarget.value))} disabled={importing}>{#each data.sports as sport}<option value={sport.id}>{sport.name}</option>{/each}</select></label>
            <label>Manufacturer<select value={item.manufacturerId} onchange={e=>patch(item.id,'manufacturerId',Number(e.currentTarget.value))} disabled={importing}>{#each data.manufacturers as manufacturer}<option value={manufacturer.id}>{manufacturer.name}</option>{/each}</select></label>
          </div>
        {/if}
        {#if item.error}<p class="error">{item.error}</p>{/if}
        {#if item.status==='ready'}
          <div class="actions"><button class="secondary" onclick={()=>active=active===item.id?null:item.id}>Review sections / warnings</button><button class="secondary" onclick={()=>remove(item.id)} disabled={importing}>Remove</button></div>
          {#if active===item.id}<div class="review"><p><strong>Sections:</strong> {item.sections.join(' · ')}</p>{#each item.warnings.slice(0,12) as w}<p>{w}</p>{/each}{#each item.issues.slice(0,12) as issue}<p>{issue.message||issue.description||issue.code||'Validation issue'}</p>{/each}{#if !item.auditCanImport}<p class="error">Validation prevents batch import. Use the single-file editor to review these cards.</p>{/if}<p>For row-by-row corrections, use the detailed single-file editor before importing.</p></div>{/if}
        {:else if item.status==='imported'}
          <a class="preview" href={slugFor(item)} target="_blank" rel="noreferrer">Preview unpublished set ↗</a>
        {:else if item.status==='failed'}
          <button class="secondary" onclick={()=>remove(item.id)} disabled={importing}>Remove from queue</button>
        {/if}
      </article>
    {/each}
    {#if !queue.length}<p class="empty">No files queued yet. Select one CSV or a whole batch above.</p>{/if}
  </div>
</section>
<style>
 .bulk{padding:3rem 0 5rem}.bulk header{margin-bottom:1.5rem}.bulk h1{font-size:clamp(2.4rem,5vw,4rem);letter-spacing:-.05em;margin:.4rem 0}.bulk header p{color:var(--muted);max-width:680px}.upload{padding:1.3rem;border:1px dashed var(--line-strong);border-radius:.8rem;background:#faf9f7;display:grid;gap:.5rem}.upload label{font-weight:850}.upload input{font:inherit}.upload small,.items small{font-size:.74rem;color:var(--muted)}.summary,.controls,.actions{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin:1.2rem 0}.summary span{font-size:.8rem;color:var(--muted)}button{border:0;border-radius:.5rem;background:var(--ink);color:white;padding:.7rem .9rem;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}.secondary{background:#eee;color:#222}button:disabled{opacity:.5}.controls a,.preview{color:var(--blue);font-size:.8rem;font-weight:800}.items{display:grid;gap:.75rem}.items article{border:1px solid var(--line);border-radius:.8rem;padding:1rem;background:#fff}.items article.failed{border-color:#e7c5be}.itemtop{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.4rem}.tick{display:flex;align-items:center;gap:.65rem;overflow-wrap:anywhere}.status{font-size:.7rem;font-weight:800;text-transform:uppercase;color:var(--muted)}.fields{display:grid;grid-template-columns:minmax(230px,2fr) 110px minmax(130px,1fr) minmax(130px,1fr);gap:.65rem;margin:1rem 0}.fields label{display:grid;gap:.35rem;font-size:.7rem;font-weight:850}.fields input,.fields select{min-width:0;padding:.6rem;border:1px solid var(--line-strong);border-radius:.45rem;background:#fff;font:inherit;font-size:.8rem}.error{color:#a33124}.message{color:#22704f}.review{margin-top:.7rem;padding:.8rem;background:#faf9f7;max-height:300px;overflow:auto;font-size:.8rem}.review p{margin:.4rem 0}.empty{padding:2rem;color:var(--muted);text-align:center}@media(max-width:850px){.fields{grid-template-columns:1fr 1fr}}@media(max-width:540px){.fields{grid-template-columns:1fr}}
</style>
