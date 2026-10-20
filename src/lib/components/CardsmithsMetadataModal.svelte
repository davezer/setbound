<script>
  let { product, onclose, onapplied } = $props();
  let loading=$state(false), saving=$state(false), error=$state(''), details=$state(null);
  let useDate=$state(false), selected=$state([]);
  async function lookup(){
    loading=true;error='';
    try {const r=await fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',productId:product.id})});const j=await r.json();if(!r.ok)throw Error(j.message||'Lookup failed');details=j;useDate=!!j.releaseDate&&!j.existingDate;selected=[];}
    catch(e){error=e.message||'Lookup failed';}finally{loading=false;}
  }
  async function save(){
    if(!details||saving)return;
    if(!confirm('Save selected empty metadata fields? Card data, notes and artwork will not change.'))return;
    saving=true;error='';
    try{const r=await fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:product.id,releaseDate:useDate,formats:selected})});const j=await r.json();if(!r.ok)throw Error(j.message||'Save failed');onapplied?.(j);onclose?.();}
    catch(e){error=e.message||'Save failed';}finally{saving=false;}
  }
  function toggle(k,on){selected=on?[...selected,k]:selected.filter(x=>x!==k)}
</script>
<div class="shade" role="presentation" onclick={e=>{if(e.target===e.currentTarget)onclose?.()}}>
  <section class="panel" role="dialog" aria-modal="true" aria-label="Parent checklist metadata" tabindex="-1">
    <header><div><h2>Source metadata</h2><p>{product.name}</p></div><button onclick={()=>onclose?.()} aria-label="Close">×</button></header>
    <p>Looks up an exact archive-confirmed parent release. Only selected, previously empty fields are saved.</p>
    <button class="primary" onclick={lookup} disabled={loading||saving}>{loading?'Checking source…':'Check Cardsmiths parent release'}</button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if details}
      <div class="result"><strong>Matched: {details.archiveName||product.name}</strong><a href={details.sourceUrl} target="_blank" rel="noopener noreferrer">View source ↗</a></div>
      <label class="choice"><input type="checkbox" bind:checked={useDate} disabled={!details.releaseDate||!!details.existingDate}/> Release date: {details.releaseDate||'Not available'} {details.existingDate?'(already set: '+details.existingDate+')':''}</label>
      <h3>Listed configurations</h3>
      {#if !details.formats.length}<p>No configuration labels were found.</p>{/if}
      {#each details.formats as f}
        <label class="choice"><input type="checkbox" checked={selected.includes(f.key)} disabled={!f.key} onchange={e=>toggle(f.key,e.currentTarget.checked)}/> {f.label} {f.key?'':'(unrecognized; review manually)'}</label>
      {/each}
      <p class="hint">Configuration labels are not box specifications. This tool does not copy source descriptions, modify cards, or download images.</p>
      <button class="primary" onclick={save} disabled={saving||(!useDate&&!selected.length)}>{saving?'Saving…':'Approve selected metadata'}</button>
    {/if}
  </section>
</div>
<style>
.shade{position:fixed;inset:0;background:#0009;z-index:1200;display:grid;place-items:center;padding:1rem}.panel{width:min(640px,100%);max-height:90vh;overflow:auto;background:white;border-radius:1rem;padding:1.5rem;display:grid;gap:.9rem}.panel header{display:flex;align-items:start;justify-content:space-between}.panel h2{margin:0}.panel h3{margin:.3rem 0 0}.panel p{margin:0;color:#666;font-size:.85rem}.panel header button{border:0;background:transparent;font-size:1.4rem;cursor:pointer}.primary{border:0;border-radius:.55rem;background:#161616;color:#fff;padding:.75rem 1rem;font:inherit;font-weight:800;cursor:pointer}.primary:disabled{opacity:.45}.choice{display:flex;align-items:center;gap:.5rem;font-size:.85rem}.choice input{accent-color:#161616}.result{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.85rem}.result a{color:#056aa7}.panel .error{color:#a32420}.panel .hint{font-size:.75rem}
</style>
