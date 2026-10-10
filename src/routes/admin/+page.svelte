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

	<div class="admin-grid">
		<a class="admin-link" href="/admin/import">
			<div class="icon">↓</div>
			<div>
				<span class="kicker">Import</span>
				<h2>Import checklist</h2>
				<p>Add a PDF, XLS, or XLSX checklist.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/admin/cleanup">
			<div class="icon">×</div>
			<div>
				<span class="kicker">Cleanup</span>
				<h2>Clean imports</h2>
				<p>Remove bad rows or an entire import.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/admin/subjects">
			<div class="icon">Aa</div>
			<div>
				<span class="kicker">Data cleanup</span>
				<h2>Subjects</h2>
				<p>Rename or merge malformed player and subject names.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/admin/sets">
			<div class="icon">▧</div>
			<div>
				<span class="kicker">Products</span>
				<h2>Manage sets</h2>
				<p>Artwork, release dates, and collector-facing notes.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/sets">
			<div class="icon">↗</div>
			<div>
				<span class="kicker">Public</span>
				<h2>Browse sets</h2>
				<p>Check the public library.</p>
			</div>
			<span class="arrow">→</span>
		</a>
	</div>
</section>

<style>
	.page{padding-top:3.5rem;padding-bottom:5rem}
	.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
	h1{margin:.45rem 0 .55rem;font-size:clamp(2.8rem,6vw,5.2rem);line-height:.95;letter-spacing:-.06em}
	.hero p{margin:0;color:var(--muted)}
	.view-site{margin-top:.55rem;color:var(--blue);text-decoration:none;font-size:.76rem;font-weight:850}
	.admin-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;padding-top:1.2rem}
	.admin-link{display:grid;grid-template-columns:46px 1fr auto;gap:1rem;align-items:start;min-height:145px;padding:1.2rem;border:1px solid var(--line);border-radius:1rem;background:white;color:inherit;text-decoration:none;transition:.18s ease}
	.admin-link:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(18,16,14,.07)}
	.icon{display:grid;place-items:center;width:42px;height:42px;border-radius:.8rem;background:#f1f0ee;border:1px solid var(--line);font-size:.9rem;font-weight:900}
	.kicker{display:block;color:var(--blue);font-size:.64rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
	h2{margin:.3rem 0 .45rem;font-size:1.25rem}
	.admin-link p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.5}
	.arrow{align-self:center}
	@media(max-width:760px){.admin-grid{grid-template-columns:1fr}}
</style>
