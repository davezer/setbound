<script>
  let { product, onclose, onapplied } = $props();
  let busy = $state(false);
  let applying = $state(false);
  let error = $state('');
  let warning = $state('');
  let draft = $state(null);
  let releaseDate = $state('');
  let overview = $state('');
  let formats = $state([]);
  let images = $state([]);
  let sources = $state([]);
  let selectedImage = $state('');
  let applyReleaseDate = $state(false);
  let applyOverview = $state(false);
  let applyFormats = $state(false);
  let applyImage = $state(false);

  async function research() {
    busy=true; error=''; warning=''; draft=null;
    try {
      const response=await fetch('/api/admin/products/ai-research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:product.id})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Research failed.');
      loadDraft(result.enrichment);
      warning=result.warning||'';
    } catch(e) {error=e?.message||'Research failed.';} finally {busy=false;}
  }
  async function existingSources() {
    busy=true;error='';warning='';draft=null;
    try {
      const response=await fetch(`/api/admin/products/${product.id}/enrich-draft`);
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'No existing enrichment sources found.');
      loadDraft(result.enrichment);
    } catch(e){error=e?.message||'Could not retrieve existing sources.';}finally{busy=false;}
  }
  function loadDraft(value) {
    draft=value;
    releaseDate=value.releaseDate||product.release_date||'';
    overview=value.overview||'';
    formats=(value.formats||[]).map(x=>({...x}));
    images=value.images||[];
    sources=value.sources||[];
    selectedImage='';
    applyReleaseDate=Boolean(value.releaseDate);
    applyOverview=Boolean(value.overview);
    applyFormats=Boolean(formats.length);
    applyImage=false;
  }
  async function apply() {
    if(!draft)return;
    if(!confirm('Save only the selected enrichment fields to this product?'))return;
    applying=true;error='';
    try {
      const response=await fetch('/api/admin/source-harvester/apply-enrichment',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({productSlug:product.slug,releaseDate,overview,formats,imageUrl:selectedImage,
          applyReleaseDate,applyOverview,applyFormats,applyImage:applyImage&&Boolean(selectedImage)})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Could not save enrichment.');
      onapplied?.({result,releaseDate,overview,formats,selectedImage});onclose?.();
    }catch(e){error=e?.message||'Save failed.';}finally{applying=false;}
  }
</script>
<svelte:head><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="backdrop" role="presentation" onclick={(e)=>e.target===e.currentTarget&&onclose?.()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Research ${product.name}`}>
    <header><div><div class="eyebrow">Setbound research studio</div><h2>{product.name}</h2><p>AI searches the web for source-backed product details. Nothing saves without approval.</p></div><button class="close" type="button" onclick={()=>onclose?.()}>×</button></header>
    <div class="body">
      <div class="research-actions"><button type="button" class="primary" onclick={research} disabled={busy||applying}>{busy?'Researching…':'Research with AI'}</button><button type="button" class="secondary" onclick={existingSources} disabled={busy||applying}>Try existing sources</button></div>
      <p class="note">AI research uses OpenAI web search and may incur API charges. Source links and box specifications must be checked before approval.</p>
      {#if error}<div class="error" role="alert">{error}</div>{/if}
      {#if warning}<p class="note">{warning}</p>{/if}
      {#if busy}<div class="loading">Researching this exact release and verifying candidate artwork pages…</div>{/if}
      {#if draft}
        <section><label class="check"><input type="checkbox" bind:checked={applyReleaseDate}/> Release date</label><input class="input" type="date" bind:value={releaseDate}/></section>
        <section><label class="check"><input type="checkbox" bind:checked={applyOverview}/> Collector-facing overview</label><textarea bind:value={overview}></textarea></section>
        <section><label class="check"><input type="checkbox" bind:checked={applyFormats}/> Box configurations ({formats.length})</label>
          {#if !formats.length}<small>No sufficiently sourced box configurations were found.</small>{/if}
          <div class="format-grid">{#each formats as format,index}<label class="field"><span>{format.label}</span><textarea bind:value={formats[index].details}></textarea>{#if format.sourceUrl}<a target="_blank" rel="noopener noreferrer" href={format.sourceUrl}>Check evidence ↗</a>{/if}</label>{/each}</div>
        </section>
        <section><label class="check"><input type="checkbox" bind:checked={applyImage} disabled={!selectedImage}/> Product artwork ({images.length})</label>
          {#if !images.length}<small>No verified supported image URL was found. You can still upload artwork manually from Manage Sets.</small>{/if}
          <div class="images">{#each images as img}<label class:selected={selectedImage===img.url}><input type="radio" name="research-image" checked={selectedImage===img.url} onchange={()=>{selectedImage=img.url;applyImage=true;}}/><img src={img.url} alt="Product artwork candidate"/><a href={img.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a></label>{/each}</div>
        </section>
        <section><strong>Research sources</strong>{#each sources as source}<a href={source.url} rel="noopener noreferrer" target="_blank">{source.title} ↗</a>{/each}{#if !sources.length}<small>No qualifying research sources found. Do not apply speculative data.</small>{/if}</section>
      {/if}
    </div>
    <footer><span class="note">All fields are opt-in; draft previews remain unpublished.</span><div class="footer-actions"><button type="button" class="secondary" onclick={()=>onclose?.()}>Cancel</button><button type="button" class="primary" onclick={apply} disabled={!draft||applying||!(applyReleaseDate||applyOverview||applyFormats||applyImage)}>{applying?'Saving…':'Approve and save'}</button></div></footer>
  </div>
</div>
<style>
  .backdrop{position:fixed;inset:0;z-index:1000;background:rgba(18,18,18,.5);display:grid;place-items:center;padding:1rem}.modal{background:white;width:min(980px,98vw);max-height:94vh;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;border-radius:1rem;box-shadow:0 24px 80px #0003}header,footer{padding:1rem 1.3rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line)}footer{border-bottom:0;border-top:1px solid var(--line)}header h2{margin:.2rem 0;font-size:1.8rem}header p,.note{font-size:.75rem;color:var(--muted);line-height:1.45}header p{margin:0}.close{background:none;border:0;font-size:1.5rem;cursor:pointer}.body{overflow:auto;padding:1rem 1.3rem}.research-actions,.footer-actions{display:flex;gap:.5rem;flex-wrap:wrap}.primary,.secondary{border:1px solid var(--line-strong);background:#fff;border-radius:.5rem;padding:.65rem .9rem;font:inherit;font-size:.75rem;font-weight:800;cursor:pointer}.primary{background:var(--ink);color:white;border-color:var(--ink)}button:disabled{opacity:.5;cursor:not-allowed}section{display:grid;gap:.6rem;padding:1.1rem 0;border-bottom:1px solid var(--line)}.check{display:flex;align-items:center;gap:.5rem;font-weight:800;font-size:.8rem}.input,textarea{padding:.65rem;border:1px solid var(--line-strong);border-radius:.5rem;font:inherit}textarea{min-height:105px;resize:vertical}.format-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.field{display:grid;gap:.4rem}.field span{font-size:.75rem;font-weight:800}.field a,section>a,.images a{font-size:.73rem;color:var(--blue)}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem}.images label{position:relative;border:1px solid var(--line);border-radius:.55rem;padding:.5rem;display:grid;gap:.3rem;cursor:pointer}.images label.selected{outline:2px solid var(--blue)}.images img{width:100%;height:145px;object-fit:contain}.images input{position:absolute;top:.4rem;left:.4rem}.error{border:1px solid #f1beb9;background:#fff6f5;padding:.75rem;color:#8d3028}.loading{padding:3rem;text-align:center;color:var(--muted)}small{color:var(--muted)}@media(max-width:700px){.format-grid{grid-template-columns:1fr}.images{grid-template-columns:repeat(2,1fr)}footer{align-items:flex-start;flex-direction:column}}
</style>
