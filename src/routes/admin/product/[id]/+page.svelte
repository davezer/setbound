<script>
  let { data, form } = $props();
  let releaseDate = $state(data.product.release_date || '');
  let overview = $state(data.product.product_notes || '');
  let formatValues = $state(Object.fromEntries(data.formats.map(format => [format.key, format.details || ''])));
  let enrichmentBusy = $state(false);
  let enrichmentMessage = $state('');
  let imageUrl = $state('');

  async function autoFillDetails() {
    enrichmentBusy = true; enrichmentMessage = '';
    try {
      const response = await fetch(`/api/admin/products/${data.product.id}/enrich-draft`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not build enrichment draft.');
      const draft = result.enrichment;
      if (draft.releaseDate) releaseDate = draft.releaseDate;
      if (draft.overview) overview = draft.overview;
      for (const format of draft.formats || []) {
        if (format?.key && format?.details) formatValues[format.key] = format.details;
      }
      enrichmentMessage = 'Details filled from source. Review them, then save metadata.';
    } catch (error) { enrichmentMessage = error?.message || 'Could not build enrichment draft.'; }
    finally { enrichmentBusy = false; }
  }
</script>

<svelte:head><title>Edit {data.product.name} — setbound admin</title></svelte:head>

<section class="shell page">
  <div class="crumb"><a href="/admin">Admin</a><span>/</span><a href="/admin/sets">Sets</a></div>
  <div class="eyebrow">{data.product.sport_name} · {data.product.manufacturer_name} · {data.product.year}</div>
  <h1>{data.product.name}</h1>
  <p class="lede">Only fill in the sections that apply to this product. Empty sections never appear on the public set page.</p>
  {#if form?.message}<div class="error">{form.message}</div>{/if}

  <section class="section artwork-section">
    <div class="section-title"><div class="eyebrow">Artwork</div><h2>Product image from URL</h2><p>Paste a direct image URL. Setbound downloads it and stores a copy in R2. No AI or research calls.</p></div>
    {#if data.product.image_key}
      <div class="current-art"><img src={`/media/set/${data.product.slug}?v=${encodeURIComponent(data.product.image_key)}`} alt="Current product artwork"/><span>Current product image</span></div>
    {:else}<p class="art-note">No artwork saved for this product yet.</p>{/if}
    {#if form?.imageError}<p class="error" role="alert">{form.imageError}</p>{/if}
    {#if data.imageSaved}<p class="success" role="status">Image saved to R2 successfully.</p>{/if}
    <form method="POST" action="?/imageUrl" class="image-form">
      <label for="product-image-url">Direct image URL (JPG, PNG, WEBP or AVIF)</label>
      <div class="image-input-row">
        <input id="product-image-url" class="input" name="image_url" type="url" placeholder="https://example.com/product-box.jpg" bind:value={imageUrl} required maxlength="2048" />
        <button type="submit">Save image to R2</button>
      </div>
      <p class="art-note">Max 8 MB · HTTPS only · Saving replaces the current product image, not its metadata. Only use images you have permission to display.</p>
    </form>
  </section>

  <form method="POST" action="?/saveMetadata" class="editor">
    <section class="section">
      <div class="section-title"><div class="eyebrow">Basics</div><h2>Product info</h2></div>
      <div class="autofill-row"><button class="auto-fill" type="button" onclick={autoFillDetails} disabled={enrichmentBusy}>{enrichmentBusy ? 'Finding details…' : 'Auto-fill from source'}</button>{#if enrichmentMessage}<span>{enrichmentMessage}</span>{/if}</div>
      <label>Release date<input class="input" name="release_date" type="date" bind:value={releaseDate}/></label>
      <label>Overview<textarea name="product_notes" placeholder="Short collector-facing description of the product." bind:value={overview}></textarea></label>
    </section>
    <section class="section">
      <div class="section-title"><div class="eyebrow">Configurations</div><h2>Box & pack breakdowns</h2><p>These render as the clean fact sections under the product hero.</p></div>
      <div class="format-grid">
        {#each data.formats as format}
          <label class="format-field"><span>{format.label}</span><textarea name={`format_${format.key}`} placeholder={`Optional — add ${format.label.toLowerCase()} details…`} value={formatValues[format.key] || ''} oninput={(event) => formatValues[format.key] = event.currentTarget.value}></textarea></label>
        {/each}
      </div>
    </section>
    <div class="save-row"><button>Save metadata</button><a href={`/admin/sets/preview/${encodeURIComponent(data.product.slug)}`} target="_blank" rel="noreferrer">Preview set ↗</a></div>
  </form>
</section>

<style>
  .page{padding-top:3rem;padding-bottom:6rem}
  .crumb{display:flex;gap:.45rem;color:var(--muted);font-size:.76rem;margin-bottom:2rem}.crumb a{color:inherit}
  h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.4rem 0 .65rem}
  .lede{max-width:720px;margin:0 0 2rem;color:var(--muted);line-height:1.55}
  .editor{max-width:1100px;display:grid;gap:2.5rem}.section{display:grid;gap:1.1rem;padding-top:1.2rem;border-top:1px solid var(--line)}
  .section-title h2{margin:.25rem 0 0;font-size:1.35rem}.section-title p{margin:.35rem 0 0;color:var(--muted);font-size:.78rem}
  label{display:grid;gap:.4rem;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
  textarea{min-height:110px;border:1px solid var(--line-strong);border-radius:.7rem;padding:.8rem;font:inherit;resize:vertical;text-transform:none;letter-spacing:0;font-weight:500;line-height:1.5}
  .format-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.format-field textarea{min-height:130px}
  .autofill-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.autofill-row span{font-size:.72rem;color:var(--muted)}.auto-fill{width:max-content;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.6rem .75rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.auto-fill:disabled{opacity:.55;cursor:not-allowed}
  .save-row{display:flex;align-items:center;gap:1rem}.save-row button,.image-input-row button{border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.75rem 1rem;font:inherit;font-weight:850;cursor:pointer;white-space:nowrap}
  .save-row a{color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}.error{margin-bottom:1rem;padding:.8rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem}
  .artwork-section{max-width:1100px;margin-bottom:2.5rem}.current-art{display:flex;gap:1rem;align-items:center}.current-art img{width:180px;max-height:140px;object-fit:contain;background:#f7f7f7;border:1px solid var(--line);border-radius:.6rem}.current-art span,.art-note{color:var(--muted);font-size:.74rem}.image-form{display:grid;gap:.5rem}.image-input-row{display:flex;gap:.65rem}.image-input-row input{flex:1;min-width:0}.input{border:1px solid var(--line-strong);border-radius:.6rem;padding:.7rem;font:inherit}.success{color:#276644;font-size:.8rem}
  @media(max-width:760px){.format-grid{grid-template-columns:1fr}.image-input-row{flex-direction:column}.current-art{align-items:flex-start;flex-direction:column}}
</style>
