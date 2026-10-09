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
			<div class="icon import-icon" aria-hidden="true">↓</div>
			<div>
				<span class="kicker">Import</span>
				<h2>Import checklist</h2>
				<p>Parse a new checklist, review it, and add it to Setbound.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/admin/cleanup">
			<div class="icon cleanup-icon" aria-hidden="true">×</div>
			<div>
				<span class="kicker">Cleanup</span>
				<h2>Clean imported rows</h2>
				<p>Remove parser mistakes or bad rows from an existing set.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/admin/sets">
			<div class="icon artwork-icon" aria-hidden="true">▧</div>
			<div>
				<span class="kicker">Artwork</span>
				<h2>Set artwork</h2>
				<p>Add, replace, or remove product images used around the site.</p>
			</div>
			<span class="arrow">→</span>
		</a>

		<a class="admin-link" href="/sets">
			<div class="icon browse-icon" aria-hidden="true">↗</div>
			<div>
				<span class="kicker">Public</span>
				<h2>Browse sets</h2>
				<p>Jump back to the public set library to check how things look.</p>
			</div>
			<span class="arrow">→</span>
		</a>
	</div>
</section>

<style>
	.page {
		padding-top: 3.5rem;
		padding-bottom: 5rem;
	}

	.hero {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--line);
	}

	h1 {
		margin: .45rem 0 .55rem;
		font-size: clamp(2.8rem, 6vw, 5.2rem);
		line-height: .95;
		letter-spacing: -.06em;
	}

	.hero p {
		margin: 0;
		color: var(--muted);
		font-size: 1rem;
	}

	.view-site {
		margin-top: .55rem;
		color: var(--blue);
		text-decoration: none;
		font-size: .76rem;
		font-weight: 850;
		white-space: nowrap;
	}

	.admin-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		padding-top: 1.2rem;
	}

	.admin-link {
		display: grid;
		grid-template-columns: 46px minmax(0,1fr) auto;
		gap: 1rem;
		align-items: start;
		min-height: 150px;
		padding: 1.2rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: white;
		color: inherit;
		text-decoration: none;
		transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
	}

	.admin-link:hover {
		transform: translateY(-2px);
		border-color: #bbb8bd;
		box-shadow: 0 14px 36px rgba(18,16,14,.07);
	}

	.icon {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: .8rem;
		background: #f1f0ee;
		border: 1px solid var(--line);
		font-size: 1.1rem;
		font-weight: 900;
	}

	.import-icon { color: var(--blue); }
	.cleanup-icon { color: #8d3028; }
	.artwork-icon { color: var(--orange); }
	.browse-icon { color: var(--granite); }

	.kicker {
		display: block;
		color: var(--blue);
		font-size: .64rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .1em;
	}

	h2 {
		margin: .3rem 0 .45rem;
		font-size: 1.25rem;
		letter-spacing: -.03em;
	}

	.admin-link p {
		margin: 0;
		max-width: 36rem;
		color: var(--muted);
		font-size: .8rem;
		line-height: 1.5;
	}

	.arrow {
		align-self: center;
		font-size: 1.05rem;
		transition: transform .16s ease;
	}

	.admin-link:hover .arrow {
		transform: translateX(3px);
	}

	@media (max-width: 760px) {
		.hero {
			display: block;
		}

		.view-site {
			display: inline-block;
			margin-top: 1rem;
		}

		.admin-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
