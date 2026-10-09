<script>
  import { getOwned, setOwned } from '$lib/client/collection.js';
  let { data } = $props();

  let active = $state('All');
  let query = $state('');
  let team = $state('All teams');
  let owned = $state(new Set());
  let checklistBrowserOpen = $state(false);
  let checklistQuery = $state('');
  let scrollY = $state(0);

  $effect(()=>{ owned = getOwned(); });

  const teams = $derived([
    'All teams',
    ...[...new Set(data.cards.map((c)=>c.affiliation_name))].sort((a,b)=>a.localeCompare(b))
  ]);

  const activeChecklist = $derived(active === 'All' ? null : data.checklists.find((c)=>c.name===active));

  const filteredChecklists = $derived(data.checklists.filter((c) =>
    !checklistQuery || c.name.toLowerCase().includes(checklistQuery.toLowerCase())
  ));

  const visible = $derived(data.cards.filter((c) =>
    (active==='All'||c.checklist_name===active) &&
    (team==='All teams'||c.affiliation_name===team) &&
    (!query || `${c.card_number} ${c.subject_name} ${c.affiliation_name} ${c.checklist_name}`.toLowerCase().includes(query.toLowerCase()))
  ));

  const visibleGroups = $derived.by(() => {
    const byChecklist = new Map();
    for (const card of visible) {
      if (!byChecklist.has(card.checklist_name)) byChecklist.set(card.checklist_name, []);
      byChecklist.get(card.checklist_name).push(card);
    }

    const checklistOrder = new Map(data.checklists.map((checklist, index) => [checklist.name, index]));
    return [...byChecklist.entries()]
      .sort(([a], [b]) => (checklistOrder.get(a) ?? 9999) - (checklistOrder.get(b) ?? 9999))
      .map(([name, cards]) => ({
        name,
        cards,
        checklist: data.checklists.find((checklist) => checklist.name === name)
      }));
  });

  const ownedCount = $derived(data.cards.filter((c)=>owned.has(String(c.id))).length);

  function chooseChecklist(name){
    active = name;
    checklistBrowserOpen = false;
    checklistQuery = '';
  }

  function toggle(id){
    const next=new Set(owned);
    const key=String(id);
    next.has(key)?next.delete(key):next.add(key);
    owned=next;
    setOwned(next);
  }
</script>

<svelte:head><title>{data.product.year} {data.product.name} — setbound</title></svelte:head>
<svelte:window bind:scrollY />

