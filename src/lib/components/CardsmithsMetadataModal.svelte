<script>
  let {product,onclose,onapplied}=$props();
  let loading=$state(false),saving=$state(false),error=$state(''),details=$state(null);
  let dateInfo=$state(null),useDate=$state(false),overview=$state(''),useOverview=$state(false),selected=$state([]),image=$state('');
  async function lookup(){
    loading=true;error='';details=null;
    try{
      const [a,b]=await Promise.all([
        fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',productId:product.id})}),
        fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',productId:product.id})})
      ]);
      const j=await a.json(),k=await b.json();
      if(!a.ok)throw Error(j.message||'Release directory lookup failed.');
      if(!b.ok)throw Error(k.message||'Metadata lookup failed.');
      dateInfo=j;details=k;useDate=!!j.releaseDate&&!j.existingDate;
      overview=k.overview||'';useOverview=!!overview&&!k.existingOverview;
      selected=Object.keys(k.formats||{}).filter(x=>!k.existingFormats?.[x]||k.existingFormats[x].startsWith('Listed as a '));image='';
    }catch(e){error=e?.message||'Could not retrieve metadata.';}finally{loading=false;}
  }
  function toggle(key,value){selected=value?[...new Set([...selected,key])]:selected.filter(x=>x!==key);}
  async function save(){
    if(!details||saving)return;
    if(!confirm('Save the selected metadata to empty fields? Existing content and imported cards will not be overwritten.'))return;
    saving=true;error='';
    try{
      if(useDate){const r=await fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:product.id,releaseDate:true,formats:[]})});const j=await r.json();if(!r.ok)throw Error(j.message||'Release date update failed.');}
      let result={productId:product.id,releaseDate:useDate?dateInfo.releaseDate:null};
      if((useOverview&&overview)||selected.length||image){const r=await fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:product.id,applyOverview:useOverview&&!!overview,formats:selected,imageUrl:image})});const j=await r.json();if(!r.ok)throw Error(j.message||'Could not save metadata.');result={...result,...j};}
      onapplied?.(result);onclose?.();
    }catch(e){error=e?.message||'Save failed.';}finally{saving=false;}
  }
</script>
<div class="shade" role="presentation" onclick={e=>{if(e.target===e.currentTarget)onclose?.()}}>
 <section class="panel" role="dialog" aria-modal="true" aria-label="Source metadata" tabindex="-1">
  <header><div><h2>Source metadata</h2><p>{product.name}</p></div><button type="button" onclick={()=>onclose?.()} aria-label="Close">×</button></header>
  <p>Fetch product information from the exact parent checklist. Review every field before applying it to Setbound.</p>
  <button class="primary" type="button" onclick={lookup} disabled={loading||saving}>{loading?'Checking source…':'Check parent release and details'}</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if details}
   <div class="result"><strong>Matched: {dateInfo.archiveName||product.name}</strong><a href={details.sourceUrl} target="_blank" rel="noopener noreferrer">View source ↗</a></div>
   <label class="choice"><input type="checkbox" bind:checked={useDate} disabled={!dateInfo.releaseDate||!!dateInfo.existingDate}/> Release date: {dateInfo.releaseDate||'Not found'} {dateInfo.existingDate?'(already saved)':''}</label>
   <h3>Product description</h3>
   {#if overview}
    <label class="choice"><input type="checkbox" bind:checked={useOverview} disabled={!!details.existingOverview}/> Save description {details.existingOverview?'(existing description preserved)':''}</label>
    <textarea value={overview} readonly aria-label="Source product description" />
    <p class="hint">Source excerpt for review, not manufacturer-verified marketing copy. Edit descriptions further on the product page.</p>
   {:else}<p>No usable description was found.</p>{/if}
   <h3>Box contents and specifications</h3>
   {#if !Object.keys(details.formats||{}).length}<p>No structured box comparison found. Nothing will be invented.</p>{/if}
   {#each Object.entries(details.formats||{}) as [key,lines]}
    <label class="format"><span class="choice"><input type="checkbox" checked={selected.includes(key)} disabled={!!details.existingFormats?.[key]&&!details.existingFormats[key].startsWith('Listed as a ')} onchange={e=>toggle(key,e.currentTarget.checked)}/> <strong>{key.replaceAll('_',' ')} {details.existingFormats?.[key]&&!details.existingFormats[key].startsWith('Listed as a ')?'(already saved)':''}</strong></span><span>{lines.join(' · ')}</span></label>
   {/each}
   <h3>Product image candidates</h3>
   {#if details.hasImage}<p>Existing product artwork is preserved.</p>
   {:else if !details.images?.length}<p>No source image candidate detected. You can still upload artwork manually from Manage Sets.</p>
   {:else}
    <p class="hint">These are images referenced by the source page. They may be card images, banners, or generic artwork, not sealed boxes. Select only a verified product image.</p>
    <div class="images">{#each details.images as url}<label class="image"><input type="radio" name="source-image" checked={image===url} onchange={()=>image=url}/><img src={url} alt="Source image candidate" loading="lazy"/></label>{/each}</div>
    <button class="secondary" type="button" onclick={()=>image=''}>Don't use an image</button>
   {/if}
   <button class="primary" type="button" onclick={save} disabled={saving||!(useDate||(useOverview&&overview)||selected.length||image)}>{saving?'Saving…':'Approve selected metadata'}</button>
  {/if}
 </section>
</div>
<style>
.shade{position:fixed;inset:0;background:#0009;z-index:1200;display:grid;place-items:center;padding:1rem}.panel{width:min(820px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:1rem;padding:1.5rem;display:grid;gap:.9rem}.panel header{display:flex;align-items:start;justify-content:space-between}.panel h2{margin:0}.panel h3{margin:.5rem 0 0}.panel p{margin:0;color:#666;font-size:.85rem}.panel header button{border:0;background:transparent;font-size:1.4rem;cursor:pointer}.primary,.secondary{border:0;border-radius:.55rem;background:#161616;color:#fff;padding:.75rem 1rem;font:inherit;font-weight:800;cursor:pointer}.secondary{background:#eee;color:#222}.primary:disabled{opacity:.45}.choice{display:flex;align-items:center;gap:.5rem;font-size:.85rem}.choice input,.image input{accent-color:#161616}.result{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.85rem}.result a{color:#056aa7}.panel .error{color:#a32420}.panel .hint{font-size:.75rem}.panel textarea{width:100%;min-height:90px;padding:.7rem;border:1px solid #ccc;border-radius:.5rem;font:inherit}.format{display:grid;gap:.3rem;border:1px solid #ddd;border-radius:.5rem;padding:.7rem;font-size:.8rem}.format>span:last-child{color:#555}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.image{border:1px solid #ddd;padding:.5rem;border-radius:.5rem;display:grid;gap:.4rem}.image img{width:100%;height:125px;object-fit:contain}@media(max-width:600px){.images{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
