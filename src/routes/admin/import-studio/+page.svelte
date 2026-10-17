<script>
  import { enhance } from '$app/forms';
  import StudioSourceIntake from '$lib/components/StudioSourceIntake.svelte';
  import { invalidateAll } from '$app/navigation';
  let { data, form } = $props();
  let search = $state('');
  let year = $state('All years');
  let manufacturer = $state('All manufacturers');
  let status = $state('All');
  let activeId = $state(null);
  let saving = $state(false);
  let savedMessage = $state('');

  const years = $derived(['All years', ...new Set(data.products.map(p => String(p.year)))]);
  const manufacturers = $derived(['All manufacturers', ...new Set(data.products.map(p => p.manufacturer_name))]);
  const visible = $derived(data.products.filter(p => {
    const q = search.toLowerCase().trim();
    const config = p.formats.some(f => f.details?.trim());
    const completeness = Number(p.card_count) > 0 && config && !!p.image_key && !!p.release_date;
    return (!q || `${p.year} ${p.name} ${p.sport_name} ${p.manufacturer_name}`.toLowerCase().includes(q)) &&
      (year === 'All years' || String(p.year) === year) &&
      (manufacturer === 'All manufacturers' || p.manufacturer_name === manufacturer) &&
      (status === 'All' || (status === 'Facts complete' && completeness) ||
        (status === 'Needs facts' && !config) ||
        (status === 'Needs checklist' && Number(p.card_count) === 0));
  }));
  const selected = $derived(data.products.find(p => p.id === activeId) || null);
  const countFormats = (p) => p.formats.filter(f => f.details?.trim()).length;
</script>

