<script>
  let { data, form } = $props();
</script>

<svelte:head>
  <title>SEO health — Setbound Admin</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section class="shell seo">
  <div class="heading">
    <div>
      <div class="eyebrow">Admin · Search visibility</div>
      <h1>SEO health</h1>
      <p>Review candidates and old URLs. Nothing on this page merges or deletes a card.</p>
    </div>
    <a href="/admin">← Admin</a>
  </div>

  <div class="stats">
    <div><strong>{Number(data.counts.published_sets || 0).toLocaleString()}</strong><span>Published sets</span></div>
    <div><strong>{Number(data.counts.empty_sets || 0).toLocaleString()}</strong><span>Empty published sets</span></div>
    <div><strong>{Number(data.counts.redirects || 0).toLocaleString()}</strong><span>Saved redirects</span></div>
    <div><strong>{Number(data.counts.total_subjects || 0).toLocaleString()}</strong><span>Subject identities</span></div>
  </div>

  <section>
    <h2>Subject review queue (preview only)</h2>
    <p>Profiles with fewer than {data.minCards} public cards or fewer than {data.minSets} published sets are noindexed and excluded from the sitemap. They still work for collectors. These entries are <em>not</em> automatically duplicates.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Subject</th><th>Cards</th><th>Sets</th><th>Review</th></tr></thead>
        <tbody>
          {#each data.subjectPreview as subject (subject.id)}
            <tr>
              <td><a href={`/subjects/${subject.id}`} target="_blank" rel="noreferrer">{subject.name}</a></td>
              <td>{subject.cards}</td><td>{subject.sets}</td>
              <td><a href={`/admin/subjects?q=${encodeURIComponent(subject.name)}`}>Review identity →</a></td>
            </tr>
          {:else}
            <tr><td colspan="4">No results in this batch.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <small>Showing up to 40 of the highest-card-count profiles below the threshold. Use Subjects for actual merge decisions.</small>
  </section>

  <section>
    <h2>Published sets without cards</h2>
    <p>These are not included in the sitemap and are served with noindex while empty.</p>
    {#if data.emptySets.length}
      <div class="simple-list">
        {#each data.emptySets as item (item.id)}
          <a href={`/admin/product/${item.id}`}>{item.year} {item.name} <span>Review →</span></a>
        {/each}
      </div>
    {:else}
      <p>None found.</p>
    {/if}
  </section>

  <section>
    <h2>Register a legacy URL redirect</h2>
    <p>Only use this when a missing URL has an actual replacement. Future product slug changes are automatically recorded by the migration. Existing historical changes need review.</p>
    {#if form?.message}<p class:success={form.ok} class="feedback" role="status">{form.message}</p>{/if}
    <form method="POST" action="?/addRedirect">
      <label>Missing old path<input name="old_path" placeholder="/sets/old-checklist-slug" required /></label>
      <label>Existing new path<input name="new_path" placeholder="/sets/new-checklist-slug" required /></label>
      <button type="submit">Save permanent redirect</button>
    </form>
    <small>Does not change product or subject records. Only valid `/sets/...` and `/subjects/...` paths are accepted.</small>
  </section>

  <section>
    <h2>Recent redirects</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Old</th><th>New</th><th>Reason</th></tr></thead>
        <tbody>
          {#each data.redirects as row (row.old_path)}
            <tr><td>{row.old_path}</td><td>{row.new_path}</td><td>{row.reason}</td></tr>
          {:else}
            <tr><td colspan="3">No redirects registered yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .seo{padding:2.5rem 0 5rem;max-width:1200px}.heading{display:flex;align-items:start;justify-content:space-between;gap:1.5rem}.heading h1{font-size:clamp(2.1rem,4vw,3.3rem);letter-spacing:-.04em;margin:.35rem 0}.heading p,section>p{color:var(--muted);line-height:1.6}.heading>a{font-size:.8rem;font-weight:800;color:var(--blue)}.eyebrow{font-size:.67rem;color:var(--blue);text-transform:uppercase;letter-spacing:.1em;font-weight:900}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:2rem 0}.stats>div{border:1px solid var(--line);border-radius:.8rem;padding:1rem;background:white;display:grid;gap:.25rem}.stats strong{font-size:1.7rem}.stats span,small{color:var(--muted);font-size:.72rem}section:not(.seo){margin-top:2rem}h2{font-size:1.35rem;margin-bottom:.3rem}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:.7rem;margin:1rem 0}.table-wrap table{width:100%;border-collapse:collapse;min-width:600px}th,td{padding:.75rem;text-align:left;border-bottom:1px solid var(--line);font-size:.8rem}th{font-size:.67rem;text-transform:uppercase;color:var(--muted)}td a{color:var(--blue)}.simple-list{display:grid;gap:.5rem}.simple-list a{display:flex;justify-content:space-between;border:1px solid var(--line);border-radius:.5rem;padding:.65rem;color:var(--ink);text-decoration:none}form{display:grid;grid-template-columns:1fr 1fr auto;align-items:end;gap:.7rem;margin:1rem 0}label{display:grid;gap:.4rem;font-size:.8rem;font-weight:700}input{border:1px solid var(--line-strong);border-radius:.5rem;padding:.7rem;font:inherit;min-width:0}button{border:0;border-radius:.5rem;background:var(--ink);color:white;padding:.73rem .9rem;font:inherit;font-weight:700;cursor:pointer}.feedback{background:#fff4e2;padding:.7rem;border-radius:.5rem}.feedback.success{background:#edf7ee}@media(max-width:850px){.stats{grid-template-columns:1fr 1fr}form{grid-template-columns:1fr} .heading{flex-direction:column}} 
</style>
