<script>
  import SearchBox from '$lib/components/SearchBox.svelte';

  let { data } = $props();

  const featured = $derived(data.recent?.[0] ?? {
    slug: '2026-topps-allen-ginter',
    year: 2026,
    name: 'Allen & Ginter',
    manufacturer_name: 'Topps',
    card_count: 300,
    checklist_count: 8
  });

  const previewRows = [
    { number:'17', player:'Shohei Ohtani', team:'Dodgers', status:'Collected' },
    { number:'99', player:'Aaron Judge', team:'Yankees', status:'Missing' },
    { number:'30', player:'Paul Skenes', team:'Pirates', status:'Collected' },
    { number:'118', player:'Elly De La Cruz', team:'Reds', status:'Missing' }
  ];
</script>

<svelte:head>
  <title>Setbound — Sports card checklists, cleanly organized</title>
  <meta name="description" content="Search clean, source-backed sports card checklists by set, player, team and card number." />
</svelte:head>

<section class="hero shell">
  <div class="hero-copy">
    <div class="eyebrow">Sports card checklists. Without the clutter.</div>
    <h1>Find the card.<br/><span>Track the set.</span></h1>
    <p class="lede">Clean, source-backed checklists across products, players and teams. Baseball first. Everything else next.</p>

    <div class="hero-search">
      <SearchBox large placeholder="Search sets, players, teams, products…" />
    </div>

    <div class="stats" aria-label="Setbound database statistics">
      <div><strong>{data.summary.products.toLocaleString()}</strong><span>products</span></div>
      <div><strong>{data.summary.cards.toLocaleString()}</strong><span>cards indexed</span></div>
      <div><strong>{data.summary.subjects.toLocaleString()}</strong><span>subjects</span></div>
    </div>
  </div>

  <div class="feature-wrap">
    <div class="brand-bars" aria-hidden="true">
      <i class="bar bar-black"></i>
      <i class="bar bar-orange"></i>
      <i class="bar bar-blue"></i>
      <i class="bar bar-gray"></i>
    </div>

    <div class="feature-panel">
      <div class="feature-topline">
        <div>
          <span class="micro">Featured set</span>
          <h2>{featured.year} {featured.name}</h2>
          <p>{featured.manufacturer_name} <b>·</b> Baseball <b>·</b> {featured.card_count || 0} cards</p>
        </div>
        <a href={`/sets/${featured.slug}`}>View set <span>→</span></a>
      </div>

      <div class="feature-toolbar">
        <div class="tabs">
          <strong>Checklist</strong>
          <span>Details</span>
          <span>Variants</span>
        </div>
        <div class="progress">
          <span>Progress <strong>42%</strong></span>
          <div><i></i></div>
        </div>
      </div>

      <div class="mini-filters">
        <div class="mini-search">⌕ <span>Search within this set…</span></div>
        <button>All types⌄</button>
        <button>All teams⌄</button>
      </div>

      <div class="preview-table">
        <div class="preview-head"><span>#</span><span>Player</span><span>Team</span><span>Status</span></div>
        {#each previewRows as row}
          <div class="preview-row">
            <span class="num">{row.number}</span>
            <strong>{row.player}</strong>
            <span>{row.team}</span>
            <span class:owned={row.status === 'Collected'} class="status">{row.status}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="browse-section">
  <div class="shell browse-grid">
    <div class="recent-block">
      <div class="section-head">
        <div>
          <div class="eyebrow">Browse</div>
          <h2>Recently added</h2>
        </div>
        <a href="/sets">View all sets →</a>
      </div>

      <div class="set-list">
        <div class="set-list-head">
          <span>Set</span><span>Year</span><span>Brand</span><span>Cards</span><span></span>
        </div>
        {#each data.recent as set}
          <a class="set-row" href={`/sets/${set.slug}`}>
            <span class="set-name"><i></i><strong>{set.name}</strong></span>
            <span>{set.year}</span>
            <span>{set.manufacturer_name}</span>
            <span>{set.card_count || 0}</span>
            <span class="arrow">→</span>
          </a>
        {/each}
        {#if !data.recent?.length}
          <div class="empty-row">No published sets yet. Import your first checklist to get started.</div>
        {/if}
      </div>

      {#if data.demo}
        <p class="demo-note">Preview data shown until D1 is connected and seeded.</p>
      {/if}
    </div>

    <aside class="collector-block">
      <div class="eyebrow">Built for collectors</div>
      <h2>More than checklists.<br/>A cleaner way to collect.</h2>
      <p>Search, explore and track sets with clean, organized data that keeps the original source attached.</p>

      <div class="features">
        <div>
          <span class="feature-icon">⌕</span>
          <strong>Powerful search</strong>
          <p>Find any card, player, team or set in seconds.</p>
        </div>
        <div>
          <span class="feature-icon list-icon">☷</span>
          <strong>Organized checklists</strong>
          <p>Clean sections and filters without the database clutter.</p>
        </div>
        <div>
          <span class="feature-icon">▥</span>
          <strong>Track progress</strong>
          <p>See what you have and what you still need.</p>
        </div>
      </div>
    </aside>
  </div>
</section>

<style>
  .hero {
    display:grid;
    grid-template-columns:minmax(0,.92fr) minmax(580px,1.08fr);
    gap:4.75rem;
    align-items:center;
    padding-top:5.4rem;
    padding-bottom:5.7rem;
  }

  .hero-copy { max-width:660px; }

  h1 {
    margin:.65rem 0 0;
    font-family:var(--display);
    font-size:clamp(4rem,6.25vw,6.75rem);
    line-height:.84;
    letter-spacing:-.064em;
    font-weight:800;
  }

  h1 span { color:var(--blue); }

  .lede {
    max-width:39rem;
    margin:1.65rem 0 1.7rem;
    color:var(--muted);
    font-size:1.08rem;
    line-height:1.62;
  }

  .hero-search { max-width:640px; }

  .stats {
    max-width:640px;
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:2rem;
    border-top:1px solid var(--line);
    margin-top:1.65rem;
    padding-top:1.45rem;
  }

  .stats div { display:grid; gap:.2rem; }
  .stats strong { font-size:1.55rem; letter-spacing:-.04em; }
  .stats span { color:var(--muted); font-size:.78rem; }

  .feature-wrap {
    position:relative;
    min-height:480px;
    display:flex;
    align-items:center;
  }

  .brand-bars {
    position:absolute;
    inset:0 0 auto 7%;
    height:425px;
    display:grid;
    grid-template-columns:1.3fr .75fr .75fr .75fr;
    gap:12px;
    align-items:start;
    pointer-events:none;
  }

  .bar {
    display:block;
    height:88%;
    border-radius:2.2rem 5.7rem 2.2rem 5.4rem;
    border:1px solid rgba(18,16,14,.15);
  }
  .bar-black { background:var(--ink); height:75%; }
  .bar-orange { background:var(--orange); height:100%; }
  .bar-blue { background:var(--blue); height:94%; margin-top:1.1rem; }
  .bar-gray { background:var(--granite); height:87%; margin-top:2.3rem; }

  .feature-panel {
    position:relative;
    z-index:2;
    width:calc(100% - 2.5rem);
    margin-left:auto;
    background:rgba(255,255,255,.97);
    border:1px solid #dedbdd;
    border-radius:1.2rem;
    box-shadow:0 24px 70px rgba(18,16,14,.12);
    padding:1.45rem 1.55rem 1.25rem;
  }

  .feature-topline {
    display:flex;
    align-items:start;
    justify-content:space-between;
    gap:1rem;
  }

  .micro {
    color:var(--granite);
    text-transform:uppercase;
    letter-spacing:.12em;
    font-size:.65rem;
    font-weight:850;
  }

  .feature-topline h2 {
    font-family:var(--display);
    font-size:2rem;
    letter-spacing:-.045em;
    margin:.18rem 0 .2rem;
  }

  .feature-topline p { margin:0; color:var(--muted); font-size:.8rem; }
  .feature-topline p b { margin:0 .35rem; color:#b6b2b5; }

  .feature-topline>a {
    flex:0 0 auto;
    text-decoration:none;
    border:1px solid var(--line-strong);
    border-radius:.65rem;
    padding:.62rem .78rem;
    font-size:.76rem;
    font-weight:800;
    background:white;
  }

  .feature-toolbar {
    margin-top:1.25rem;
    display:grid;
    grid-template-columns:1fr 220px;
    gap:2rem;
    align-items:end;
    border-bottom:1px solid var(--line);
  }

  .tabs { display:flex; align-items:end; gap:1.6rem; color:var(--muted); font-size:.78rem; }
  .tabs>* { padding-bottom:.75rem; }
  .tabs strong { color:var(--ink); position:relative; }
  .tabs strong:after { content:''; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:var(--orange); }

  .progress { padding-bottom:.72rem; }
  .progress>span { display:flex; justify-content:space-between; color:var(--muted); font-size:.68rem; margin-bottom:.4rem; }
  .progress strong { color:var(--ink); }
  .progress>div { height:5px; background:#efedee; border-radius:999px; overflow:hidden; }
  .progress i { display:block; width:42%; height:100%; background:var(--orange); border-radius:inherit; }

  .mini-filters {
    display:grid;
    grid-template-columns:1fr auto auto;
    gap:.55rem;
    margin:.9rem 0 .55rem;
  }

  .mini-search, .mini-filters button {
    min-height:2.2rem;
    border:1px solid var(--line-strong);
    border-radius:.58rem;
    background:white;
    color:#7b777b;
    font-size:.72rem;
  }
  .mini-search { display:flex; gap:.5rem; align-items:center; padding:0 .7rem; }
  .mini-filters button { padding:0 .75rem; color:#555154; }

  .preview-table { font-size:.74rem; }
  .preview-head, .preview-row {
    display:grid;
    grid-template-columns:46px 1.45fr 1fr .9fr;
    align-items:center;
    min-height:2.35rem;
    border-bottom:1px solid #efedee;
  }
  .preview-head { color:#777277; font-size:.65rem; font-weight:750; }
  .preview-row strong { font-size:.74rem; }
  .preview-row>span:not(.status) { color:#5f5a5e; }
  .num { color:var(--ink)!important; }
  .status { justify-self:start; padding:.27rem .5rem; background:#f0eff0; border-radius:.4rem; color:#5f5a5e; font-size:.64rem; }
  .status.owned { background:rgba(64,121,140,.13); color:#286274; }

  .browse-section {
    border-top:1px solid var(--line);
    border-bottom:1px solid var(--line);
    background:#fdfdfd;
  }

  .browse-grid {
    display:grid;
    grid-template-columns:1.65fr .85fr;
    gap:4.25rem;
    padding-top:3rem;
    padding-bottom:3.3rem;
  }

  .section-head {
    display:flex;
    align-items:end;
    justify-content:space-between;
    gap:2rem;
    margin-bottom:1.25rem;
  }

  .section-head h2, .collector-block h2 {
    font-family:var(--display);
    letter-spacing:-.045em;
    line-height:.95;
  }

  .section-head h2 { margin:.35rem 0 0; font-size:2.65rem; }
  .section-head a { text-decoration:none; color:var(--blue); font-size:.78rem; font-weight:800; }

  .set-list { border-top:1px solid var(--line-strong); }
  .set-list-head, .set-row {
    display:grid;
    grid-template-columns:2fr .55fr .8fr .55fr 26px;
    gap:1rem;
    align-items:center;
  }
  .set-list-head { min-height:2.1rem; color:#817c80; font-size:.62rem; text-transform:uppercase; letter-spacing:.1em; font-weight:850; }
  .set-row { min-height:3.25rem; border-top:1px solid var(--line); text-decoration:none; font-size:.78rem; color:#575255; }
  .set-row:hover { background:#faf9f9; }
  .set-name { display:flex; align-items:center; gap:.8rem; color:var(--ink); }
  .set-name i { width:2.1rem; height:1.55rem; border:1px solid #d7d3d5; border-radius:.32rem; background:linear-gradient(135deg,#eee7dc,#f8f4ee); }
  .arrow { justify-self:end; color:var(--ink); font-size:1rem; }
  .empty-row { padding:1.5rem 0; color:var(--muted); font-size:.82rem; }
  .demo-note { margin:.8rem 0 0; color:var(--muted); font-size:.72rem; }

  .collector-block {
    border-left:1px solid var(--line);
    padding-left:3.5rem;
  }
  .collector-block h2 { margin:.5rem 0 1rem; font-size:2rem; }
  .collector-block>p { color:var(--muted); line-height:1.55; margin:0; font-size:.9rem; }

  .features { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-top:2rem; }
  .features>div { min-width:0; }
  .feature-icon { width:2rem; height:2rem; display:grid; place-items:center; border-radius:.5rem; background:linear-gradient(145deg,#9b979d,#dedbdd); color:var(--ink); font-size:1.05rem; margin-bottom:.6rem; }
  .features strong { display:block; font-size:.73rem; line-height:1.08; }
  .features p { margin:.38rem 0 0; color:var(--muted); font-size:.65rem; line-height:1.35; }

  @media (max-width: 1050px) {
    .hero { grid-template-columns:1fr; gap:3.5rem; }
    .hero-copy { max-width:760px; }
    .hero-search,.stats { max-width:720px; }
    .feature-wrap { min-height:430px; }
    .feature-panel { width:92%; margin-inline:auto; }
    .browse-grid { grid-template-columns:1fr; }
    .collector-block { border-left:0; border-top:1px solid var(--line); padding:2rem 0 0; }
  }

  @media (max-width: 700px) {
    .hero { padding-top:3.5rem; padding-bottom:4rem; }
    h1 { font-size:clamp(3.4rem,15vw,5rem); }
    .feature-wrap { min-height:auto; padding-top:2rem; }
    .brand-bars { display:none; }
    .feature-panel { width:100%; }
    .feature-toolbar { grid-template-columns:1fr; gap:.5rem; }
    .progress { max-width:220px; }
    .mini-filters { grid-template-columns:1fr 1fr; }
    .mini-search { grid-column:1/-1; }
    .preview-head,.preview-row { grid-template-columns:42px 1.35fr 1fr; }
    .preview-head span:last-child,.preview-row .status { display:none; }
    .set-list-head,.set-row { grid-template-columns:1.6fr .5fr .75fr 24px; }
    .set-list-head span:nth-child(4),.set-row span:nth-child(4) { display:none; }
    .features { grid-template-columns:1fr; }
    .features>div { display:grid; grid-template-columns:auto 1fr; column-gap:.8rem; align-items:start; }
    .features p { grid-column:2; }
    .feature-icon { grid-row:1/3; }
  }

  @media (max-width: 520px) {
    .stats { gap:1rem; }
    .stats strong { font-size:1.25rem; }
    .feature-panel { padding:1.1rem; }
    .feature-topline { flex-direction:column; }
    .feature-topline h2 { font-size:1.65rem; }
    .tabs { gap:1rem; }
    .set-list-head,.set-row { grid-template-columns:1fr .5fr 24px; }
    .set-list-head span:nth-child(3),.set-row span:nth-child(3) { display:none; }
  }
</style>
