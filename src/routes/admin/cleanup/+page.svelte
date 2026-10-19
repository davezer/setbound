<script>
  let { data } = $props();

  let setQuery = $state('');
  let setPickerOpen = $state(false);
  let query = $state('');
  let checklistFilter = $state('all');
  let tagFilter = $state('all');
  let page = $state(1);
  let deleting = $state(null);
  let deletingImport = $state(false);
  let message = $state('');
  const PAGE_SIZE = 100;

  const selectedLabel = $derived(data.product
    ? `${data.product.year} ${data.product.name}`
    : 'Choose an imported set');

  const matchingSets = $derived.by(() => {
    const terms = setQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return data.products.filter((product) => {
      const haystack = `${product.year} ${product.manufacturer_name} ${product.name} ${product.card_count}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  });

  const visible = $derived.by(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return data.cards.filter((card) => {
      if (checklistFilter !== 'all' && String(card.checklist_id) !== checklistFilter) return false;
      if (tagFilter === 'rookie' && !card.rookie) return false;
      if (tagFilter === 'autograph' && !card.autograph) return false;
      if (tagFilter === 'memorabilia' && !card.memorabilia) return false;
      if (tagFilter === 'nil' && card.affiliation_name !== 'NIL') return false;
      const haystack = `${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.checklist_name}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  });

  const pageCount = $derived(Math.max(1, Math.ceil(visible.length / PAGE_SIZE)));
  const safePage = $derived(Math.min(page, pageCount));
  const pageRows = $derived(visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE));
  const firstRow = $derived(visible.length ? (safePage - 1) * PAGE_SIZE + 1 : 0);
  const lastRow = $derived(Math.min(safePage * PAGE_SIZE, visible.length));

  function resetRowFilters() {
    query = '';
    checklistFilter = 'all';
    tagFilter = 'all';
    page = 1;
  }

  function selectSet(slug) {
    setPickerOpen = false;
    if (slug === data.selectedSlug) return;
    location.href = slug ? `/admin/cleanup?set=${encodeURIComponent(slug)}` : '/admin/cleanup';
  }

  async function deleteCard(card) {
    const label = `${card.card_number} ${card.subject_name}`;
    if (!confirm(`Delete ${label}?\n\nThis permanently removes this row from the checklist.`)) return;
    deleting = card.id;
    message = '';
    try {
      const response = await fetch(`/api/admin/cards/${card.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Delete failed.');
      location.reload();
    } catch (error) {
      message = error?.message || 'Delete failed.';
      deleting = null;
    }
  }

  async function deleteEntireImport() {
    if (!data.product) return;
    const label = `${data.product.year} ${data.product.name}`;
    if (!confirm(
      `DELETE ENTIRE IMPORT?\n\n${label}\n\n` +
      `This permanently removes the product, every checklist, every card row, checklist details, source record, and uploaded artwork for this set.\n\n` +
      `This cannot be undone.`
    )) return;
    deletingImport = true;
    message = '';
    try {
      const response = await fetch(`/api/admin/products/${data.product.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not delete import.');
      location.href = '/admin/cleanup';
    } catch (error) {
      message = error?.message || 'Could not delete import.';
      deletingImport = false;
    }
  }
</script>

<svelte:head>
  <title>Clean imported rows — Setbound</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section class="shell page">
  <div class="topline">
    <div>
      <div class="eyebrow">Admin / Data management</div>
      <h1>Clean imported rows</h1>
      <p>Find a set quickly, inspect its cards, and remove incorrect records.</p>
    </div>
    <a class="back" href="/admin">← Admin</a>
  </div>

  <section class="set-picker" aria-label="Choose a set">
    <div class="picker-heading">
      <div>
        <div class="eyebrow">Selected set</div>
        <strong>{selectedLabel}</strong>
        {#if data.product}<small>{data.cards.length.toLocaleString()} loaded cards · {data.checklists.length} checklists</small>{/if}
      </div>
      {#if data.product}<a href="/admin/cleanup">Clear selection</a>{/if}
    </div>
    <label class="search-label" for="set-search">Find another set</label>
    <div class="set-search-row">
      <input
        id="set-search"
        class="input"
        type="search"
        autocomplete="off"
        placeholder="Search year, manufacturer, set name…"
        bind:value={setQuery}
        onfocus={() => setPickerOpen = true}
        oninput={() => setPickerOpen = true}
        onkeydown={(event) => { if (event.key === 'Escape') setPickerOpen = false; if (event.key === 'Enter' && matchingSets.length === 1) selectSet(matchingSets[0].slug); }}
      />
      <button class="picker-toggle" type="button" aria-expanded={setPickerOpen} aria-controls="matching-sets" onclick={() => setPickerOpen = !setPickerOpen}>{setPickerOpen ? 'Close' : 'Browse sets'}</button>
    </div>
    {#if setPickerOpen}
      <div class="matches" id="matching-sets">
        <div class="matches-heading">{matchingSets.length.toLocaleString()} matching sets {#if matchingSets.length > 40}· showing first 40, type to narrow{/if}</div>
        {#each matchingSets.slice(0, 40) as product (product.id)}
          <button class:selected={product.slug === data.selectedSlug} class="set-result" type="button" onclick={() => selectSet(product.slug)}>
            <span><strong>{product.name}</strong><small>{product.year} · {product.manufacturer_name}</small></span>
            <span class="result-count">{Number(product.card_count || 0).toLocaleString()} cards</span>
          </button>
        {:else}
          <div class="no-results">No matching sets. Try fewer words.</div>
        {/each}
      </div>
    {/if}
  </section>

  {#if message}<div class="error" role="alert">{message}</div>{/if}

  {#if data.product}
    <section class="review-section">
      <div class="review-top">
        <div>
          <div class="eyebrow">Checklist review</div>
          <h2>{data.product.name}</h2>
          <p>{visible.length.toLocaleString()} matching rows out of {data.cards.length.toLocaleString()} loaded</p>
        </div>
        <a class="preview-link" href={`/admin/sets/preview/${encodeURIComponent(data.product.slug)}`} target="_blank" rel="noreferrer">Preview set ↗</a>
      </div>
      <div class="row-filters">
        <label class="search-field"><span>Search cards</span><input class="input" type="search" placeholder="Card #, subject, team, checklist…" bind:value={query} oninput={() => page = 1} /></label>
        <label><span>Checklist</span><select class="input" bind:value={checklistFilter} onchange={() => page = 1}><option value="all">All checklists ({data.checklists.length})</option>{#each data.checklists as cl (cl.id)}<option value={String(cl.id)}>{cl.name} ({cl.card_count})</option>{/each}</select></label>
        <label><span>Card type</span><select class="input" bind:value={tagFilter} onchange={() => page = 1}><option value="all">All cards</option><option value="rookie">Rookies</option><option value="autograph">Autographs</option><option value="memorabilia">Memorabilia</option><option value="nil">No affiliation (NIL)</option></select></label>
        <button class="reset" type="button" onclick={resetRowFilters}>Reset</button>
      </div>
      <div class="table-toolbar">
        <span>Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {visible.length.toLocaleString()} cards</span>
        <div class="pages"><button disabled={safePage <= 1} onclick={() => page = safePage - 1}>← Previous</button><span>Page {safePage} / {pageCount}</span><button disabled={safePage >= pageCount} onclick={() => page = safePage + 1}>Next →</button></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Subject</th><th>Affiliation</th><th>Checklist</th><th>Tags</th><th></th></tr></thead>
          <tbody>
            {#each pageRows as card (card.id)}
              <tr>
                <td class="number">{card.card_number}</td>
                <td><strong>{card.subject_name}</strong></td>
                <td class:muted={card.affiliation_name === 'NIL'}>{card.affiliation_name}</td>
                <td>{card.checklist_name}</td>
                <td class="tags">{#if card.rookie}<span>RC</span>{/if}{#if card.autograph}<span>AU</span>{/if}{#if card.memorabilia}<span>MEM</span>{/if}{#if card.serial_number}<span>/{card.serial_number}</span>{/if}</td>
                <td class="actions"><button disabled={deleting === card.id} onclick={() => deleteCard(card)}>{deleting === card.id ? 'Deleting…' : 'Delete'}</button></td>
              </tr>
            {:else}
              <tr><td colspan="6" class="no-results">No matching cards. Try resetting filters.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="table-toolbar bottom-toolbar"><span>{visible.length.toLocaleString()} results · 100 rows per page</span><div class="pages"><button disabled={safePage <= 1} onclick={() => page = safePage - 1}>← Previous</button><span>{safePage} / {pageCount}</span><button disabled={safePage >= pageCount} onclick={() => page = safePage + 1}>Next →</button></div></div>
    </section>

    <details class="danger-zone">
      <summary>Danger zone · Delete entire import</summary>
      <div class="danger-body"><div><h2>Delete entire import</h2><p>Remove <strong>{data.product.year} {data.product.name}</strong> and every imported checklist and card. This cannot be undone.</p></div><button class="delete-import" disabled={deletingImport} onclick={deleteEntireImport}>{deletingImport ? 'Deleting…' : 'Delete entire import'}</button></div>
    </details>
  {:else}
    <div class="empty-state">Search above to choose an imported set and inspect its cards.</div>
  {/if}
</section>

<style>
  .page{padding-top:3rem;padding-bottom:5rem}.topline{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem;margin-bottom:1.8rem}.topline h1{font-size:clamp(2.2rem,5vw,4rem);letter-spacing:-.055em;margin:.35rem 0 .45rem}.topline p{margin:0;color:var(--muted)}.back{font-size:.78rem;font-weight:800;text-decoration:none;color:var(--blue);margin-top:.5rem}
  .eyebrow{font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;font-weight:900;color:var(--blue)}.set-picker{border:1px solid var(--line);border-radius:.9rem;padding:1.2rem;background:#fff}.picker-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}.picker-heading>div{display:grid;gap:.25rem}.picker-heading strong{font-size:1.12rem}.picker-heading small{font-size:.72rem;color:var(--muted)}.picker-heading a{font-size:.73rem;font-weight:800;color:var(--blue)}.search-label,.row-filters label span{display:block;font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:var(--muted);margin-bottom:.35rem}.input{width:100%;min-width:0;border:1px solid var(--line-strong);border-radius:.65rem;padding:.75rem .85rem;background:#fff;color:inherit;font:inherit;font-size:.83rem}.input:focus{outline:2px solid var(--blue);outline-offset:1px}.set-search-row{display:flex;gap:.6rem}.set-search-row .input{flex:1}.picker-toggle,.reset{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.65rem .85rem;font:inherit;font-size:.74rem;font-weight:850;white-space:nowrap;cursor:pointer}.matches{margin-top:.65rem;max-height:360px;overflow-y:auto;border:1px solid var(--line);border-radius:.65rem}.matches-heading{padding:.65rem .8rem;background:#fafafa;color:var(--muted);font-size:.72rem;border-bottom:1px solid var(--line)}.set-result{display:flex;align-items:center;justify-content:space-between;gap:1rem;width:100%;padding:.75rem .85rem;border:0;border-bottom:1px solid var(--line);background:white;color:inherit;font:inherit;text-align:left;cursor:pointer}.set-result:hover,.set-result.selected{background:#f3f6f7}.set-result>span:first-child{display:grid;gap:.15rem}.set-result strong{font-size:.8rem}.set-result small{font-size:.69rem;color:var(--muted)}.result-count{font-size:.7rem;color:var(--muted);white-space:nowrap}.no-results{text-align:center;color:var(--muted);padding:1.4rem;font-size:.78rem}
  .review-section{margin-top:2rem}.review-top{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem}.review-top h2{font-size:1.5rem;margin:.3rem 0;letter-spacing:-.035em}.review-top p{margin:0;color:var(--muted);font-size:.76rem}.preview-link{display:inline-flex;padding:.65rem .9rem;text-decoration:none;border:1px solid var(--line-strong);border-radius:.6rem;color:var(--blue);font-size:.75rem;font-weight:850;white-space:nowrap}.row-filters{display:grid;grid-template-columns:minmax(200px,1.5fr) minmax(170px,1.2fr) minmax(130px,.75fr) auto;align-items:end;gap:.7rem;padding:1rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.row-filters label{min-width:0}.row-filters .reset{height:43px}.table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 0;font-size:.74rem;color:var(--muted)}.pages{display:flex;align-items:center;gap:.7rem}.pages button{border:1px solid var(--line-strong);border-radius:.5rem;padding:.45rem .6rem;background:#fff;font:inherit;font-weight:800;cursor:pointer}.pages button:disabled{opacity:.4;cursor:not-allowed}.table-wrap{border:1px solid var(--line);border-radius:.8rem;overflow:auto;background:#fff}table{width:100%;border-collapse:collapse;min-width:850px}th,td{padding:.75rem .85rem;border-bottom:1px solid var(--line);text-align:left}th{font-size:.64rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);background:#fafafa}td{font-size:.79rem}.number{font-weight:850}.muted{color:var(--muted)}.tags{white-space:nowrap}.tags span{display:inline-block;padding:.16rem .3rem;margin:.1rem;background:#f2f1ef;border-radius:.3rem;font-size:.62rem;font-weight:850}.actions{text-align:right}.actions button{border:1px solid #e5b7b1;background:#fff8f7;color:#8c3028;border-radius:.55rem;padding:.45rem .65rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.actions button:disabled{opacity:.5;cursor:not-allowed}
  .danger-zone{margin:2.2rem 0;border:1px solid #e6b2ab;border-radius:.8rem;background:#fff9f8}.danger-zone summary{padding:.9rem 1rem;color:#9b3d32;font-size:.78rem;font-weight:850;cursor:pointer}.danger-body{display:flex;align-items:center;justify-content:space-between;gap:2rem;border-top:1px solid #edd0cb;padding:1.2rem}.danger-body h2{font-size:1.1rem;margin:0 0 .3rem}.danger-body p{color:var(--muted);font-size:.78rem;margin:0;line-height:1.5}.delete-import{flex:0 0 auto;border:1px solid #c75d53;background:#a53b32;color:white;border-radius:.6rem;padding:.65rem .85rem;font:inherit;font-size:.73rem;font-weight:850;cursor:pointer}.delete-import:disabled{opacity:.5}.empty-state{text-align:center;color:var(--muted);padding:3rem 1rem;border:1px dashed var(--line-strong);border-radius:.9rem;margin-top:1.4rem}.error{margin-top:1rem;padding:.8rem 1rem;background:#fff4ea;border:1px solid #f4c89f;border-radius:.7rem}
  @media(max-width:900px){.row-filters{grid-template-columns:1fr 1fr}.row-filters .reset{justify-self:start}}@media(max-width:640px){.topline,.review-top,.picker-heading{align-items:flex-start;flex-direction:column}.set-search-row{flex-direction:column}.row-filters{grid-template-columns:1fr}.table-toolbar{flex-wrap:wrap}.danger-body{align-items:flex-start;flex-direction:column}}
</style>