<section class="shell page">
  <div class="crumb"><a href="/sets">Sets</a><span>/</span>{data.product.year} {data.product.name}</div>

  <div class="heading">
    <div>
      <div class="eyebrow">{data.product.manufacturer_name} · {data.product.sport_name}</div>
      <h1>{data.product.year} {data.product.name}</h1>
      <p>{data.cards.length.toLocaleString()} indexed cards across {data.checklists.length} checklists.</p>
    </div>
    <div class="progress">
      <strong>{ownedCount} / {data.cards.length}</strong>
      <span>in this browser</span>
      <i><b style={`width:${data.cards.length ? ownedCount/data.cards.length*100 : 0}%`}></b></i>
    </div>
  </div>

  <div class="filters">
    <label class="search-filter">
      <span>Search</span>
      <input class="input" bind:value={query} placeholder="Player, card number, team, checklist…"/>
    </label>
    <label class="team-filter">
      <span>Team</span>
      <select class="input" bind:value={team}>{#each teams as t}<option>{t}</option>{/each}</select>
    </label>
  </div>

  <div class="checklist-nav">
    <button class="checklist-current" onclick={()=>checklistBrowserOpen=true} aria-label="Browse checklists">
      <span class="checklist-kicker">Checklist</span>
      <span class="checklist-title">{active === 'All' ? 'All checklists' : active}</span>
      <span class="checklist-meta">
        {active === 'All'
          ? `${data.checklists.length} sections · ${data.cards.length.toLocaleString()} cards`
          : `${(activeChecklist?.card_count_declared || activeChecklist?.card_count || 0).toLocaleString()} cards`}
      </span>
    </button>

    <div class="checklist-actions">
      {#if active!=='All'}
        <button class="text-action" onclick={()=>active='All'}>Show all</button>
      {/if}
      <button class="browse-checklists" onclick={()=>checklistBrowserOpen=true}>
        <span>Browse {data.checklists.length} checklists</span>
        <span class="browse-icon" aria-hidden="true">⌘</span>
      </button>
    </div>
  </div>

  {#if checklistBrowserOpen}
    <div class="browser-scrim" role="presentation" onclick={(e)=>{ if(e.currentTarget===e.target) checklistBrowserOpen=false; }}>
      <aside class="checklist-browser" aria-label="Checklist browser">
        <div class="browser-head">
          <div>
            <div class="eyebrow">Browse product</div>
            <h2>Choose a checklist</h2>
            <p>{data.checklists.length} sections in {data.product.year} {data.product.name}</p>
          </div>
          <button class="browser-close" onclick={()=>checklistBrowserOpen=false} aria-label="Close checklist browser">×</button>
        </div>

        <div class="browser-search">
          <span aria-hidden="true">⌕</span>
          <input bind:value={checklistQuery} placeholder="Search checklist names…" autofocus />
        </div>

        <div class="browser-list">
          <button class:active={active==='All'} onclick={()=>chooseChecklist('All')}>
            <span class="browser-name">All checklists</span>
            <span class="browser-count">{data.cards.length.toLocaleString()}</span>
          </button>

          {#each filteredChecklists as c}
            <button class:active={active===c.name} onclick={()=>chooseChecklist(c.name)}>
              <span class="browser-name">{c.name}</span>
              <span class="browser-count">{c.card_count.toLocaleString()}</span>
            </button>
          {/each}

          {#if filteredChecklists.length===0}
            <div class="browser-empty">No checklists match “{checklistQuery}”.</div>
          {/if}
        </div>
      </aside>
    </div>
  {/if}

  {#if activeChecklist}
    <section class="checklist-details">
      <div class="details-heading">
        <div>
          <div class="eyebrow">Checklist details</div>
          <h2>{activeChecklist.name}</h2>
        </div>
        <strong>{activeChecklist.card_count_declared || activeChecklist.card_count} cards</strong>
      </div>

      {#if activeChecklist.parallels?.length}
        <div class="parallel-block">
          <h3>Parallels</h3>
          <div class="parallel-list">
            {#each activeChecklist.parallels as parallel}
              <div>{parallel}</div>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeChecklist.notes?.length}
        <div class="notes-list">{#each activeChecklist.notes as note}<p>{note}</p>{/each}</div>
      {/if}
    </section>
  {/if}

  <div class="results-line">
    <span>{visible.length.toLocaleString()} card{visible.length===1?'':'s'}</span>
    {#if team!=='All teams'}<button onclick={()=>team='All teams'}>Clear team filter ×</button>{/if}
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th class="own">Have</th><th>#</th><th>Subject</th><th>Affiliation</th><th>Tags</th></tr></thead>
      {#each visibleGroups as group}
        <tbody class="checklist-group">
          {#if active === 'All'}
            <tr class="checklist-group-heading">
              <td colspan="5">
                <button onclick={()=>chooseChecklist(group.name)} aria-label={`Open ${group.name}`}>
                  <span class="group-copy">
                    <strong>{group.name}</strong>
                    <small>
                      {group.cards.length.toLocaleString()} matching card{group.cards.length===1?'':'s'}
                      {#if group.checklist?.card_count}
                        <span>· {group.checklist.card_count.toLocaleString()} total</span>
                      {/if}
                    </small>
                  </span>
                  <span class="group-open">View checklist →</span>
                </button>
              </td>
            </tr>
          {/if}
          {#each group.cards as card}
            <tr>
              <td class="own"><button class:checked={owned.has(String(card.id))} onclick={()=>toggle(card.id)} aria-label="Toggle owned">{owned.has(String(card.id))?'✓':''}</button></td>
              <td class="number">{card.card_number}</td>
              <td><strong>{card.subject_name}</strong></td>
              <td class:muted={card.affiliation_name==='NIL'}>{card.affiliation_name}</td>
              <td><div class="tags">{#if card.rookie}<span>RC</span>{/if}{#if card.autograph}<span>AU</span>{/if}{#if card.memorabilia}<span>MEM</span>{/if}{#if card.serial_number}<span>/{card.serial_number}</span>{/if}</div></td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  </div>

  {#if data.product.original_filename || data.product.source_url}
    <div class="source">
      <div><div class="eyebrow">Source</div><strong>{data.product.original_filename || 'Official checklist'}</strong></div>
      <span>Imported {data.product.imported_at ? new Date(data.product.imported_at).toLocaleDateString() : '—'}</span>
    </div>
  {/if}
</section>

{#if scrollY > 520}
  <button class="back-to-top" onclick={()=>window.scrollTo({top:0,behavior:'smooth'})} aria-label="Back to top">
    <span class="back-arrow">↑</span>
    <span>Back to top</span>
  </button>
{/if}

<style>
.page{padding-top:3rem}.crumb{display:flex;gap:.55rem;color:var(--muted);font-size:.8rem;font-weight:700}.crumb a{text-decoration:none}.heading{display:flex;justify-content:space-between;align-items:end;gap:2rem;margin:2.2rem 0}.heading h1{font-size:clamp(2.3rem,5vw,4.6rem);letter-spacing:-.06em;line-height:.95;margin:.45rem 0 .7rem}.heading p{color:var(--muted);margin:0}.progress{min-width:220px}.progress strong,.progress span{display:block}.progress strong{font-size:1.25rem}.progress span{color:var(--muted);font-size:.75rem;margin-top:.15rem}.progress i{display:block;height:5px;background:var(--soft);border-radius:5px;margin-top:.8rem;overflow:hidden}.progress b{display:block;height:100%;background:var(--orange)}
.filters{display:grid;grid-template-columns:1fr 260px;gap:.75rem;margin-bottom:.8rem}.filters label{display:grid;gap:.35rem}.filters label>span{font-size:.68rem;font-weight:850;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
.checklist-nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:.2rem 0 1.05rem;padding:.9rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.checklist-current{display:grid;grid-template-columns:auto auto;grid-template-areas:'kicker kicker' 'title meta';column-gap:.8rem;row-gap:.15rem;align-items:baseline;min-width:0;border:0;background:transparent;text-align:left;padding:0;cursor:pointer}.checklist-kicker{grid-area:kicker;font-size:.66rem;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:var(--blue)}.checklist-title{grid-area:title;max-width:min(760px,58vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.05rem;font-weight:900;letter-spacing:-.015em}.checklist-meta{grid-area:meta;color:var(--muted);font-size:.76rem;white-space:nowrap}.checklist-actions{display:flex;align-items:center;gap:.9rem;flex:none}.text-action{border:0;background:transparent;color:var(--blue);font-size:.74rem;font-weight:850;cursor:pointer}.browse-checklists{display:flex;align-items:center;gap:.75rem;border:1px solid var(--line-strong);background:#fff;border-radius:999px;padding:.65rem .8rem .65rem 1rem;font-size:.75rem;font-weight:850;cursor:pointer;transition:border-color .16s ease,transform .16s ease}.browse-checklists:hover{border-color:var(--ink);transform:translateY(-1px)}.browse-icon{display:grid;place-items:center;width:1.6rem;height:1.6rem;border-radius:50%;background:var(--ink);color:#fff;font-size:.68rem}.browser-scrim{position:fixed;inset:0;z-index:80;background:rgba(18,16,14,.34);backdrop-filter:blur(4px);display:flex;justify-content:flex-end}.checklist-browser{width:min(520px,92vw);height:100%;background:var(--paper,#fcfcfc);box-shadow:-22px 0 60px rgba(18,16,14,.16);display:flex;flex-direction:column;padding:1.45rem 1.35rem 1.2rem;animation:browser-in .18s ease-out}.browser-head{display:flex;justify-content:space-between;gap:1rem;padding:.2rem .1rem 1rem;border-bottom:1px solid var(--line)}.browser-head h2{font-size:1.7rem;letter-spacing:-.035em;margin:.3rem 0 .25rem}.browser-head p{margin:0;color:var(--muted);font-size:.78rem}.browser-close{border:1px solid var(--line);background:#fff;border-radius:50%;width:2rem;height:2rem;font-size:1.15rem;line-height:1;cursor:pointer}.browser-search{display:flex;align-items:center;gap:.6rem;margin:1rem 0 .65rem;padding:.72rem .85rem;border:1px solid var(--line-strong);border-radius:.75rem;background:#fff}.browser-search span{font-size:1.1rem;color:var(--muted)}.browser-search input{width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:.86rem}.browser-list{overflow:auto;padding-right:.2rem}.browser-list>button{width:100%;display:grid;grid-template-columns:1fr auto;align-items:center;gap:1rem;border:0;border-bottom:1px solid var(--line);background:transparent;padding:.82rem .35rem;text-align:left;cursor:pointer;position:relative}.browser-list>button:hover{background:rgba(64,121,140,.055)}.browser-list>button.active{background:rgba(64,121,140,.075)}.browser-list>button.active:before{content:'';position:absolute;left:0;top:.55rem;bottom:.55rem;width:3px;border-radius:3px;background:var(--blue)}.browser-name{font-size:.82rem;font-weight:800;line-height:1.25;padding-left:.25rem}.browser-count{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums}.browser-empty{padding:2rem .4rem;color:var(--muted);font-size:.82rem}.back-to-top{position:fixed;right:12px;bottom:18px;z-index:60;display:flex;align-items:center;gap:.48rem;border:1px solid var(--line-strong);background:rgba(252,252,252,.94);backdrop-filter:blur(8px);border-radius:999px;padding:.38rem .7rem .38rem .4rem;box-shadow:0 8px 28px rgba(18,16,14,.12);font-size:.68rem;font-weight:900;color:var(--ink);cursor:pointer}.back-arrow{display:grid;place-items:center;width:1.5rem;height:1.5rem;border-radius:50%;background:var(--ink);color:#fff;font-size:.9rem}@keyframes browser-in{from{transform:translateX(24px);opacity:.7}to{transform:translateX(0);opacity:1}}
.checklist-details{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:1.35rem 0;margin:.25rem 0 1rem}.details-heading{display:flex;align-items:end;justify-content:space-between;gap:1rem}.details-heading h2{font-size:1.45rem;margin:.3rem 0 0}.details-heading>strong{font-size:.8rem;color:var(--muted)}.parallel-block{margin-top:1.2rem}.parallel-block h3{font-size:.76rem;text-transform:uppercase;letter-spacing:.1em;margin:0 0 .65rem}.parallel-list{columns:2;column-gap:2rem}.parallel-list div{break-inside:avoid;font-size:.84rem;line-height:1.45;padding:.24rem 0;color:#302d2a}.notes-list p{font-size:.84rem;color:var(--muted);margin:.4rem 0}.results-line{display:flex;justify-content:space-between;align-items:center;margin:.4rem 0 .65rem;font-size:.75rem;color:var(--muted)}.results-line button{border:0;background:transparent;color:var(--blue);font:inherit;font-weight:800;cursor:pointer}
.checklist-group-heading td{padding:0;border-top:14px solid var(--paper,#fcfcfc);border-bottom:1px solid var(--line);background:rgba(64,121,140,.055)}.checklist-group:first-of-type .checklist-group-heading td{border-top-width:0}.checklist-group-heading button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:1rem;border:0;background:transparent;padding:.78rem 1rem;text-align:left;cursor:pointer;color:var(--ink)}.checklist-group-heading button:hover{background:rgba(64,121,140,.07)}.group-copy{display:flex;align-items:baseline;gap:.65rem;min-width:0}.group-copy strong{font-size:.78rem;font-weight:900;letter-spacing:.025em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.group-copy small{font-size:.69rem;color:var(--muted);white-space:nowrap}.group-open{font-size:.69rem;font-weight:850;color:var(--blue);white-space:nowrap}
.own{width:58px;text-align:center}.own button{width:1.45rem;height:1.45rem;border:1px solid var(--line-strong);background:white;border-radius:.35rem;cursor:pointer;color:white;font-weight:900}.own button.checked{background:var(--blue);border-color:var(--blue)}.number{font-variant-numeric:tabular-nums;font-weight:800}.tags{display:flex;gap:.3rem}.tags span{font-size:.68rem;font-weight:900;padding:.25rem .4rem;border-radius:.3rem;background:var(--soft)}.source{margin-top:1.2rem;border-top:1px solid var(--line);padding-top:1.2rem;display:flex;justify-content:space-between;align-items:end;gap:1rem}.source span{font-size:.78rem;color:var(--muted)}
@media(max-width:800px){.parallel-list{columns:1}.checklist-title{max-width:52vw}}@media(max-width:700px){.group-copy{align-items:flex-start;flex-direction:column;gap:.1rem}.group-copy small{white-space:normal}.group-open{display:none}.heading{align-items:flex-start;flex-direction:column}.progress{width:100%}.filters{grid-template-columns:1fr}.checklist-nav{align-items:flex-start;flex-direction:column}.checklist-current{grid-template-columns:1fr;grid-template-areas:'kicker' 'title' 'meta'}.checklist-title{max-width:82vw;white-space:normal}.checklist-actions{width:100%;justify-content:space-between}.browse-checklists{margin-left:auto}.table-wrap{font-size:.85rem}th,td{padding:.7rem}.source{align-items:flex-start;flex-direction:column}.details-heading{align-items:flex-start;flex-direction:column}.back-to-top{right:8px;bottom:10px}.checklist-browser{width:100vw}}
</style>
