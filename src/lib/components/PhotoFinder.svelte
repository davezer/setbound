<script>
  let {product,onclose,onapplied} = $props();
  let url = $state('');
  let busy = $state(false);
  let error = $state('');
  let checked = $state(false);
  let imageError = $state(false);
  const q = [product.year,product.name,product.manufacturer_name, 'hobby box product image'].filter(Boolean).join(' ');
  const sources = [
    {name:'Topps',domain:'topps.com'},
    {name:'Checklist Insider',domain:'checklistinsider.com'},
    {name:'Cardsmiths',domain:'cardsmithsbreaks.com'},
    {name:'Panini',domain:'paniniamerica.net'},
    {name:'General images',domain:''}
  ];
  function searchLink(domain){return 'https://www.google.com/search?tbm=isch&q='+encodeURIComponent((domain?'site:'+domain+' ':'')+q);}
  function setUrl(next){url=next;checked=false;imageError=false;error='';}
  const recognized = $derived(/^https://[^s]+/i.test(url));
  async function save(){
    if(busy || !checked || !recognized)return;
    busy=true;error='';
    try{
      const response=await fetch('/api/admin/products/photo-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:product.id,imageUrl:url})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.message || 'Image import failed.');
      onapplied?.(result);
    }catch(e){error=e.message||'Could not save image.';}finally{busy=false;}
  }
</script>
<svelte:head><title>Find set photo — Setbound</title></svelte:head>
<div class="photo-overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget&&!busy)onclose?.()}}>
  <div class="photo-dialog" role="dialog" aria-modal="true" aria-label="Find set photo" tabindex="-1">
    <div class="photo-head"><div><span>IMAGE REVIEW</span><h2>Find product photo</h2><p>{product.year} {product.name}</p></div><button type="button" onclick={()=>onclose?.()} disabled={busy} aria-label="Close">✕</button></div>
    <p class="photo-note">Search the source sites in a new tab. Pick an <strong>unwatermarked, correctly matched product image</strong>, open the image itself and paste its direct HTTPS URL below. Images remain unchanged until you approve.</p>
    <div class="photo-searches">
      {#each sources as source}
        <a href={searchLink(source.domain)} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>
      {/each}
    </div>
    <label class="photo-label" for="setbound-photo-url">Direct image URL</label>
    <input id="setbound-photo-url" type="url" value={url} oninput={e=>setUrl(e.currentTarget.value)} placeholder="https://…/box-image.jpg" />
    {#if recognized}
      <div class="photo-preview"><img src={url} alt="Candidate product photo" onerror={()=>imageError=true} onload={()=>imageError=false} referrerpolicy="no-referrer" /></div>
      {#if imageError}<p class="photo-error">This image cannot be previewed in your browser. Use the existing manual upload instead.</p>{/if}
      <label class="photo-confirm"><input type="checkbox" bind:checked={checked} disabled={imageError} /> I verified the set, photo quality, watermark, and permission to use this image.</label>
    {/if}
    {#if error}<p class="photo-error" role="alert">{error}</p>{/if}
    <div class="photo-actions"><button type="button" class="quiet" onclick={()=>onclose?.()} disabled={busy}>Cancel</button><button type="button" onclick={save} disabled={!checked||!recognized||imageError||busy}>{busy?'Saving…':'Approve & save photo'}</button></div>
    <small>Some sites block hotlinking or imports. In that case, download an authorized image and use the existing “Add image” upload instead. Search results and image rights aren't automatically verified.</small>
  </div>
</div>
<style>
.photo-overlay{position:fixed;inset:0;z-index:3000;background:rgba(12,20,28,.65);display:grid;place-items:center;padding:1rem}.photo-dialog{width:min(680px,100%);max-height:94vh;overflow:auto;background:#fff;color:#16232a;border-radius:1rem;padding:1.4rem;box-shadow:0 18px 80px #0003}.photo-head{display:flex;justify-content:space-between;gap:1rem}.photo-head span{font-size:.65rem;font-weight:800;letter-spacing:.12em;color:#64717a}.photo-head h2{margin:.25rem 0;font-size:1.5rem}.photo-head p{margin:.2rem 0;color:#596873}.photo-head button{align-self:start;border:0;background:#f2f3f4;padding:.5rem;cursor:pointer;border-radius:.4rem}.photo-note{font-size:.82rem;line-height:1.55;color:#485963}.photo-searches{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}.photo-searches a{border:1px solid #cbd4d9;padding:.55rem .65rem;border-radius:.45rem;color:#152a36;text-decoration:none;font-size:.75rem;font-weight:700}.photo-label{display:block;font-size:.72rem;font-weight:800;margin:1rem 0 .3rem}.photo-dialog input[type=url]{width:100%;box-sizing:border-box;padding:.7rem;border-radius:.5rem;border:1px solid #b6c3cc;font:inherit}.photo-preview{display:grid;place-items:center;background:#f5f6f7;border:1px solid #d6dde2;border-radius:.6rem;margin:.8rem 0;min-height:130px;max-height:300px;overflow:hidden}.photo-preview img{max-height:280px;max-width:100%;object-fit:contain}.photo-confirm{display:flex;gap:.5rem;align-items:start;font-size:.76rem;line-height:1.4}.photo-confirm input{margin-top:.15rem}.photo-actions{display:flex;gap:.6rem;justify-content:flex-end;margin:1rem 0}.photo-actions button{background:#142820;color:#fff;padding:.65rem .85rem;border:0;border-radius:.5rem;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700}.photo-actions button.quiet{background:#edf0f2;color:#15212c}.photo-actions button:disabled{opacity:.5;cursor:not-allowed}.photo-error{color:#ad3025;font-size:.77rem}.photo-dialog small{display:block;color:#5d6e78;font-size:.68rem;line-height:1.4}
</style>
