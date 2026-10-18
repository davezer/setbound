<script>
  import { parseChecklistSource } from '$lib/client/checklist-engine.js';
  import { validateChecklistImport } from '$lib/checklist-validation.js';
  import { onMount } from 'svelte';
  import { classifyDiscovery } from '$lib/studio-duplicate-match.js';
  let { products = [], affiliations = [], sports = [], manufacturers = [] } = $props();
  let releaseYear = $state(String(new Date().getFullYear()));
  let useTopps = $state(true);
  let useCI = $state(true);
  let scanning = $state(false);
  let preparing = $state(false);
  let message = $state('');
  let catalog = $state([]);
  let chosen = $state([]);
  let prepared = $state([]);
  let savedRecords = $state([]);
  let persisting = $state(false);
  let saveError = $state('');
  let importing = $state('');
  let importResults = $state({});
  let classifications = $state({});
  let importedIds = $state([]);
  function importResult(row) { return importResults[identity(row)] || null; }
  function reportImport(row, type, text) { importResults = {...importResults, [identity(row)]: {type, text}}; }
  function selectedValue(row, key) { return classifications[identity(row)]?.[key] || String(row[key] || ''); }
  function setClassification(row, key, value) {
    const id=identity(row);
    classifications={...classifications,[id]:{...classifications[id],[key]:value}};
    reportImport(row,'','');
  }
  let search = $state('');
  let onlyNew = $state(true);
  let scanLimit = $state(20);
  const PREPARE_BATCH_SIZE = 30;
  let expandedReview = $state('');
  let affiliationDrafts = $state({});
  let reviewSearch = $state('');
  let bulkAffiliation = $state('');
  let issueOnly = $state(true);
  let showAllCards = $state(false);
  let aiBusy = $state('');
  let aiMessages = $state({});
  let aiSuggestions = $state({});
  let manualDrafts = $state({});
  let aiSelected = $state({});
  let aiApprovedFields = $state({});
  function proposalFieldKey(row,proposal,field) {return identity(row)+':'+proposal.index+':'+field;}
  function fieldEnabled(row,proposal,field) {return aiApprovedFields[proposalFieldKey(row,proposal,field)] !== false;}
  function toggleProposalField(row,proposal,field,checked) {aiApprovedFields={...aiApprovedFields,[proposalFieldKey(row,proposal,field)]:checked};}
  function selectedCount(row) {const prefix=identity(row)+':';return Object.entries(aiSelected).filter(([k,v])=>k.startsWith(prefix)&&v).length;}
  function clearAiSelection(row) {const prefix=identity(row)+':';aiSelected=Object.fromEntries(Object.entries(aiSelected).filter(([k])=>!k.startsWith(prefix)));}
  function selectNextAiIssues(row) {
    const picks=(row.cards||[]).map((card,index)=>({card,index})).filter(({card})=>
      unresolvedCard(card)||/^(rookie|rc|auto|autograph|legend|legends|relic)$/i.test(String(card.affiliation||'').trim())).slice(0,25);
    clearAiSelection(row);
    aiSelected={...aiSelected,...Object.fromEntries(picks.map(({index})=>[identity(row)+':'+index,true]))};
    aiMessages={...aiMessages,[identity(row)]:picks.length?picks.length+' flagged cards selected. Review selections before sending.':'No automatically flagged cards. Select rows manually.'};
  }

  function reviewMessage(row) { return aiMessages[identity(row)] || ''; }
  function proposalsFor(row) { return aiSuggestions[identity(row)] || []; }
  function updateManual(row,index,field,value) {
    const k=identity(row)+':'+index;
    const original=row.cards[index];
    manualDrafts={...manualDrafts,[k]:{...original,...manualDrafts[k],[field]:value}};
  }
  function rowDraft(row,index) { return manualDrafts[identity(row)+':'+index] || row.cards[index]; }
  async function applyCard(row,index,changes) {
    const cards=row.cards.map((c,i)=>i===index?{...c,...changes,
      affiliation_status:changes.affiliation && changes.affiliation!=='UNRESOLVED' ? 'manual-review' : c.affiliation_status,
      confidence:changes.affiliation ? 1 : c.confidence}:c);
    const parsed={...row.parsed,cards};
    const { sanityCheckParsed }=await import('$lib/parser-layouts.js');
    const safety=sanityCheckParsed(parsed,row.parsed.layoutDetection||{}, {name:row.name,manufacturer:row.manufacturer,sport:row.sport});
    parsed.safety={...safety,blocked:!!safety.blocked};
    const audit=validateChecklistImport(cards,parsed.checklist_meta,parsed.sections);
    const unresolved=cards.filter(unresolvedCard).length;
    const issues=rowSafetyIssues(parsed,audit,unresolved);
    const updated={...row,cards,parsed,audit,unresolved,issues,status:issues.length?'Needs review':'Prepared'};
    prepared=prepared.map(x=>identity(x)===identity(row)?updated:x);
    await saveSnapshot(updated);
  }
  async function suggestAiCorrections(row) {
    const id=identity(row);
    if(aiBusy)return;
    const picks=(row.cards||[]).map((card,index)=>({index,card})).filter(x=>aiSelected[id+':'+x.index]);
    if(!picks.length){aiMessages={...aiMessages,[id]:'Select at least one card for AI review.'};return;}
    if(picks.length>25){aiMessages={...aiMessages,[id]:'More than 25 selected. Select 25 or fewer.'};return;}
    if(proposalsFor(row).length){aiMessages={...aiMessages,[id]:'Finish reviewing the current proposals before another request.'};return;}
    if(!confirm('Send '+picks.length+' selected source rows to OpenAI? Suggestions must be approved.'))return;
    aiBusy=id;
    aiMessages={...aiMessages,[id]:'Asking AI to review '+picks.length+' cards…'};
    try {
      const res=await fetch('/api/admin/import-studio/ai-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product:row.name,cards:picks})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.message||'HTTP '+res.status);
      aiSuggestions={...aiSuggestions,[id]:data.suggestions||[]};
      clearAiSelection(row);
      aiMessages={...aiMessages,[id]:(data.suggestions||[]).length+' suggestions received. Approve fields individually. Selection cleared.'};
    }catch(error){aiMessages={...aiMessages,[id]:'AI request failed: '+(error?.message||'Unknown error')+'. Selection retained.';}
    finally{aiBusy='';}
  }
  async function acceptAiSuggestion(row,proposal) {
    const id=identity(row);
    const chosen=Object.fromEntries(Object.entries(proposal.changes).filter(([field])=>fieldEnabled(row,proposal,field)));
    if(!Object.keys(chosen).length){aiMessages={...aiMessages,[id]:'Select at least one field or reject the proposal.'};return;}
    try {
      await applyCard(row,proposal.index,chosen);
      aiSuggestions={...aiSuggestions,[id]:proposalsFor(row).filter(p=>p.index!==proposal.index)};
      aiMessages={...aiMessages,[id]:'Saved '+Object.keys(chosen).length+' approved change(s).'};
    }catch(error){aiMessages={...aiMessages,[id]:'Save failed: '+(error?.message||'Unknown error')};}
  }
  function rejectAiSuggestion(row,proposal) {
    const id=identity(row);
    aiSuggestions={...aiSuggestions,[id]:proposalsFor(row).filter(p=>p.index!==proposal.index)};
    aiMessages={...aiMessages,[id]:'Suggestion rejected; nothing changed.'};
  }
  const selectedEligible = $derived(catalog.filter(item => chosen.includes(identity(item)) && !existing(item)));
  const hiddenSelection = $derived(chosen.length - selectedEligible.length);
  const remainingAfterBatch = $derived(Math.max(0, selectedEligible.length - PREPARE_BATCH_SIZE));
  const preparedCount = $derived(prepared.filter(row => row.status === 'Prepared').length);
  const reviewedCount = $derived(prepared.filter(row => row.status === 'Needs review').length);
  const failedCount = $derived(prepared.filter(row => row.status === 'Failed').length);
  async function queueId(row) {
    const bytes = new TextEncoder().encode(identity(row));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  }
  function serializable(row) {
    // Avoid duplicated card arrays: the parsed snapshot already contains them.
    const { cards, ...withoutCards } = row;
    const parsed = { ...(row.parsed || {}), cards: row.cards || row.parsed?.cards || [] };
    return { ...withoutCards, parsed, cards: parsed.cards };
  }
  async function refreshSaved() {
    try { const data = await readJson('/api/admin/import-studio/queue'); savedRecords = data.rows || []; }
    catch (error) { saveError = `Could not read saved queue: ${error.message}`; }
  }
  onMount(refreshSaved);
  async function saveSnapshot(row) {
    if (row.status==='Preparing') return;
    persisting = true; saveError='';
    try {
      const id = await queueId(row);
      const response = await fetch('/api/admin/import-studio/queue', {
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({id,row:serializable(row)})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `Save failed (${response.status})`);
      await refreshSaved();
    } catch(error) { saveError=`Snapshot NOT saved: ${error.message}`; }
    finally { persisting=false; }
  }
  async function restoreSnapshot(record) {
    try {
      const result=await readJson(`/api/admin/import-studio/queue?id=${record.id}`);
      const row=result.row.row;
      const cards=row.cards || row.parsed?.cards || [];
      prepared=[...prepared.filter(x=>identity(x)!==identity(row)),{...row,cards,parsed:{...row.parsed,cards}}];
      message=`Restored ${row.name} with saved corrections.`;
    } catch(error) { saveError=error.message; }
  }
  async function removeSnapshot(row) {
    if(!confirm(`Remove saved review snapshot for ${row.product_name}? This will not delete an imported product.`))return;
    const response=await fetch(`/api/admin/import-studio/queue?id=${row.id}`,{method:'DELETE'});
    if(!response.ok){saveError='Could not remove snapshot.';return;}
    await refreshSaved();
  }
  async function importApproved(row) {
    if (importing) return;
    if (importedIds.includes(identity(row))) return;
    if(row.status!=='Prepared'||row.issues?.length||row.parsed?.safety?.blocked||row.unresolved) {
      reportImport(row,'error','This product is not ready to import. Resolve the parser or validation issues first.'); return;
    }
    const audit=validateChecklistImport(row.cards||[],row.parsed?.checklist_meta,row.parsed?.sections);
    if(audit?.blocked||audit?.valid===false||row.cards?.some(unresolvedCard)) {
      reportImport(row,'error','Checklist failed validation. Review the source cards before importing.'); return;
    }
    if(existing(row)) { reportImport(row,'error',`${row.name} already appears imported. No overwrite allowed.`); return; }
    const sport=selectedValue(row,'sport');
    const manufacturer=selectedValue(row,'manufacturer');
    const selectedSport=sports.find(x=>x.name.toLowerCase()===sport.toLowerCase());
    const selectedManufacturer=manufacturers.find(x=>x.name.toLowerCase()===manufacturer.toLowerCase());
    if(!selectedSport || !selectedManufacturer) {
      reportImport(row,'error','Select a recognized sport and manufacturer below, then retry the import.'); return;
    }
    if(!confirm(`Import ${row.cards.length} validated cards for ${row.name} as a DRAFT? This creates a product; it does not publish.`)) return;
    importing=identity(row);
    reportImport(row,'','');
    try {
      const response=await fetch('/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        name:row.name,year:row.year,sportId:selectedSport.id,manufacturerId:selectedManufacturer.id,
        sourceUrl:row.checklistUrl,sourceFilename:row.checklistFilename||'',cards:row.cards,
        checklist_meta:row.parsed.checklist_meta,sections:row.parsed.sections,
        replaceDraft:false
      })});
      let result;
      try { result=await response.json(); } catch { result={}; }
      if(!response.ok) throw new Error(result.message || result.error || `Import failed (HTTP ${response.status})`);
      importedIds=[...importedIds,identity(row)];
      reportImport(row,'success',`${row.name} imported as a draft (${row.cards.length} cards). It has not been published.`);
      await refreshSaved();
    } catch(error) { reportImport(row,'error',`Import failed: ${error.message}`); }
    finally { importing=''; }
  }
  function unresolvedCard(card) { return card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved'; }
  function rowSafetyIssues(parsed, audit, unresolved) {
    const issues=[];
    if(parsed.safety?.blocked) issues.push('Unsupported or unsafe parser layout');
    if(unresolved) issues.push(`${unresolved} unresolved affiliations`);
    if(audit?.blocked || audit?.valid===false) issues.push('Checklist validation failed');
    return issues;
  }
  function visibleReviewCards(row) {
    if (!row?.cards) return [];
    const q=reviewSearch.trim().toLowerCase();
    return row.cards.map((card,index)=>({card,index})).filter(({card})=>(!issueOnly||unresolvedCard(card)||/^(rookie|rc|auto|autograph|legend)$/i.test(String(card.affiliation||''))) && (!q || `${card.subject||''} ${card.card_number||card.number||''} ${card.affiliation||''} ${card.checklist_name||''}`.toLowerCase().includes(q))).slice(0,showAllCards?200:35);
  }
  function toggleReview(row) {
    const id=identity(row); expandedReview=expandedReview===id?'':id;
    reviewSearch=''; issueOnly=true;showAllCards=false;
  }
  function updateAffiliation(row, index, value) {
    const id=identity(row);
    affiliationDrafts={...affiliationDrafts,[`${id}:${index}`]:value};
  }
  function applyAffiliation(row, index) {
    const id=identity(row);
    const selected=String(affiliationDrafts[`${id}:${index}`]||'').trim();
    if(!selected || selected==='UNRESOLVED')return;
    const cards=row.cards.map((card,i)=>i===index?{
      ...card,affiliation:selected,affiliation_id:null,
      affiliation_status:selected==='NIL'?'source-nil':'manual-review',confidence:1
    }:card);
    const unresolved=cards.filter(unresolvedCard).length;
    const audit=validateChecklistImport(cards,row.parsed.checklist_meta,row.parsed.sections);
    const updated={...row,cards,parsed:{...row.parsed,cards},audit,unresolved,issues:rowSafetyIssues(row.parsed,audit,unresolved),status:''};
    updated.status=updated.issues.length?'Needs review':'Prepared';
    prepared=prepared.map(item=>identity(item)===id?updated:item);
    void saveSnapshot(updated);
  }
  function applyAllAffiliations(row, value) {
    if(value!=='NIL')return;
    if(!confirm(`Mark all ${row.unresolved} unresolved affiliations as NIL for this product? Only use this if the source truly provides no affiliation information.`))return;
    let cards=row.cards.map(card=>unresolvedCard(card)?{...card,affiliation:'NIL',affiliation_id:null,affiliation_status:'source-nil',confidence:1}:card);
    const audit=validateChecklistImport(cards,row.parsed.checklist_meta,row.parsed.sections);
    const updated={...row,cards,parsed:{...row.parsed,cards},audit,unresolved:0,issues:rowSafetyIssues(row.parsed,audit,0)};
    updated.status=updated.issues.length?'Needs review':'Prepared';
    prepared=prepared.map(item=>identity(item)===identity(row)?updated:item);
    void saveSnapshot(updated);
  }
  function bulkResolve(row) {
    const value=bulkAffiliation.trim();
    if(!value || value==='UNRESOLVED')return;
    if(!confirm(`Set ${row.unresolved} unresolved affiliations to "${value}"? Only proceed if every affected row actually belongs to this team/school.`))return;
    const cards=row.cards.map(card=>unresolvedCard(card)?{
      ...card,affiliation:value,affiliation_id:null,
      affiliation_status:value==='NIL'?'source-nil':'manual-review',confidence:1
    }:card);
    const unresolved=cards.filter(unresolvedCard).length;
    const audit=validateChecklistImport(cards,row.parsed.checklist_meta,row.parsed.sections);
    const updated={...row,cards,parsed:{...row.parsed,cards},audit,unresolved,issues:rowSafetyIssues(row.parsed,audit,unresolved)};
    updated.status=updated.issues.length?'Needs review':'Prepared';
    prepared=prepared.map(item=>identity(item)===identity(row)?updated:item);
    bulkAffiliation='';
    void saveSnapshot(updated);
  }
  function classification(item) { return classifyDiscovery(item,products); }
  function existing(item) { return classification(item).status !== 'new'; }
  const filtered = $derived(catalog.filter(item =>
    (!search || `${item.name} ${item.year} ${item.manufacturer} ${item.sport}`.toLowerCase().includes(search.toLowerCase())) &&
    (!onlyNew || classification(item).status !== 'imported')));
  const importedTotal = $derived(catalog.filter(item=>classification(item).status==='imported').length);
  const possibleTotal = $derived(catalog.filter(item=>classification(item).status==='possible').length);
  const newTotal = $derived(catalog.filter(item=>classification(item).status==='new').length);
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
    const items=selectedEligible.slice(0,PREPARE_BATCH_SIZE);
    if(!items.length){message='Select new checklists first.';return;}
    preparing=true;prepared=[];expandedReview='';
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
          const cards=parsed.cards||[];
          const unresolved=cards.filter(unresolvedCard).length;
          const issues=rowSafetyIssues(parsed,audit,unresolved);
          result={...item,status:issues.length?'Needs review':'Prepared',count:cards.length,sectionCount:(parsed.sections||[]).length,issues,parser:parsed.safety?.strategy||parsed.parserFamily||'',audit,parsed,cards,unresolved};
        }catch(error){result={...item,status:'Failed',count:0,issues:[],error:error?.message||'Unknown parser error'};}
        prepared=prepared.map(x=>identity(x)===identity(item)?result:x);
        await saveSnapshot(result);
        message=`Processed ${prepared.length}/${items.length} in this batch · ${selectedEligible.length} eligible selected · ${Math.max(0,selectedEligible.length-items.length)} queued for another batch`; 
      }
      // Consume only the attempted batch. Selections beyond 30 remain queued.
      const done=new Set(items.map(identity));
      chosen=chosen.filter(id=>!done.has(id));
      message=`Batch complete: ${preparedCount} validated · ${reviewedCount} needs review · ${failedCount} failed · ${chosen.length} still selected`;
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
  <div class="saved-queue">
    <div class="review-meta"><strong>Saved review queue · {savedRecords.length} records</strong><button type="button" onclick={refreshSaved}>Refresh saved queue</button></div>
    <p class="muted">Stored in R2 with a D1 index. Reload saved products after a browser refresh. No automatic imports.</p>
    {#each savedRecords as record (record.id)}
      <div class="saved-row"><span>{record.product_name} · {record.card_count} cards · {record.status} · {record.updated_at}</span><button type="button" onclick={()=>restoreSnapshot(record)}>Resume review</button><button type="button" onclick={()=>removeSnapshot(record)}>Remove</button></div>
    {/each}
    {#if persisting}<p class="muted">Saving review checkpoint…</p>{/if}
    {#if saveError}<p class="warn" role="alert">{saveError}</p>{/if}
  </div>
  {#if catalog.length}
    <div class="tools"><strong>{filtered.length} visible · {selectedEligible.length} eligible selected{#if hiddenSelection>0} · {hiddenSelection} excluded{/if}</strong><input placeholder="Search discovered files" bind:value={search}/><label class="check"><input type="checkbox" bind:checked={onlyNew}/> Hide already imported</label><button onclick={selectVisible} disabled={scanning||preparing}>Select visible new</button><button onclick={()=>chosen=[]} disabled={scanning||preparing}>Clear selection</button><button class="primary" onclick={prepare} disabled={!selectedEligible.length||scanning||preparing}>{preparing?'Preparing…':`Prepare next ${Math.min(selectedEligible.length,PREPARE_BATCH_SIZE)}`}</button></div>
    {#if remainingAfterBatch}<p class="muted">Batch size: {PREPARE_BATCH_SIZE}. {remainingAfterBatch} eligible selections will remain selected for the next batch. Nothing is silently discarded.</p>{/if}
    <p class="muted">{importedTotal} already imported · {possibleTotal} possible duplicates (held for review) · {newTotal} new. Distinct editions are kept separate. Toggle “Hide already imported” to inspect matches.</p>
    <div class="source-list">
    {#each filtered as item (identity(item))}
      <label class="source-row"><input type="checkbox" checked={chosen.includes(identity(item))} disabled={existing(item)||preparing} onchange={()=>toggle(item)}/><span><strong>{item.name}</strong><small>{item.year} · {item.sport||'Unknown sport'} · {item.manufacturer||'Unknown brand'} · {item.source||'Source'} {classification(item).status==='imported'?' · Already imported':classification(item).status==='possible'?' · Possible duplicate · Review required':' · New'} {#if classification(item).match} · Matches: {classification(item).match.name} ({classification(item).reason}){/if}</small></span><a href={item.checklistUrl} target="_blank" rel="noreferrer">Source ↗</a></label>
    {/each}
    </div>
  {/if}
  {#if prepared.length}
    <h3>Prepared file review</h3>
    <p class="muted">{preparedCount} validated · {reviewedCount} needs review · {failedCount} failed. Prepared results are checkpointed in R2/D1. Imports require the explicit Import draft action.</p>
    {#each prepared as row (identity(row))}
      <div class="prepared">
        <div><strong>{row.name}</strong><small>{row.count.toLocaleString()} cards · {row.sectionCount||0} sections · {row.status}</small></div>
        <div class="row-actions">
          {#if row.issues?.length}<span class="warn">{row.issues.join(' · ')}</span>{:else if row.error}<span class="warn">{row.error}</span>{:else if row.status==='Prepared'}<span class="good">Checklist validated</span>{/if}
          {#if row.status==='Prepared' && !importedIds.includes(identity(row))}<button type="button" disabled={Boolean(importing)} onclick={()=>importApproved(row)}>{importing===identity(row)?'Importing…':'Import draft'}</button>{/if}
          {#if importedIds.includes(identity(row))}<span class="good">Imported as draft ✓</span>{/if}
          {#if row.parsed}<button type="button" onclick={()=>toggleReview(row)}>{expandedReview===identity(row)?'Close details':'Inspect cards / parser'}</button>{/if}
        </div>
      </div>
      {#if row.status==='Prepared' && !importedIds.includes(identity(row))}
        <div class="classify-row">
          <label>Sport <select value={selectedValue(row,'sport')} onchange={(e)=>setClassification(row,'sport',e.currentTarget.value)}>
            <option value="">Select sport</option>
            {#each sports as sport}<option value={sport.name}>{sport.name}</option>{/each}
          </select></label>
          <label>Manufacturer <select value={selectedValue(row,'manufacturer')} onchange={(e)=>setClassification(row,'manufacturer',e.currentTarget.value)}>
            <option value="">Select manufacturer</option>
            {#each manufacturers as manufacturer}<option value={manufacturer.name}>{manufacturer.name}</option>{/each}
          </select></label>
        </div>
      {/if}
      {#if importResult(row)?.text}<p class:good={importResult(row).type==='success'} class:warn={importResult(row).type==='error'} role="status">{importResult(row).text}</p>{/if}
      {#if row.parsed && expandedReview===identity(row)}
        <div class="review-pane">
          <div class="review-meta"><strong>Parser and validation</strong><span>{row.parser || 'Unspecified strategy'}</span></div>
          <p class="muted">Parser block: {row.parsed.safety?.blocked?'Yes — cannot import':'No'} · Unresolved affiliations: {row.unresolved} · Validation blocked: {row.audit?.blocked?'Yes':'No'}</p>
          {#if row.parsed.safety?.blocked}
            <p class="warn">Unsafe parser layouts remain blocked. Card edits cannot bypass this gate. Fix and revalidate the parser strategy before importing.</p>
          {/if}
          {#if row.parsed.safety}<details><summary>Parser safety details</summary><pre>{JSON.stringify(row.parsed.safety,null,2)}</pre></details>{/if}
          {#if row.audit}<details><summary>Validation details</summary><pre>{JSON.stringify(row.audit,null,2)}</pre></details>{/if}
          <div class="review-tools"><input placeholder="Search cards or affiliations" bind:value={reviewSearch}/><label class="check"><input type="checkbox" bind:checked={issueOnly}/> Issues only</label><span class="muted">{selectedCount(row)} selected</span><button type="button" disabled={Boolean(aiBusy)} onclick={()=>selectNextAiIssues(row)}>Select 25 flagged cards</button><button type="button" disabled={Boolean(aiBusy)||!selectedCount(row)||proposalsFor(row).length>0} onclick={()=>suggestAiCorrections(row)}>{aiBusy===identity(row)?'Asking AI…':'Suggest AI fixes'}</button></div>
          <p class="muted">AI is optional and uses selected rows plus extracted raw source text. It does not see the rendered PDF. It never applies changes without your approval.</p>
          {#if reviewMessage(row)}<p role="status" class="muted">{reviewMessage(row)}</p>{/if}
          {#each proposalsFor(row) as proposal (proposal.index)}
            <div class="ai-proposal"><strong>Card {row.cards[proposal.index]?.card_number} — suggested changes</strong><p>{proposal.reason}</p>
              {#each Object.entries(proposal.changes) as [field,value]}<label class="ai-field"><input type="checkbox" checked={fieldEnabled(row,proposal,field)} onchange={event=>toggleProposalField(row,proposal,field,event.currentTarget.checked)}/><span><strong>{field}:</strong> {String(row.cards[proposal.index]?.[field]??'')} → {String(value)}</span></label>{/each}
              <div class="card-fix"><button type="button" onclick={()=>acceptAiSuggestion(row,proposal)}>Accept and save</button><button type="button" onclick={()=>rejectAiSuggestion(row,proposal)}>Reject</button></div>
            </div>
          {/each}
          {#if row.unresolved}<div class="bulk-fix"><input placeholder="One verified team/school for all unresolved" bind:value={bulkAffiliation}/><button type="button" disabled={!bulkAffiliation.trim()} onclick={()=>bulkResolve(row)}>Apply to all unresolved</button><button type="button" class="nil-button" onclick={()=>applyAllAffiliations(row,'NIL')}>Mark all NIL (only if source has no affiliations)</button></div>{/if}
          <div class="cards-list">
            {#each visibleReviewCards(row) as entry (entry.index)}
              <div class="card-line">
                <div><strong>{entry.card.card_number||entry.card.number||'—'} · {entry.card.subject||entry.card.name||'Unspecified subject'}</strong><small>{entry.card.checklist_name||''} · {entry.card.affiliation||'No affiliation'} · {entry.card.affiliation_status||'Unknown status'}</small></div>
                <label class="ai-select"><input type="checkbox" checked={!!aiSelected[identity(row)+':'+entry.index]} onchange={e=>aiSelected={...aiSelected,[identity(row)+':'+entry.index]:e.currentTarget.checked}}/> AI</label>
                <details class="inline-edit"><summary>Edit card</summary><div class="editor-fields">
                  {#each ['card_number','subject','affiliation','checklist_name'] as field}
                    <label>{field}<input value={rowDraft(row,entry.index)[field]??''} oninput={e=>updateManual(row,entry.index,field,e.currentTarget.value)}/></label>
                  {/each}
                  {#each ['rookie','autograph','memorabilia'] as field}
                    <label><input type="checkbox" checked={!!rowDraft(row,entry.index)[field]} onchange={e=>updateManual(row,entry.index,field,e.currentTarget.checked)}/>{field}</label>
                  {/each}
                </div><button type="button" onclick={()=>applyCard(row,entry.index,rowDraft(row,entry.index))}>Save correction</button></details>
                {#if unresolvedCard(entry.card)}
                  <div class="card-fix"><input placeholder="Verified team/school or NIL" value={affiliationDrafts[`${identity(row)}:${entry.index}`]||''} oninput={(event)=>updateAffiliation(row,entry.index,event.currentTarget.value)}/><button type="button" disabled={!String(affiliationDrafts[`${identity(row)}:${entry.index}`]||'').trim()} onclick={()=>applyAffiliation(row,entry.index)}>Apply</button></div>
                {/if}
              </div>
            {/each}
          </div>
          {#if visibleReviewCards(row).length===(showAllCards?200:35)}<button type="button" onclick={()=>showAllCards=!showAllCards}>{showAllCards?'Show fewer':'Show up to 200 cards'}</button>{/if}
          <p class="muted">Corrections update the prepared in-memory checklist and rerun validation. They are not persisted until the later explicit import step.</p>
        </div>
      {/if}
    {/each}
    <p class="muted">Only validated products may be imported as drafts. Unsupported parsers, unresolved affiliations, and failed validation remain blocked.</p>
  {/if}
</section>
<style>
  .ai-field{display:flex;align-items:flex-start;gap:.5rem;margin:.4rem 0;font-size:.75rem}
  .ai-proposal{padding:1rem;border:1px solid var(--line-strong);border-radius:.5rem;background:white;margin:.7rem 0;font-size:.78rem}.ai-proposal p{color:var(--muted)}.ai-select{display:flex;gap:.2rem;align-items:center;font-size:.7rem}.inline-edit{min-width:90px}.inline-edit summary{cursor:pointer}.editor-fields{display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:.5rem;margin:.5rem 0}.editor-fields label{font-size:.7rem;display:grid;gap:.2rem}.editor-fields input:not([type=checkbox]){min-width:0;padding:.35rem;border:1px solid var(--line-strong);border-radius:.3rem} 
  .classify-row{display:flex;gap:.75rem;flex-wrap:wrap;align-items:end;padding:.4rem 0 1rem}
  .classify-row label{display:grid;gap:.25rem;font-size:.69rem;font-weight:700}
  .classify-row select{min-width:165px;max-width:100%;padding:.5rem;border:1px solid var(--line-strong);border-radius:.4rem;background:white}
  .bulk-fix{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.5rem 0}.bulk-fix input{padding:.5rem;border:1px solid var(--line-strong);border-radius:.4rem;min-width:260px}
  .saved-queue{margin:1rem 0;padding:.75rem;border:1px solid var(--line);border-radius:.55rem}.saved-row{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;padding:.4rem 0;border-bottom:1px solid var(--line);font-size:.73rem}.saved-row span{flex:1}
  .acquire{border:1px solid var(--line);padding:1.25rem;border-radius:.8rem;margin:1.5rem 0 2rem;background:#fff}.head h2{font-size:1.5rem;margin:.25rem 0}.head p,.muted{color:var(--muted);font-size:.78rem}.eyebrow{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:var(--blue)}.bar,.tools{display:flex;flex-wrap:wrap;align-items:end;gap:.85rem;margin:1rem 0}.bar label{display:grid;gap:.3rem;font-size:.7rem;font-weight:700}.bar .check,.tools .check{display:flex;align-items:center;gap:.35rem}.bar input[type=number]{width:100px}.bar input,.bar select,.tools input{border:1px solid var(--line-strong);border-radius:.4rem;padding:.55rem;font:inherit}.bar input[type=checkbox],.tools input[type=checkbox]{width:auto}.acquire button{background:#fff;border:1px solid var(--line-strong);padding:.65rem .8rem;border-radius:.45rem;cursor:pointer;font:inherit;font-size:.7rem;font-weight:750}.acquire .primary{color:#fff;background:#171717}.acquire button:disabled{opacity:.5;cursor:not-allowed}.notice{background:#f5f7f8;border:1px solid var(--line);padding:.7rem;border-radius:.5rem;font-size:.76rem}.tools strong{font-size:.76rem;margin-right:auto}.source-list{max-height:430px;overflow:auto;border:1px solid var(--line);border-radius:.5rem}.source-row{display:flex;gap:.8rem;align-items:center;padding:.7rem;border-bottom:1px solid var(--line);font-size:.78rem}.source-row span{display:grid;gap:.2rem;flex:1}.source-row small,.prepared small{font-size:.67rem;color:var(--muted)}.source-row a{font-size:.68rem;white-space:nowrap;color:var(--blue)}.prepared{border-top:1px solid var(--line);padding:.8rem 0;display:flex;justify-content:space-between;gap:1rem;font-size:.8rem}.prepared>div:first-child{display:grid;gap:.25rem}.warn{color:#9b3d21;font-size:.75rem}.good{color:#276644;font-size:.75rem}
  .row-actions{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;flex-wrap:wrap}.review-pane{border:1px solid var(--line);background:#fafafa;border-radius:.65rem;padding:1rem;margin:.5rem 0 1.1rem}.review-meta{display:flex;gap:1rem;justify-content:space-between;font-size:.78rem}.review-tools{display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;margin:.8rem 0}.review-tools input,.card-fix input{padding:.5rem;border:1px solid var(--line-strong);border-radius:.4rem}.review-tools .check{font-size:.72rem}.review-tools input[type=checkbox]{margin-right:.4rem}.cards-list{max-height:380px;overflow:auto}.card-line{display:flex;align-items:center;gap:.75rem;justify-content:space-between;border-bottom:1px solid var(--line);padding:.65rem 0;font-size:.75rem}.card-line>div:first-child{display:grid;gap:.2rem}.card-line small{color:var(--muted);font-size:.66rem}.card-fix{display:flex;gap:.35rem;flex-wrap:wrap}.review-pane pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.69rem;max-height:300px;overflow:auto}.review-pane details{margin:.55rem 0;font-size:.74rem}.nil-button{margin:.4rem 0;color:#873719}
</style>
