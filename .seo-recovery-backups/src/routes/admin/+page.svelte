<script>
  let { data } = $props();
  const stats = $derived(data.userStats || { total: 0, last7Days: 0, withCollectionActivity: 0, recent: [] });

  const primary = [
    { href: '/admin/sets', title: 'Manage sets', detail: 'Review, correct, replace and publish checklists', icon: '▦', type: 'primary' },
    { href: '/admin/import-bulk', title: 'Bulk import', detail: 'Add multiple CSV checklists at once', icon: '⇩' },
    { href: '/admin/source-library', title: 'Source Library', detail: 'Discover, inspect and prepare source files', icon: '◎' },
    { href: '/admin/import', title: 'Single import', detail: 'Review and import a single CSV, PDF or spreadsheet', icon: '＋' }
  ];
  const tools = [
    { href: '/admin/cards', title: 'Edit card data', detail: 'Correct card subjects, teams and tags' },
    { href: '/admin/odds', title: 'Product odds', detail: 'Import pack and box odds' },
    { href: '/admin/cleanup', title: 'Clean imports', detail: 'Inspect and remove incorrect rows' },
    { href: '/admin/users', title: 'Manage users', detail: 'Accounts and collection activity' }
  ];
  const advanced = [
    { href: '/admin/source-harvester', title: 'Source Harvester', detail: 'Manufacturer archives and source discovery' },
    { href: '/admin/affiliations', title: 'Teams & affiliations', detail: 'Aliases and reference data' },
    { href: '/admin/subjects', title: 'Subjects', detail: 'Merge or rename subjects' },
    { href: '/admin/import-studio', title: 'Import Studio', detail: 'Review and edit product facts' }
  ];
</script>

<svelte:head><title>Admin dashboard | Setbound</title></svelte:head>