<svelte:head><title>Import Studio — Setbound</title></svelte:head>
<section class="shell studio">
  <header class="hero">
    <div><div class="eyebrow">Admin / Data acquisition</div><h1>Import Studio</h1><p>One inventory of releases. Checklists first, configurations second, no generated overview required.</p></div>
    <a href="/admin">← Admin</a>
  </header>
  <div class="workflow" aria-label="Ingestion workflow">
    <a href="/admin/source-harvester"><strong>01 · Legacy harvester</strong><span>Old workflow available</span></a>
    <a href="/admin/import"><strong>02 · Manual checklist</strong><span>PDF, XLS, XLSX fallback</span></a>
    <a href="/admin/affiliations"><strong>03 · Resolve</strong><span>Teams and aliases</span></a>
    <a href="/admin/sets"><strong>04 · Publish</strong><span>Existing set management</span></a>
  </div>
  <StudioSourceIntake products={data.products} affiliations={data.affiliations} />
  <div class="intro"><h2>Imported product ledger</h2><p>These are the existing D1 products. No reimports, migrations, or speculative matches.</p></div>
  <div class="metrics">
    <div><strong>{data.products.length}</strong><span>Imported products</span></div>
    <div><strong>{data.products.filter(p=>Number(p.card_count)>0).length}</strong><span>With cards</span></div>
    <div><strong>{data.products.filter(p=>countFormats(p)>0).length}</strong><span>With configurations</span></div>
    <div><strong>{data.products.filter(p=>Number(p.cached_launch_count)>0).length}</strong><span>Cached Topps candidates*</span></div>
  </div>
  <p class="note">*A cached candidate is not proof of a correct product match. Existing cache entries are retained for review, never automatically trusted or deleted.</p>
  <div class="filters">
    <label><span>Find product</span><input bind:value={search} placeholder="Name, year, sport…" /></label>
    <label><span>Year</span><select bind:value={year}>{#each years as item}<option>{item}</option>{/each}</select></label>
    <label><span>Manufacturer</span><select bind:value={manufacturer}>{#each manufacturers as item}<option>{item}</option>{/each}</select></label>
    <label><span>Completeness</span><select bind:value={status}><option>All</option><option>Facts complete</option><option>Needs facts</option><option>Needs checklist</option></select></label>
  </div>
  <div class="results">{visible.length} of {data.products.length} products</div>
  <div class="ledger">
    {#each visible as product (product.id)}
      <article>
        <div class="identity"><span class="meta">{product.year} · {product.manufacturer_name} · {product.sport_name}</span><strong>{product.name}</strong>
          <span class="detail">{Number(product.card_count).toLocaleString()} cards · {product.checklist_count} checklists</span></div>
        <div class="signals">
          <span class:yes={Number(product.card_count)>0}>{Number(product.card_count)>0 ? 'Checklist ✓' : 'Checklist missing'}</span>
          <span class:yes={countFormats(product)>0}>{countFormats(product)} configurations</span>
          <span class:yes={!!product.release_date}>{product.release_date || 'Date missing'}</span>
          <span class:yes={!!product.image_key}>{product.image_key ? 'Art ✓' : 'Art missing'}</span>
        </div>
        <div class="actions"><button onclick={()=>{activeId=product.id;savedMessage='';}}>Edit facts</button><a href={`/admin/product/${product.id}`}>Full details ↗</a></div>
      </article>
    {/each}
    {#if !visible.length}<p class="empty">No matching products.</p>{/if}
  </div>
</section>
{#if selected}
  <div class="scrim" role="presentation" onclick={(event)=>{if(event.target===event.currentTarget)activeId=null;}}>
    <section class="panel" role="dialog" aria-modal="true" aria-label="Edit product facts" tabindex="-1">
      <div class="panel-head"><div><span class="meta">Product facts</span><h2>{selected.year} {selected.name}</h2><p>Only factual fields. Existing descriptions and artwork remain unchanged.</p></div><button type="button" onclick={()=>activeId=null} aria-label="Close">×</button></div>
      <form method="POST" action="?/saveFacts" use:enhance={()=>{
        saving=true;savedMessage='';
        return async ({result, update})=>{
          saving=false;
          if(result.type==='success') { await invalidateAll(); savedMessage='Saved. Product facts updated.'; }
          else savedMessage=result.data?.message || 'Could not save product facts.';
          await update({reset:false,invalidateAll:false});
        };
      }}>
        <input type="hidden" name="product_id" value={selected.id}/>
        <label class="date"><span>Release date</span><input type="date" name="release_date" value={selected.release_date || ''}/></label>
        <h3>Product configurations</h3>
        <p>Use manufacturer-confirmed facts only. Leave unknown configurations blank.</p>
        {#each data.formatFields as field}
          <label><span>{field.label}</span><textarea rows="3" name={`format_${field.key}`} value={selected.formats.find(f=>f.format_key===field.key)?.details || ''}></textarea></label>
        {/each}
        {#if savedMessage}<p class="save-message">{savedMessage}</p>{/if}
        <div class="panel-actions"><button type="button" onclick={()=>activeId=null}>Cancel</button><button class="primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save facts'}</button></div>
      </form>
    </section>
  </div>
{/if}
<style>
  .studio{padding:3rem 0 5rem}.hero{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:1.6rem}.hero h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.3rem 0}.hero p,.intro p,.note{color:var(--muted)}.hero a{font-size:.78rem;color:var(--blue)}.workflow{display:grid;grid-template-columns:repeat(4,1fr);gap:.65rem;margin:1.2rem 0 2.5rem}.workflow a{border:1px solid var(--line);border-radius:.7rem;padding:1rem;text-decoration:none;color:inherit;display:grid;gap:.45rem}.workflow strong{font-size:.8rem}.workflow span{font-size:.7rem;color:var(--muted)}.intro h2{margin-bottom:.2rem}.intro p{margin-top:0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem}.metrics>div{border:1px solid var(--line);border-radius:.7rem;padding:1rem;display:grid;gap:.25rem}.metrics strong{font-size:1.7rem}.metrics span,.note{font-size:.72rem}.filters{display:grid;grid-template-columns:2fr repeat(3,1fr);gap:.7rem;margin-top:1.5rem;padding:1rem 0;border-block:1px solid var(--line)}label{display:grid;gap:.35rem}label>span,.meta{font-size:.65rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:800}input,select,textarea{font:inherit;padding:.65rem;border:1px solid var(--line-strong);border-radius:.5rem;background:white;width:100%;color:inherit}.results{padding:.8rem 0;font-size:.73rem;color:var(--muted)}.ledger article{display:grid;grid-template-columns:minmax(200px,1fr) minmax(280px,1.25fr) auto;gap:1rem;padding:1rem .2rem;border-top:1px solid var(--line);align-items:center}.identity{display:grid;gap:.25rem}.identity strong{font-size:.85rem}.detail{font-size:.72rem;color:var(--muted)}.signals{display:flex;flex-wrap:wrap;gap:.35rem}.signals span{font-size:.65rem;border:1px solid var(--line);border-radius:99px;padding:.25rem .45rem;color:var(--muted)}.signals .yes{border-color:#b8d6c5;color:#276644;background:#f0f8f2}.actions{display:flex;align-items:center;gap:.45rem}.actions button,.actions a,.panel button{padding:.6rem .75rem;border:1px solid var(--line-strong);background:white;border-radius:.5rem;text-decoration:none;font:inherit;font-size:.73rem;color:inherit;cursor:pointer;white-space:nowrap}.empty{padding:2rem;color:var(--muted)}.scrim{position:fixed;inset:0;background:#0008;z-index:100;display:flex;justify-content:flex-end}.panel{width:min(650px,100%);height:100%;background:white;overflow:auto;padding:1.5rem;box-shadow:-15px 0 50px #0002}.panel-head{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1rem}.panel-head h2{font-size:1.5rem;margin:.3rem 0}.panel-head p,.panel form>p{font-size:.78rem;color:var(--muted)}.panel form{display:grid;gap:1rem}.panel h3{margin:1rem 0 0}.panel-actions{position:sticky;bottom:0;background:white;padding:1rem 0;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:.5rem}.panel .primary{background:#171717;color:white}.save-message{color:#276644!important}@media(max-width:1000px){.workflow,.metrics{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:repeat(2,1fr)}.ledger article{grid-template-columns:1fr}.actions{justify-content:flex-start}}@media(max-width:580px){.workflow,.metrics,.filters{grid-template-columns:1fr}}
</style>
