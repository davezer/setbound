<script>
	let { data } = $props();

	const userStats = $derived(data.userStats || {
		total: 0,
		last7Days: 0,
		withCollectionActivity: 0,
		recent: []
	});
</script>

<svelte:head><title>Admin — setbound</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Setbound admin</h1>
			<p>Everything behind the scenes, in one place.</p>
		</div>

		<a class="view-site" href="/" target="_blank" rel="noreferrer">View site ↗</a>
	</div>

	<section class="user-overview" aria-labelledby="user-overview-title">
		<div class="section-head">
			<div>
				<div class="eyebrow">Community</div>
				<h2 id="user-overview-title">Registered users</h2>
			</div>
			<a href="/admin/users">View users →</a>
		</div>

		<div class="stats">
			<div class="stat"><span>Total users</span><strong>{userStats.total.toLocaleString()}</strong></div>
			<div class="stat"><span>Joined in last 7 days</span><strong>{userStats.last7Days.toLocaleString()}</strong></div>
			<div class="stat"><span>Using collection tools</span><strong>{userStats.withCollectionActivity.toLocaleString()}</strong></div>
		</div>

		{#if userStats.recent.length}
			<div class="recent-users">
				<div class="recent-head"><span>Newest accounts</span><span>Joined</span></div>
				{#each userStats.recent as user}
					<a href="/admin/users">
						<div>
							<strong>{user.display_name || user.email}</strong>
							{#if user.display_name}<span>{user.email}</span>{/if}
						</div>
						<div class="joined">
							{new Date(`${user.created_at.replace(' ', 'T')}Z`).toLocaleDateString()}
							{#if user.is_admin}<span class="admin-badge">Admin</span>{/if}
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty-users">No registered users yet.</div>
		{/if}
	</section>

	<div class="admin-grid">
		<a class="admin-link" href="/admin/import"><div class="icon">↓</div><div><span class="kicker">Import</span><h2>Import checklist</h2><p>Add a PDF, XLS, or XLSX checklist.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/odds"><div class="icon">1:</div><div><span class="kicker">Odds</span><h2>Import product odds</h2><p>Parse official odds PDFs and connect pack odds to checklist data.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/cleanup"><div class="icon">×</div><div><span class="kicker">Cleanup</span><h2>Clean imports</h2><p>Remove bad rows or an entire import.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/cards"><div class="icon">#</div><div><span class="kicker">Manual correction</span><h2>Card data</h2><p>Fix a player's team, tags, variation, serial number, notes, or subject on one card.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/affiliations"><div class="icon">T</div><div><span class="kicker">Reference data</span><h2>Teams & affiliations</h2><p>Manage team and school names, sports, leagues, types, and aliases.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/subjects"><div class="icon">Aa</div><div><span class="kicker">Data cleanup</span><h2>Subjects</h2><p>Rename or merge malformed player and subject names.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/sets"><div class="icon">▧</div><div><span class="kicker">Products</span><h2>Manage sets</h2><p>Artwork, release dates, product details, and collector-facing notes.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/admin/users"><div class="icon">◎</div><div><span class="kicker">Community</span><h2>Users</h2><p>See registrations and how collectors are using Setbound.</p></div><span class="arrow">→</span></a>
		<a class="admin-link" href="/sets"><div class="icon">↗</div><div><span class="kicker">Public</span><h2>Browse sets</h2><p>Check the public library.</p></div><span class="arrow">→</span></a>
	</div>
</section>

<style>
	.page{padding-top:3.5rem;padding-bottom:5rem}.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
	h1{margin:.45rem 0 .55rem;font-size:clamp(2.8rem,6vw,5.2rem);line-height:.95;letter-spacing:-.06em}.hero p{margin:0;color:var(--muted)}.view-site{margin-top:.55rem;color:var(--blue);text-decoration:none;font-size:.76rem;font-weight:850}
	.user-overview{padding:1.35rem 0 1.5rem;border-bottom:1px solid var(--line)}.section-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1rem}.section-head h2{margin:.25rem 0 0;font-size:1.75rem}.section-head>a{color:var(--blue);text-decoration:none;font-size:.72rem;font-weight:850}
	.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}.stat{padding:1rem 1.05rem;border:1px solid var(--line);border-radius:.85rem;background:white}.stat span{display:block;color:var(--muted);font-size:.65rem;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.stat strong{display:block;margin-top:.25rem;font-size:2rem;letter-spacing:-.04em}
	.recent-users{margin-top:.85rem;border:1px solid var(--line);border-radius:.85rem;overflow:hidden;background:white}.recent-head,.recent-users>a{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;padding:.7rem .9rem}.recent-head{background:#faf9f7;border-bottom:1px solid var(--line);color:var(--muted);font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.recent-users>a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}.recent-users>a:last-child{border-bottom:0}.recent-users>a:hover{background:#fafafa}.recent-users strong,.recent-users span{display:block}.recent-users div>span{margin-top:.15rem;color:var(--muted);font-size:.68rem}.joined{display:flex;align-items:center;gap:.45rem;color:var(--muted);font-size:.72rem}.admin-badge{display:inline-block!important;margin:0!important;padding:.18rem .35rem;border-radius:999px;background:#f0efed;color:var(--ink)!important;font-size:.55rem!important;font-weight:900}.empty-users{margin-top:.85rem;padding:1rem;border:1px dashed var(--line-strong);border-radius:.85rem;color:var(--muted);font-size:.8rem}
	.admin-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;padding-top:1.2rem}.admin-link{display:grid;grid-template-columns:46px 1fr auto;gap:1rem;align-items:start;min-height:145px;padding:1.2rem;border:1px solid var(--line);border-radius:1rem;background:white;color:inherit;text-decoration:none;transition:.18s ease}.admin-link:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(18,16,14,.07)}.icon{display:grid;place-items:center;width:42px;height:42px;border-radius:.8rem;background:#f1f0ee;border:1px solid var(--line);font-size:.9rem;font-weight:900}.kicker{display:block;color:var(--blue);font-size:.64rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.admin-link h2{margin:.3rem 0 .45rem;font-size:1.25rem}.admin-link p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.5}.arrow{align-self:center}
	@media(max-width:760px){.stats{grid-template-columns:1fr}.admin-grid{grid-template-columns:1fr}.recent-head,.recent-users>a{grid-template-columns:1fr}.joined{justify-content:flex-start}}
</style>
