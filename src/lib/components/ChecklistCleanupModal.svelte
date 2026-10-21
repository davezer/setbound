<script>
  let {product,onclose}=$props();
  let proposals=$state([]),selected=$state([]),busy=$state(false),saving=$state(false),error=$state(''),note=$state('');
  async function refresh(){busy=true;error='';try{const r=await fetch(`/api/admin/products/${product.id}/clean-checklists`);const d=await r.json();if(!r.ok)throw Error(d.message||'Review failed');proposals=d.proposals||[];selected=[];}catch(e){error=e?.message||'Review failed';}finally{busy=false;}}
  async function apply(){if(!selected.length||saving)return;if(!confirm(`Apply ${selected.length} reviewed correction(s) to ${product.name}? Imported cards will retain their IDs and collection progress.`))return;saving=true;error='';try{let total=0;for(let i=0;i<selected.length;i+=60){const r=await fetch(`/api/admin/products/${product.id}/clean-checklists`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys:selected.slice(i,i+60)})});const d=await r.json();if(!r.ok)throw Error(d.message||'Cleanup failed');total+=d.updated||0;}note=`Applied ${total} corrections.`;await refresh();}catch(e){error=e?.message||'Save failed';}finally{saving=false;}}
  function toggle(key,checked){selected=checked?[...selected,key]:selected.filter(k=>k!==key)}
</script>
<div class="shade" role="presentation" onclick={e=>{if(e.target===e.currentTarget)onclose?.()}}>
<section class="panel" role="dialog" aria-modal="true" aria-label="Checklist cleanup" tabindex="-1">
<header><div><h2>Review checklist data</h2><p>{product.name}</p></div><button type="button" onclick={()=>onclose?.()}>×</button></header>
<p>Preview proposed fixes to HTML entities and suspicious subject-name suffixes. Nothing is changed without approval.</p>
<button onclick={refresh} disabled={busy||saving}>{busy?'Scanning…':'Find proposed corrections'}</button>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if note}<p role="status">{note}</p>{/if}
{#if !busy && proposals.length}
  <p><strong>{proposals.length}</strong> proposed corrections · {selected.length} selected</p>
  <div class="actions"><button onclick={()=>selected=proposals.filter(x=>x.reason==='Decode HTML entities').map(x=>x.key)} disabled={saving}>Select entity fixes</button><button onclick={()=>selected=[]} disabled={saving}>Clear selection</button></div>
  <div class="rows">{#each proposals as p (p.key)}<label class="item"><input type="checkbox" checked={selected.includes(p.key)} onchange={e=>toggle(p.key,e.currentTarget.checked)} disabled={saving}/><span><small>{p.kind} · {p.reason}</small><del>{p.before}</del><strong>→ {p.after}</strong></span></label>{/each}</div>
  <button class="apply" onclick={apply} disabled={!selected.length||saving}>{saving?'Applying…':`Approve ${selected.length} corrections`}</button>
{:else if !busy && !error && note}<p>No remaining corrections found in this product.</p>{/if}
</section></div>
<style>
.shade{position:fixed;inset:0;background:#0009;z-index:1300;display:grid;place-items:center;padding:1rem}.panel{width:min(850px,100%);max-height:90vh;overflow:auto;background:white;border-radius:1rem;padding:1.25rem;display:grid;gap:.75rem}.panel header{display:flex;justify-content:space-between}.panel h2{margin:0}.panel header p{margin:.2rem 0}.panel button{cursor:pointer;border:1px solid #ddd;border-radius:.5rem;padding:.65rem;background:#eee;font-weight:750}.panel button:disabled{opacity:.45}.panel .apply{background:#151515;color:white}.actions{display:flex;gap:.5rem}.rows{display:grid;gap:.5rem;max-height:55vh;overflow:auto}.item{display:flex;gap:.7rem;border:1px solid #ddd;border-radius:.5rem;padding:.6rem;align-items:flex-start}.item span{display:grid;gap:.3rem}.item small{color:#777}.item del{color:#a33}.error{color:#a33}
</style>
