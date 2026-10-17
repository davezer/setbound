<script>
  import { parseChecklistSource } from '$lib/client/checklist-engine.js';
  import { validateChecklistImport } from '$lib/checklist-validation.js';
  let { products = [], affiliations = [] } = $props();
  let releaseYear = $state(String(new Date().getFullYear()));
  let useTopps = $state(true);
  let useCI = $state(true);
  let scanning = $state(false);
  let preparing = $state(false);
  let message = $state('');
  let catalog = $state([]);
  let chosen = $state([]);
  let prepared = $state([]);
  let search = $state('');
  let onlyNew = $state(true);
  let scanLimit = $state(20);
  const normalized = (value) => String(value || '').toLowerCase().replace(/®|™/g, '').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const withoutYear = (value) => normalized(value).replace(/^(?:19|20)\d{2} /, '');
  function existing(item) {
    // Deliberately conservative. Avoid allowing an apparent name match to overwrite imports.
    return products.some(p => Number(p.year) === Number(item.year) && withoutYear(p.name) === withoutYear(item.name));
  }
  const filtered = $derived(catalog.filter(item => (!search || `${item.name} ${item.year} ${item.manufacturer} ${item.sport}`.toLowerCase().includes(search.toLowerCase())) && (!onlyNew || !existing(item))));
  function identity(item) {return `${item.source || ''}|${item.checklistUrl || ''}|${item.year || ''}|${item.name || ''}`;}
  function addEntries(items) {
    const byKey = new Map(catalog.map(item=>[identity(item),item]));
    for(const item of items){if(item?.checklistUrl) byKey.set(identity(item),item);}
    catalog = [...byKey.values()].sort((a,b)=>Number(b.year||0)-Number(a.year||0)||String(a.name).localeCompare(String(b.name)));
  }
  async function readJson(url) {
    const res = await fetch(url);
    const payload = await res.json();
    if (!res.ok) throw new Error(typeof payload.message==='string' ? payload.message : `Request failed: ${res.status}`);
    return payload;
  }
  async function discover() {
    if(!useTopps && !useCI) {message='Choose at least one source.';return;}
    scanning=true; message='Discovering source catalogs…'; catalog=[];chosen=[];prepared=[];
    const notes=[];
    try {
      if(useTopps){
        try{
          const data=await readJson('/api/admin/source-harvester/discover?source=topps');
          addEntries((data.entries||[]).filter(e=>String(e.year)===releaseYear));
          notes.push(`Topps: ${(data.entries||[]).filter(e=>String(e.year)===releaseYear).length} file records`);
        }catch(error){notes.push(`Topps: ${error.message}`);}
      }
      if(useCI){
        try{
          const data=await readJson(`/api/admin/source-harvester/discover?source=checklistinsider&year=${encodeURIComponent(releaseYear)}`);
          const cached=(data.entries||[]).filter(x=>x.cached && x.checklistUrl);
          addEntries(cached);
          const missing=(data.entries||[]).filter(x=>!x.cached && x.pageUrl).slice(0,Number(scanLimit));
          for(let index=0;index<missing.length;index+=2){
            const batch=await Promise.all(missing.slice(index,index+2).map(async stub=>{
              try {const scan=await readJson(`/api/admin/source-harvester/scan?url=${encodeURIComponent(stub.pageUrl)}`);return scan.entry;}catch{return null;}
            }));
            addEntries(batch.filter(Boolean));
            message=`Scanning new CI pages ${Math.min(index+2,missing.length)}/${missing.length}; ${catalog.length} checklist files found`;
          }
          notes.push(`Checklist Insider: ${cached.length} cached; ${missing.length} new pages checked`);
          if((data.entries||[]).filter(x=>!x.cached&&x.pageUrl).length>missing.length)notes.push('More unscanned pages remain; rerun after cache has saved this batch.');
        }catch(error){notes.push(`Checklist Insider: ${error.message}`);}
      }
      message=notes.join(' · ');
    } finally {scanning=false;}
  }
  function toggle(item){const id=identity(item); chosen=chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id];}
  function selectVisible(){chosen=filtered.filter(x=>!existing(x)).map(identity);}
  async function prepare() {
    const items=catalog.filter(item=>chosen.includes(identity(item))&&!existing(item)).slice(0,30);
    if(!items.length){message='Select new checklists first.';return;}
    preparing=true;prepared=[];
    try{
      for(const item of items){
        let result={...item,status:'Preparing',count:0,issues:[],error:''};
        prepared=[...prepared,result];
        try{
          const response=await fetch(`/api/admin/source-harvester/download?url=${encodeURIComponent(item.checklistUrl)}`);
          if(!response.ok)throw new Error(`Download failed (${response.status})`);
          const blob=await response.blob();
          const file=new File([blob],item.checklistFilename||'checklist',{type:blob.type});
          const parsed=await parseChecklistSource(file,{name:item.name,manufacturer:item.manufacturer,sport:item.sport,extension:String(item.checklistExtension||''),affiliations});
          const audit=validateChecklistImport(parsed.cards||[],parsed.checklist_meta,parsed.sections);
          const unresolved=(parsed.cards||[]).filter(card=>card.affiliation==='UNRESOLVED'||card.affiliation_status==='unresolved').length;
          const blocked=Boolean(parsed.safety?.blocked);
          const issues=[];
          if(blocked)issues.push('Unsupported or unsafe parser layout');
          if(unresolved)issues.push(`${unresolved} unresolved affiliations`);
          const auditSummary=JSON.stringify(audit||{});
          if(audit?.blocked || audit?.valid===false)issues.push('Checklist validation failed');
          result={...item,status:issues.length?'Needs review':'Prepared',count:(parsed.cards||[]).length,sectionCount:(parsed.sections||[]).length,issues,parser:parsed.safety?.strategy||parsed.parserFamily||'',auditSummary:auditSummary.slice(0,500)};
        }catch(error){result={...item,status:'Failed',count:0,issues:[],error:error?.message||'Unknown parser error'};}
        prepared=prepared.map(x=>identity(x)===identity(item)?result:x);
        message=`Prepared ${prepared.length}/${items.length} selected checklists`;
      }
    } finally{preparing=false;}
  }