<section class="shell dashboard">
  <header class="heading">
    <div>
      <div class="eyebrow">Workspace</div>
      <h1>Setbound admin</h1>
      <p>Your checklists, imports and maintenance tools. All in one place.</p>
    </div>
    <a class="site-link" href="/" target="_blank" rel="noreferrer">View live site ↗</a>
  </header>

  <section class="overview" aria-label="Community overview">
    <div class="metric"><strong>{stats.total.toLocaleString()}</strong><span>Registered users</span></div>
    <div class="metric"><strong>{stats.last7Days.toLocaleString()}</strong><span>New this week</span></div>
    <div class="metric"><strong>{stats.withCollectionActivity.toLocaleString()}</strong><span>Tracking collections</span></div>
    <a class="overview-link" href="/admin/users">User details →</a>
  </section>

  <section class="group" aria-labelledby="daily-tools">
    <div class="section-heading"><div><span class="eyebrow">Start here</span><h2 id="daily-tools">Everyday tools</h2></div><p>Your most-used workflows, without the clutter.</p></div>
    <div class="main-grid">
      {#each primary as item (item.href)}
        <a class="main-tool" class:featured={item.type === 'primary'} href={item.href}>
          <span class="tool-icon" aria-hidden="true">{item.icon}</span>
          <span class="tool-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
          <span class="arrow" aria-hidden="true">→</span>
        </a>
      {/each}
    </div>
  </section>

  <section class="group" aria-labelledby="other-tools">
    <div class="section-heading"><div><span class="eyebrow">Operations</span><h2 id="other-tools">Corrections & management</h2></div></div>
    <div class="link-list">
      {#each tools as item (item.href)}
        <a href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span aria-hidden="true">→</span></a>
      {/each}
    </div>
  </section>

  <details class="advanced">
    <summary><span><strong>Advanced & less-used tools</strong><small>Reference data and specialized workflows</small></span><span class="chevron" aria-hidden="true">⌄</span></summary>
    <div class="link-list advanced-list">
      {#each advanced as item (item.href)}
        <a href={item.href}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span aria-hidden="true">→</span></a>
      {/each}
    </div>
  </details>

  <details class="advanced recent">
    <summary><span><strong>Recent registrations</strong><small>{stats.recent.length ? 'See the newest Setbound accounts' : 'No recent accounts'}</small></span><span class="chevron" aria-hidden="true">⌄</span></summary>
    <div class="recent-list">
      {#each stats.recent as user (user.id)}
        <div class="user-row"><span><strong>{user.display_name || user.email}</strong><small>{user.email}{user.is_admin ? ' · Admin' : ''}</small></span><time>{new Date(`${String(user.created_at).replace(' ', 'T')}Z`).toLocaleDateString()}</time></div>
      {:else}
        <p class="empty">No registered users yet.</p>
      {/each}
    </div>
  </details>
</section>

<style>
  .dashboard{max-width:1320px;padding-top:2.6rem;padding-bottom:5.5rem}
  .heading{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding-bottom:1.8rem}
  .heading h1{font-family:var(--display);font-size:clamp(2.5rem,5vw,4.3rem);line-height:1.05;letter-spacing:-.06em;margin:.4rem 0 .45rem}
  .heading p{font-size:.9rem;color:var(--muted);margin:0;line-height:1.5}
  .site-link{white-space:nowrap;text-decoration:none;color:var(--ink);font-size:.79rem;font-weight:750;margin-top:.6rem;border-bottom:1px solid var(--line-strong);padding-bottom:.25rem}
  .overview{display:flex;align-items:center;gap:0;padding:1.05rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .metric{display:flex;align-items:baseline;gap:.65rem;min-width:0;padding:.3rem 2.1rem .3rem 0;margin-right:2.1rem;border-right:1px solid var(--line)}
  .metric strong{font-size:1.65rem;font-weight:800;line-height:1;letter-spacing:-.05em}
  .metric span{font-size:.75rem;color:var(--muted)}
  .overview-link{margin-left:auto;font-size:.76rem;color:var(--ink);text-decoration:none;font-weight:750;white-space:nowrap}
  .group{padding-top:2.2rem}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:1.2rem;margin-bottom:1rem}
  .section-heading h2{font-family:var(--display);font-size:1.65rem;letter-spacing:-.035em;margin:.2rem 0 0}.section-heading p{margin:0;color:var(--muted);font-size:.78rem}
  .main-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}
  .main-tool{display:flex;align-items:center;gap:1rem;border:1px solid var(--line);border-radius:.7rem;padding:1.2rem;background:#fff;color:var(--ink);text-decoration:none;min-height:105px;transition:border-color .15s,background .15s}
  .main-tool:hover{border-color:var(--line-strong);background:var(--soft)}.main-tool.featured{background:var(--soft);border-color:var(--line-strong)}
  .tool-icon{display:grid;place-items:center;flex:0 0 2.35rem;height:2.35rem;border:1px solid var(--line-strong);border-radius:.55rem;color:var(--ink);font-size:1.15rem;font-weight:800;background:white}
  .tool-copy{display:grid;gap:.25rem;min-width:0}.tool-copy strong{font-family:var(--display);font-size:1.13rem;letter-spacing:-.02em}.tool-copy small{font-size:.76rem;line-height:1.4;color:var(--muted)}.arrow{margin-left:auto;align-self:center;color:var(--muted)}
  .link-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 2rem;border-top:1px solid var(--line)}
  .link-list a{display:flex;gap:.7rem;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding:1rem .2rem;color:var(--ink);text-decoration:none}
  .link-list a:hover strong{color:var(--orange)}.link-list a>span:first-child{display:grid;gap:.25rem}.link-list strong{font-size:.85rem}.link-list small{font-size:.73rem;color:var(--muted)}
  .advanced{border-bottom:1px solid var(--line);margin-top:1.5rem}.advanced summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem .2rem}.advanced summary::-webkit-details-marker{display:none}
  .advanced summary>span:first-child{display:grid;gap:.25rem}.advanced summary strong{font-size:.86rem}.advanced summary small{font-size:.73rem;color:var(--muted)}.chevron{font-size:1.15rem;color:var(--muted)}.advanced[open] .chevron{transform:rotate(180deg)}.advanced-list{margin-bottom:.75rem}
  .recent{margin-top:0}.recent-list{padding:.2rem 0 .8rem}.user-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem .2rem;border-top:1px solid var(--line)}.user-row>span{display:grid;gap:.2rem}.user-row strong{font-size:.82rem}.user-row small,.user-row time{font-size:.72rem;color:var(--muted)}.empty{color:var(--muted);font-size:.8rem}
  @media(max-width:850px){.overview{flex-wrap:wrap;gap:.8rem}.metric{margin-right:0;padding-right:1rem}.main-grid,.link-list{grid-template-columns:1fr}}
  @media(max-width:600px){.heading{flex-direction:column;gap:.6rem}.site-link{margin-top:0}.overview{align-items:flex-start}.metric{display:grid;gap:.25rem;width:calc(50% - .5rem);border:0;padding:.3rem 0}.overview-link{margin-left:0}.section-heading{display:block}.section-heading p{margin-top:.4rem}.main-tool{padding:1rem}.user-row{align-items:flex-start;flex-direction:column}}
</style>
