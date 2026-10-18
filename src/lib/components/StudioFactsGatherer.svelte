<script>
  import { invalidateAll } from '$app/navigation';
  let { products = [] } = $props();
  let search = $state('');
  let onlyMissing = $state(true);
  let working = $state(false);
  let progress = $state('');
  let drafts = $state([]);
  let error = $state('');
  let checked = $state({});
  let applying = $state(null);
  const visible = $derived(products.filter(p => {
    if (onlyMissing && p.formats?.some(f => String(f.details||'').trim()) && p.release_date) return false;
    const q = search.trim().toLowerCase();
    return !q || `${p.year} ${p.name} ${p.manufacturer_name}`.toLowerCase().includes(q);
  }));
  function stringifyError(e) {return e?.message || String(e);}
  async function gatherOne(product) {
    const response = await fetch(`/api/admin/import-studio/facts?productId=${encodeURIComponent(product.id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Gathering failed.');
    return result;
  }
  async function gatherBatch() {
    if(working) return;
    working=true;error='';drafts=[];checked={};
    const list=visible.slice(0,20); // bounded Cloudflare requests, intentionally no 350-product fanout
    try {
      for(let i=0;i<list.length;i++) {
        const p=list[i]; progress=`Checking ${i+1} of ${list.length}: ${p.name}`;
        try {
          const draft=await gatherOne(p);
          drafts=[...drafts,draft];
          checked={...checked,[p.id]:(draft.proposals||[]).map(x=>x.key)};
        }catch(e) {drafts=[...drafts,{id:p.id,product:p.name,status:'error',message:stringifyError(e),proposals:[]}];}
      }
      progress=`Reviewed ${list.length} products · ${drafts.filter(d=>d.proposals?.length).length} with factual proposals`;
    }catch(e){error=stringifyError(e);}finally{working=false;}
  }
  function toggle(id,key,on) {
    const keys=new Set(checked[id]||[]);
    if(on)keys.add(key);else keys.delete(key);
    checked={...checked,[id]:[...keys]};
  }
  async function applyDraft(draft) {
    const keys=checked[draft.id]||[];
    if(!keys.length)return;
    if(!confirm(`Apply ${keys.length} missing factual field(s) to ${draft.product}? Existing facts will not be replaced.`))return;
    applying=draft.id;error='';
    try {
      const response=await fetch('/api/admin/import-studio/facts',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({productId:draft.id,keys})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Could not save facts.');
      const updated=await gatherOne({id:draft.id});
      drafts=drafts.map(d=>d.id===draft.id?updated:d);
      checked={...checked,[draft.id]:[]};
      await invalidateAll();
    }catch(e){error=stringifyError(e);}finally{applying=null;}
  }
</script>
<section class="facts" aria-labelledby="phase4-title">
  <div class="heading"><div><span class="kicker">Phase 4 · Product facts</span><h2 id="phase4-title">Gather missing configurations</h2>
    <p>Review factual proposals from safely matched sources. No generated overview, no automatic overwrite, no guessing.</p></div></div>
  <div class="controls"><input aria-label="Find products for facts gathering" placeholder="Search products…" bind:value={search}/>
    <label><input type="checkbox" bind:checked={onlyMissing}/> Missing facts only</label>
    <button type="button" disabled={working || !visible.length} onclick={gatherBatch}>{working?'Gathering…':'Gather facts (up to 20)'}</button></div>
  <p class="muted">{visible.length} eligible products. Runs are capped at 20 per click; filter by year/name to work through batches. Checklist Insider is preferred when product identity is verified, even for official Topps imports. Official metadata fills missing fields; ambiguous matches are blocked.</p>
  {#if progress}<p class="progress" role="status">{progress}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if drafts.length}
    <div class="results">
      {#each drafts as draft (draft.id)}
        <article class="draft"><div class="draft-title"><div><strong>{draft.product}</strong><small>{draft.message}</small></div><span class:ready={draft.proposals?.length}>{draft.proposals?.length ? `${draft.proposals.length} proposed` : 'No verified facts'}</span></div>
          {#if draft.sources?.length}<div class="sources">{#each draft.sources as source}<small>{source.name}: {source.status} {#if source.url}<a href={source.url} target="_blank" rel="noreferrer">Source ↗</a>{/if}</small>{/each}</div>{/if}
          {#each draft.proposals||[] as proposal (proposal.key)}
            <label class="proposal"><input type="checkbox" checked={(checked[draft.id]||[]).includes(proposal.key)} onchange={e=>toggle(draft.id,proposal.key,e.currentTarget.checked)}/>
              <span><strong>{proposal.key==='release_date'?'Release date':proposal.key}</strong><pre>{proposal.details}</pre><small>{proposal.source} · {proposal.sourceName||draft.product}</small></span></label>
          {/each}
          {#if draft.proposals?.length}<button class="save" type="button" disabled={applying===draft.id || !(checked[draft.id]||[]).length} onclick={()=>applyDraft(draft)}>{applying===draft.id?'Saving…':'Apply selected missing facts'}</button>{/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
<style>
.facts{border:1px solid #dfdfdf;border-radius:14px;padding:22px;margin:26px 0;background:white}.kicker{color:#17617a;letter-spacing:.12em;text-transform:uppercase;font-weight:800;font-size:11px}.heading h2{font-size:23px;margin:7px 0}.heading p,.muted{font-size:13px;color:#646464;line-height:1.5}.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:19px}.controls>input{min-width:230px;flex:1;padding:12px;border:1px solid #ddd;border-radius:9px}.controls label{font-size:12px;white-space:nowrap}.controls button,.save{background:#151515;color:#fff;border:0;border-radius:8px;padding:12px;font-weight:750;cursor:pointer}.controls button:disabled,.save:disabled{opacity:.45;cursor:not-allowed}.progress{background:#f3f6f7;padding:11px;border-radius:7px;font-size:12px}.error{color:#a32720}.draft{border-top:1px solid #eee;padding:15px 0}.draft-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.draft-title div{display:grid;gap:4px}.draft-title small,.sources small,.proposal small{color:#696969;font-size:11px}.draft-title>span{font-size:11px;white-space:nowrap}.draft-title>span.ready{color:#147048}.sources{display:grid;gap:3px;margin:9px 0}.sources a{color:#17617a}.proposal{display:flex;gap:10px;padding:12px;background:#fafafa;border:1px solid #eee;border-radius:9px;margin:8px 0}.proposal>span{min-width:0}.proposal strong{text-transform:capitalize;font-size:12px}.proposal pre{font:12px/1.5 inherit;white-space:pre-wrap;word-break:break-word;margin:5px 0}.save{margin-top:6px}
</style>
