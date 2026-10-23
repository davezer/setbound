<script>
  import { goto } from '$app/navigation';
  import { productDisplayTitle } from '$lib/product-display.js';
  let { data } = $props();
  let selected = $state(data.products.map(p => p.slug));
  let productQuery = $state('');
  let query = $state('');
  let mode = $state(['combined','side','team','break'].includes(data.initialView) ? data.initialView : 'break');
  let team = $state('All teams');
  let tag = $state('All cards');
  let copied = $state(false);
  let showPicker = $state(false);
  let displayedLimit = $state(250);
  function normalizeTeam(value) {
    const raw = String(value || '').trim();
    if (/^angels$/i.test(raw) || /^la angels$/i.test(raw)) return 'Los Angeles Angels';
    return raw || 'Unassigned';
  }
  function title(product) { return productDisplayTitle(product.name, product.year); }
  const normalizedCards = $derived(data.cards.map(card => ({...card, team_name: normalizeTeam(card.team_name)})));
  const productById = $derived(new Map(data.catalog.map(p => [Number(p.id), p])));
  const productBySlug = $derived(new Map(data.catalog.map(p => [p.slug, p])));
  const chosen = $derived(selected.map(slug => productBySlug.get(slug)).filter(Boolean));
  const options = $derived(data.catalog.filter(p => !selected.includes(p.slug) && `${p.year} ${p.name} ${p.sport_name} ${p.manufacturer_name}`.toLowerCase().includes(productQuery.toLowerCase())).slice(0,60));
  const teams = $derived([...new Set(normalizedCards.map(c => c.team_name).filter(Boolean))].sort((a,b) => a.localeCompare(b)));
  const searchable = $derived(normalizedCards.filter(c => {
    const text = `${c.card_number} ${c.subject_name} ${c.checklist_name} ${c.team_name} ${productById.get(Number(c.product_id))?.name || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) &&
      (tag === 'All cards' || (tag === 'Autographs' && c.autograph) ||
      (tag === 'Memorabilia' && c.memorabilia) || (tag === 'Rookies' && c.rookie) ||
      (tag === 'Numbered' && c.serial_number));
  }));
  const filtered = $derived(searchable.filter(c => team === 'All teams' || c.team_name === team));
  const perProduct = $derived.by(() => {
    const grouped = new Map(chosen.map(p => [Number(p.id), []]));
    for (const card of filtered) grouped.get(Number(card.product_id))?.push(card);
    return chosen.map(p => ({...p, cards: grouped.get(Number(p.id)) || []}));
  });
  const summary = $derived.by(() => {
    const counts = new Map();
    for (const card of searchable) counts.set(card.team_name, (counts.get(card.team_name) || 0) + 1);
    return [...counts].map(([name,count]) => ({name,count})).sort((a,b) => a.name.localeCompare(b.name));
  });
  function href(slugs = selected, view = mode) {
    const params = new URLSearchParams();
    for (const slug of slugs) params.append('set', slug);
    params.set('view', view);
    return `/mixer?${params.toString()}`;
  }
  async function setProducts(slugs) {
    selected = slugs;
    team = 'All teams';
    displayedLimit = 250;
    await goto(href(slugs), {keepFocus:true, noScroll:true});
  }
  function add(slug) { if (selected.length < data.maxProducts && !selected.includes(slug)) setProducts([...selected, slug]); productQuery=''; showPicker=false; }
  function switchMode(next) { mode=next; history.replaceState(history.state,'',href(selected,next)); displayedLimit=250; }
  async function share() {
    const link = location.origin + href();
    try { await navigator.clipboard.writeText(link); copied=true; }
    catch { prompt('Copy your mixer link:',link); }
  }
  const preview = $derived(filtered.slice(0, displayedLimit));
  function flags(c) {
    return [c.rookie ? 'RC' : '',c.autograph ? 'AUTO' : '',c.memorabilia ? 'MEM' : '',c.serial_number ? `/${c.serial_number}` : ''].filter(Boolean).join(' · ');
  }
</script>
<svelte:head>
  <title>Checklist Mixer & Break Mode | Setbound</title>
  <meta name="description" content="Combine trading card checklists, compare products side by side, or search every team in a mixed-product break." />
  <meta name="robots" content="noindex,follow" />
</svelte:head>
<section class="shell mixer">
  <div class="heading"><div><div class="eyebrow">Breaker's workspace</div><h1>Checklist Mixer</h1><p>One workspace for every product in your break. No account needed. Read-only checklists.</p></div><button class="share" onclick={share} disabled={!selected.length}>{copied?'Link copied ✓':'Share mixer ↗'}</button></div>
  <div class="picker">
    <div class="picker-top"><strong>Products in this mixer <span>{selected.length}/{data.maxProducts}</span></strong><button onclick={() => showPicker = !showPicker} disabled={selected.length>=data.maxProducts}>{showPicker?'Close picker':'＋ Add a product'}</button></div>
    <div class="chips">
      {#each chosen as product (product.id)}
        <span class="chip">{title(product)}<button aria-label={`Remove ${product.name}`} onclick={() => setProducts(selected.filter(x => x !== product.slug))}>×</button></span>
      {/each}
      {#if !selected.length}<p class="hint">Add two or more products to build your mixer. You can start with just one.</p>{/if}
    </div>
    {#if showPicker}
      <div class="product-picker"><input class="input" bind:value={productQuery} placeholder="Search year, product, sport, manufacturer…" aria-label="Find a release" />
        <div class="results">{#each options as p (p.id)}<button onclick={() => add(p.slug)}><span>{title(p)}</span><small>{p.sport_name} · {Number(p.card_count).toLocaleString()} cards</small></button>{/each}{#if !options.length}<p>No published releases match.</p>{/if}</div>
      </div>
    {/if}
  </div>
  <div class="modes" aria-label="Mixer view">
    {#each [{key:'break',name:'Break mode'},{key:'combined',name:'Combined'},{key:'side',name:'Side by side'},{key:'team',name:'By team'}] as item}
      <button class:active={mode === item.key} onclick={() => switchMode(item.key)}>{item.name}</button>
    {/each}
  </div>
  {#if selected.length}
    {#if data.truncated}<p class="warning">Large mixer: only the first {data.cards.length.toLocaleString()} cards were loaded. Reduce your product selection for complete results.</p>{/if}
    <div class="filters"><label>Search all products<input class="input" bind:value={query} placeholder="Player, checklist, card number…" /></label><label>Team / affiliation<select class="input" bind:value={team} onchange={() => displayedLimit = 250}><option>All teams</option>{#each teams as name}<option>{name}</option>{/each}</select></label><label>Card type<select class="input" bind:value={tag}>{#each ['All cards','Autographs','Memorabilia','Rookies','Numbered'] as t}<option>{t}</option>{/each}</select></label></div>
    {#if mode === 'break'}
      <section class="break-head"><div><div class="eyebrow">Live break mode</div><h2>{team === 'All teams' ? 'Every team. Every product.' : team}</h2><p>{filtered.length.toLocaleString()} matching cards across {chosen.length} products</p></div><div class="break-count">{filtered.length.toLocaleString()}<small>matching cards</small></div></section>
      {#if team === 'All teams'}<div class="team-grid">{#each summary as t}<button onclick={() => {team=t.name;displayedLimit=250}}><strong>{t.name}</strong><span>{t.count}</span></button>{/each}</div>{/if}
      {#if team !== 'All teams'}
      <div class="product-groups">{#each perProduct as p (p.id)}<details open><summary><strong>{title(p)}</strong><span>{p.cards.length} cards</span></summary><div class="rows">{#each p.cards.slice(0,displayedLimit) as c (c.id)}<div class="card-row"><b>#{c.card_number}</b><span>{c.subject_name}<small>{c.checklist_name} · {c.team_name}</small></span><em>{flags(c)}</em></div>{/each}{#if p.cards.length > displayedLimit}<small>Showing first {displayedLimit} matching cards in this product</small>{/if}</div></details>{/each}</div>
      {:else}<p class="hint">Choose a team above to see its cards grouped by product. This keeps large mixers fast and easy to browse.</p>{/if}
    {:else if mode === 'side'}
      <p class="hint">Compare products independently. On small screens, columns scroll horizontally.</p><div class="side-grid">{#each perProduct as p (p.id)}<div class="side-col"><h3>{title(p)} <small>{p.cards.length} cards</small></h3>{#each p.cards.slice(0,displayedLimit) as c (c.id)}<div class="side-card"><b>#{c.card_number}</b> {c.subject_name}<small>{c.checklist_name} · {c.team_name} · {flags(c)}</small></div>{/each}</div>{/each}</div>
    {:else if mode === 'team'}
      <div class="team-grid">{#each summary as t}<button onclick={() => {team=t.name;switchMode('break')}}><strong>{t.name}</strong><span>{t.count} cards ↗</span></button>{/each}</div>
    {:else}
      <div class="table-wrap"><table><thead><tr><th>Card #</th><th>Subject</th><th>Team / affiliation</th><th>Product</th><th>Checklist</th><th>Tags</th></tr></thead><tbody>{#each preview as c (c.id)}<tr><td>{c.card_number}</td><td><strong>{c.subject_name}</strong></td><td>{c.team_name}</td><td>{productById.get(Number(c.product_id)) ? title(productById.get(Number(c.product_id))) : ''}</td><td>{c.checklist_name}</td><td>{flags(c)}</td></tr>{/each}</tbody></table></div>
    {/if}
    {#if (mode === 'combined' && filtered.length > displayedLimit) || ((mode === 'side' || (mode === 'break' && team !== 'All teams')) && perProduct.some(p => p.cards.length > displayedLimit))}<button class="more" onclick={() => displayedLimit += 250}>Show 250 more cards</button>{/if}
    {#if !filtered.length}<p class="empty">No matching cards with these filters.</p>{/if}
  {:else}<div class="empty"><strong>Build your first mixer.</strong><p>Click “Add a product,” select a release, and start combining checklists.</p></div>{/if}
</section>
<style>
.mixer{padding-top:3rem;padding-bottom:6rem}.heading{display:flex;align-items:end;justify-content:space-between;gap:2rem;margin-bottom:1.6rem}.heading h1{font-family:var(--display);font-size:clamp(2.6rem,6vw,5rem);letter-spacing:-.06em;margin:.25rem 0}.heading p,.hint{color:var(--muted);font-size:.83rem}.share,.picker button,.modes button,.more{cursor:pointer;font:inherit;font-weight:800}.share{background:var(--orange);color:#fff;border:0;border-radius:.6rem;padding:.8rem 1rem;white-space:nowrap}.share:disabled{opacity:.5}.picker{border:1px solid var(--line-strong);border-radius:.9rem;padding:1rem;margin-bottom:1rem}.picker-top{display:flex;justify-content:space-between;align-items:center;gap:1rem}.picker-top strong{font-size:.86rem}.picker-top strong span{color:var(--muted)}.picker-top>button{padding:.55rem .8rem;border:1px solid var(--line-strong);background:var(--soft);border-radius:.5rem}.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.8rem}.chip{background:var(--soft);border:1px solid var(--line);border-radius:.5rem;padding:.45rem .65rem;font-size:.77rem;font-weight:700}.chip button{border:0;background:transparent;margin-left:.5rem;font-size:1.1rem;color:var(--muted)}.product-picker{margin-top:.8rem}.results{max-height:260px;overflow:auto;border:1px solid var(--line);margin-top:.5rem}.results button{width:100%;display:flex;justify-content:space-between;gap:1rem;text-align:left;border:0;border-bottom:1px solid var(--line);background:#fff;padding:.65rem}.results button:hover{background:var(--soft)}.results small{color:var(--muted)}.modes{display:flex;flex-wrap:wrap;gap:.35rem;border-bottom:1px solid var(--line);padding-bottom:1rem}.modes button{border:1px solid var(--line-strong);border-radius:.5rem;background:#fff;padding:.6rem .85rem;font-size:.8rem}.modes button.active{background:var(--ink);color:#fff;border-color:var(--ink)}.filters{display:grid;grid-template-columns:1.6fr 1fr .8fr;gap:.75rem;margin:1.2rem 0}.filters label{min-width:0}.break-head{background:var(--ink);color:#fff;border-radius:.9rem;padding:1.4rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}.break-head .eyebrow{color:#9DC9E5}.break-head h2{font-size:clamp(1.4rem,3vw,2.4rem);margin:.3rem 0}.break-head p{font-size:.8rem;opacity:.8}.break-count{font-size:2.2rem;font-weight:800;text-align:right}.break-count small{display:block;font-size:.68rem;font-weight:500}.team-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5rem;margin:1rem 0}.team-grid button{display:flex;justify-content:space-between;gap:.3rem;text-align:left;border:1px solid var(--line);background:#fff;border-radius:.5rem;padding:.75rem;cursor:pointer}.team-grid span{color:var(--blue);font-size:.7rem}.product-groups{display:grid;gap:.75rem;margin:1rem 0}.product-groups details{border:1px solid var(--line);border-radius:.65rem;overflow:hidden}.product-groups summary{display:flex;justify-content:space-between;gap:1rem;cursor:pointer;background:var(--soft);padding:.9rem}.product-groups summary span{color:var(--muted);font-size:.75rem}.rows{padding:0 .85rem}.card-row{display:grid;grid-template-columns:80px 1fr auto;gap:.8rem;padding:.65rem 0;border-bottom:1px solid var(--line);font-size:.8rem}.card-row small,.side-card small{display:block;color:var(--muted);font-size:.68rem;margin-top:.15rem}.card-row em{font-style:normal;color:var(--blue);font-size:.7rem}.side-grid{display:flex;gap:.8rem;overflow:auto;margin:1rem 0}.side-col{min-width:290px;flex:1;border:1px solid var(--line);border-radius:.6rem;padding:.8rem}.side-col h3{font-size:.9rem}.side-col h3 small{display:block;font-weight:400;color:var(--muted)}.side-card{padding:.5rem 0;border-bottom:1px solid var(--line);font-size:.77rem}.table-wrap{margin:1rem 0}.table-wrap table{min-width:900px}.table-wrap td{font-size:.75rem}.more{display:block;margin:1rem auto;padding:.7rem 1rem;background:var(--soft);border:1px solid var(--line-strong);border-radius:.5rem}.empty{padding:3rem;text-align:center;background:var(--soft);border-radius:.7rem}.warning{background:#fff4df;padding:.8rem;border-radius:.5rem;font-size:.75rem}@media(max-width:900px){.team-grid{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr 1fr}.filters label:first-child{grid-column:span 2}}@media(max-width:560px){.heading{align-items:start;flex-direction:column}.team-grid{grid-template-columns:1fr}.filters{grid-template-columns:1fr}.filters label:first-child{grid-column:auto}.card-row{grid-template-columns:60px 1fr}.card-row em{grid-column:2}}
</style>