</script>
<section class="acquire" aria-labelledby="acq-title">
  <div class="head"><div><div class="eyebrow">Phase 2 · Discovery and preparation</div><h2 id="acq-title">Source intake</h2><p>Discover source files, parse and validate them here. Nothing gets imported until a later explicit step.</p></div></div>
  <div class="bar">
    <label>Year <input type="number" min="1990" max="2100" bind:value={releaseYear}/></label>
    <label class="check"><input type="checkbox" bind:checked={useTopps}/> Official Topps archive</label>
    <label class="check"><input type="checkbox" bind:checked={useCI}/> Checklist Insider downloads</label>
    <label>New CI pages per run <select bind:value={scanLimit}><option value={10}>10</option><option value={20}>20</option><option value={40}>40</option></select></label>
    <button class="primary" disabled={scanning||preparing} onclick={discover}>{scanning?'Discovering…':'Discover files'}</button>
  </div>
  {#if message}<p class="notice" role="status">{message}</p>{/if}
  {#if catalog.length}
    <div class="tools"><strong>{filtered.length} files · {chosen.length} selected</strong><input placeholder="Search discovered files" bind:value={search}/><label class="check"><input type="checkbox" bind:checked={onlyNew}/> Exclude known exact-name imports</label><button onclick={selectVisible} disabled={scanning||preparing}>Select visible new</button><button onclick={()=>chosen=[]} disabled={scanning||preparing}>Clear selection</button><button class="primary" onclick={prepare} disabled={!chosen.length||scanning||preparing}>{preparing?'Preparing…':'Prepare selected'}</button></div>
    <div class="source-list">
    {#each filtered as item (identity(item))}
      <label class="source-row"><input type="checkbox" checked={chosen.includes(identity(item))} disabled={existing(item)||preparing} onchange={()=>toggle(item)}/><span><strong>{item.name}</strong><small>{item.year} · {item.sport||'Unknown sport'} · {item.manufacturer||'Unknown brand'} · {item.source||'Source'} {existing(item)?' · Already imported (exact-name candidate)':''}</small></span><a href={item.checklistUrl} target="_blank" rel="noreferrer">Source ↗</a></label>
    {/each}
    </div>
  {/if}
  {#if prepared.length}
    <h3>Prepared file review</h3><p class="muted">This is a temporary browser-session queue. Safe parsers and validation gates run before a future import stage.</p>
    {#each prepared as row (identity(row))}
      <div class="prepared"><div><strong>{row.name}</strong><small>{row.count.toLocaleString()} cards · {row.sectionCount||0} sections · {row.status}</small></div><div>{#if row.issues?.length}<span class="warn">{row.issues.join(' · ')}</span>{:else if row.error}<span class="warn">{row.error}</span>{:else if row.status==='Prepared'}<span class="good">Checklist validated</span>{/if}</div></div>
    {/each}
    <p class="muted">Import/apply is intentionally disabled in Phase 2. Existing Harvester import remains available until Phase 3 adds durable review and safe writes.</p>
  {/if}
</section>
<style>
  .acquire{border:1px solid var(--line);padding:1.25rem;border-radius:.8rem;margin:1.5rem 0 2rem;background:#fff}.head h2{font-size:1.5rem;margin:.25rem 0}.head p,.muted{color:var(--muted);font-size:.78rem}.eyebrow{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:var(--blue)}.bar,.tools{display:flex;flex-wrap:wrap;align-items:end;gap:.85rem;margin:1rem 0}.bar label{display:grid;gap:.3rem;font-size:.7rem;font-weight:700}.bar .check,.tools .check{display:flex;align-items:center;gap:.35rem}.bar input[type=number]{width:100px}.bar input,.bar select,.tools input{border:1px solid var(--line-strong);border-radius:.4rem;padding:.55rem;font:inherit}.bar input[type=checkbox],.tools input[type=checkbox]{width:auto}.acquire button{background:#fff;border:1px solid var(--line-strong);padding:.65rem .8rem;border-radius:.45rem;cursor:pointer;font:inherit;font-size:.7rem;font-weight:750}.acquire .primary{color:#fff;background:#171717}.acquire button:disabled{opacity:.5;cursor:not-allowed}.notice{background:#f5f7f8;border:1px solid var(--line);padding:.7rem;border-radius:.5rem;font-size:.76rem}.tools strong{font-size:.76rem;margin-right:auto}.source-list{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:.5rem}.source-row{display:flex;gap:.8rem;align-items:center;padding:.7rem;border-bottom:1px solid var(--line);font-size:.78rem}.source-row span{display:grid;gap:.2rem;flex:1}.source-row small,.prepared small{font-size:.67rem;color:var(--muted)}.source-row a{font-size:.68rem;white-space:nowrap;color:var(--blue)}.prepared{border-top:1px solid var(--line);padding:.8rem 0;display:flex;justify-content:space-between;gap:1rem;font-size:.8rem}.prepared>div:first-child{display:grid;gap:.25rem}.warn{color:#9b3d21;font-size:.75rem}.good{color:#276644;font-size:.75rem}
</style>
