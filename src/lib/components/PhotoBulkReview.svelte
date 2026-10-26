<script>
  let { products = [], onSaved = () => {} } = $props();
  let batchSize = $state(25);
  let includeExisting = $state(false);
  let running = $state(false);
  let stop = $state(false);
  let rows = $state([]);
  let scanned = $state(0);
  let message = $state('');
  let saving = $state(null);
  let chosen = $state({});
  const pending = $derived(products.filter(p => includeExisting || !p.image_key));
  const remaining = $derived(pending.filter(p => !rows.some(r => Number(r.id) === Number(p.id))));
  const found = $derived(rows.filter(r => r.candidates?.length).length);
  const approved = $derived(rows.filter(r => r.saved).length);
  function query(p) { const name=String(p.name||'').trim();return /^20\d{2}\b/.test(name)?name:[p.year,name].filter(Boolean).join(' '); }
  function search(p) { return 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query(p)); }
  function select(id,url) { chosen = {...chosen,[id]:url}; }
  async function scan() {
    if (running) return;
    if (rows.some(r => r.candidates?.length && !r.saved)) { message='Review or clear current candidates before scanning a new batch.'; return; }
    const targets = remaining.slice(0, Number(batchSize));
    if (!targets.length) {message='No more eligible sets in this session.';return;}
    running=true;stop=false;message='';scanned=0;
    for (const p of targets) {
      if(stop)break;
      try {
        const r=await fetch('/api/admin/products/photo-discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:p.id}),signal:AbortSignal.timeout(22000)});
        const result=await r.json().catch(()=>({}));
        rows=[...rows,{id:p.id,product:p,candidates:result.candidates||[],error:result.message||(!result.candidates?.length?'No image matches found.':'')}];
      } catch(e) { rows=[...rows,{id:p.id,product:p,candidates:[],error:e?.message||'Search failed'}]; }
      scanned++;
    }
    running=false;
    message='Scanned '+scanned+' sets. '+rows.filter(r=>r.candidates?.length).length+' have candidate images. Nothing saved without your approval.';
  }
  async function save(row){
    if(saving !== null || !chosen[row.id])return;
    saving=row.id;message='';
    try {
      const response=await fetch('/api/admin/products/photo-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:row.id,imageUrl:chosen[row.id]})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.message||'Image could not be imported.');
      rows=rows.map(r=>r.id===row.id?{...r,saved:true,error:''}:r);
      onSaved(result);
      message='Saved image for '+row.product.name+'.';
    }catch(e){rows=rows.map(r=>r.id===row.id?{...r,error:e?.message||'Save failed'}:r);}
    finally{saving=null;}
  }
  function removeRow(id){rows=rows.filter(r=>r.id!==id);}
</script>
<section class="photo-bulk" aria-label="Bulk photo review">
  <div class="photo-header"><div><h2>Bulk photo discovery</h2><p>Search the wider web for possible box images, select the correct one, then approve. Existing images aren't replaced unless you opt in.</p></div><strong>{pending.length} eligible</strong></div>
  <div class="photo-controls">
    <label>Batch <select bind:value={batchSize} disabled={running}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
    <label><input type="checkbox" bind:checked={includeExisting} disabled={running}/> Include sets with photos</label>
    <button onclick={scan} disabled={running||!remaining.length}>{running?'Scanning…':'Scan next '+Math.min(Number(batchSize),remaining.length)}</button>
    {#if running}<button class="light" onclick={()=>stop=true}>Stop after current</button>{/if}
    <button class="light" disabled={running||!rows.length} onclick={()=>{rows=[];chosen={};message='';}}>Clear results</button>
  </div>
  <p class="photo-stats">{rows.length} scanned · {found} with candidates · {approved} saved. Results are temporary; saving requires approval.</p>
  {#if message}<p role="status" class="photo-msg">{message}</p>{/if}
  {#if rows.length}
    <div class="photo-results">
    {#each rows as row (row.id)}
      <article class="photo-result">
        <div class="photo-row-head"><div><strong>{String(row.product.name).startsWith(String(row.product.year) + ' ') ? row.product.name : row.product.year + ' ' + row.product.name}</strong><small>{row.candidates.length} candidates {row.saved?'· Saved':''}</small></div><button class="light" onclick={()=>removeRow(row.id)} disabled={running||saving===row.id}>Dismiss</button></div>
        {#if row.error}<p class="photo-warning">{row.error}</p>{/if}
        {#if !row.candidates.length}<a href={search(row.product)} target="_blank" rel="noopener noreferrer">Search images manually ↗</a>{/if}
        {#if row.candidates.length}
          <div class="photo-candidates">
            {#each row.candidates as candidate (candidate.url)}
              <label class:selected={chosen[row.id]===candidate.url} class="photo-choice">
                <input type="radio" name={'photo-'+row.id} checked={chosen[row.id]===candidate.url} onchange={()=>select(row.id,candidate.url)} disabled={row.saved}/>
                <img src={candidate.thumbnail||candidate.url} alt="Potential product image" loading="lazy" referrerpolicy="no-referrer"/>
                <small title={candidate.source}>{candidate.source}</small>
              </label>
            {/each}
          </div>
          <div class="photo-approval">
            <span>Review year, product, box format, watermark and reuse rights before approving.</span>
            {#if chosen[row.id]}<a href={chosen[row.id]} target="_blank" rel="noopener noreferrer">Full image ↗</a>{/if}
            <button disabled={!chosen[row.id]||row.saved||saving!==null} onclick={()=>save(row)}>{row.saved?'Saved ✓':saving===row.id?'Saving…':'Approve & save selected'}</button>
          </div>
        {/if}
      </article>
    {/each}
    </div>
  {/if}
</section>
<style>
.photo-bulk{margin:1.3rem 0;padding:1rem 1.15rem;border:1px solid var(--line);border-radius:.75rem;background:#fff}.photo-header{display:flex;align-items:start;justify-content:space-between;gap:1rem}.photo-header h2{font-size:1.2rem;margin:0}.photo-header p{font-size:.75rem;color:var(--muted);max-width:700px;line-height:1.6;margin:.3rem 0}.photo-header>strong{font-size:.8rem;white-space:nowrap}.photo-controls,.photo-approval{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:.7rem 0}.photo-controls label{display:flex;gap:.35rem;align-items:center;font-size:.75rem}.photo-controls select{padding:.35rem;border:1px solid var(--line-strong);border-radius:.35rem}.photo-bulk button{cursor:pointer;border:1px solid var(--ink);background:var(--ink);color:white;padding:.47rem .67rem;border-radius:.42rem;font:inherit;font-size:.75rem;font-weight:700}.photo-bulk button.light{background:white;border-color:var(--line-strong);color:var(--ink)}.photo-bulk button:disabled{opacity:.45;cursor:not-allowed}.photo-stats,.photo-msg{color:var(--muted);font-size:.75rem}.photo-results{max-height:700px;overflow-y:auto;border-top:1px solid var(--line)}.photo-result{padding:1rem 0;border-bottom:1px solid var(--line)}.photo-row-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}.photo-row-head strong{font-size:.82rem}.photo-row-head small{display:block;font-size:.72rem;color:var(--muted)}.photo-candidates{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:.55rem;margin:.8rem 0}.photo-choice{border:2px solid var(--line);border-radius:.45rem;padding:.45rem;cursor:pointer;min-width:0}.photo-choice.selected{border-color:var(--ink);background:#f3f5f4}.photo-choice input{margin:0 0 .35rem}.photo-choice img{width:100%;height:110px;object-fit:contain;display:block}.photo-choice small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.65rem}.photo-approval{justify-content:flex-end}.photo-approval span{margin-right:auto;font-size:.72rem;color:var(--muted)}.photo-approval a,.photo-result>a{font-size:.75rem}.photo-warning{color:#af3127;font-size:.75rem}
</style>
