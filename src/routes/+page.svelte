<script>
	import SearchBox from '$lib/components/SearchBox.svelte';

	let { data } = $props();

	const visualSets = $derived((data.recent || []).filter((set) => set.image_key).slice(0, 3));
</script>

<svelte:head>
	<title>Setbound — Sports card checklists</title>
	<meta
		name="description"
		content="Search sports card checklists by set, player, team and card number."
	/>
</svelte:head>

<section class="hero shell">
	<div class="hero-copy">
		<div class="eyebrow">Sports card checklists</div>
		<h1>Find the card.<br /><span>Track the set.</span></h1>

		<p class="lede">
			Search sets, players, teams and card numbers.
		</p>

		<div class="hero-search">
			<SearchBox large placeholder="Search sets, players, teams, products…" />
		</div>

		<div class="hero-links">
			<a href="/sets">Browse all sets <span>→</span></a>
			<a href="/search">Search <span>→</span></a>
		</div>
	</div>

	<div class="visual">
		<div class="visual-kicker">
			<span>Recently added</span>
			<strong>A few sets to start with.</strong>
		</div>

		<div class="art-stack">
			{#if visualSets.length}
				{#each visualSets as set, index}
					<a
						class="art-panel"
						class:primary={index === 0}
						class:secondary={index === 1}
						class:tertiary={index === 2}
						href={`/sets/${set.slug}`}
					>
						<img src={`/media/set/${set.slug}`} alt={`${set.year} ${set.name}`} />
						<div class="art-caption">
							<span>{set.manufacturer_name} · {set.year}</span>
							<strong>{set.name}</strong>
						</div>
					</a>
				{/each}
			{:else}
				<div class="brand-art" aria-hidden="true">
					<i></i><i></i><i></i><i></i>
				</div>
			{/if}
		</div>
	</div>
</section>

<section class="recent-section">
	<div class="shell">
		<div class="section-head">
			<div>
				<div class="eyebrow">Browse</div>
				<h2>Recently added</h2>
			</div>

			<a href="/sets">View all sets <span>→</span></a>
		</div>

		{#if data.recent?.length}
			<div class="recent-grid">
				{#each data.recent as set}
					<a class="recent-item" href={`/sets/${set.slug}`}>
						<div class="thumb" class:no-image={!set.image_key}>
							{#if set.image_key}
								<img src={`/media/set/${set.slug}`} alt={`${set.year} ${set.name}`} loading="lazy" />
							{:else}
								<div class="thumb-fallback" aria-hidden="true">
									<i></i><i></i><i></i><i></i>
								</div>
							{/if}
							<span class="sport-pill">{set.sport_name}</span>
						</div>

						<div class="recent-copy">
							<div class="recent-meta">
								<span>{set.manufacturer_name}</span>
								<span>{set.year}</span>
							</div>

							<h3>{set.name}</h3>

							<div class="recent-foot">
								<span>{Number(set.card_count || 0).toLocaleString()} cards</span>
								<span>{set.checklist_count || 0} checklists</span>
								<strong>→</strong>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">
				No sets yet.
			</div>
		{/if}
	</div>
</section>

<section class="browse-strip">
	<div class="shell browse-strip-inner">
		<div>
			<div class="eyebrow">Browse by sport</div>
			<h2>Pick a sport.</h2>
		</div>

		<div class="browse-links">
			<a href="/sets">Baseball <span>→</span></a>
			<a href="/sets">Football <span>→</span></a>
			<a href="/sets">Basketball <span>→</span></a>
			<a href="/sets">Hockey <span>→</span></a>
		</div>
	</div>
</section>

<style>
	.hero {
		display: grid;
		grid-template-columns: minmax(0,.9fr) minmax(520px,1.1fr);
		gap: 5rem;
		align-items: center;
		padding-top: 5rem;
		padding-bottom: 5.5rem;
	}

	.hero-copy {
		max-width: 650px;
	}

	h1 {
		margin: .7rem 0 0;
		font-family: var(--display);
		font-size: clamp(4rem,6.2vw,6.8rem);
		line-height: .84;
		letter-spacing: -.064em;
		font-weight: 800;
	}

	h1 span {
		color: var(--blue);
	}

	.lede {
		max-width: 39rem;
		margin: 1.7rem 0 1.8rem;
		color: var(--muted);
		font-size: 1.08rem;
		line-height: 1.62;
	}

	.hero-search {
		max-width: 640px;
	}

	.hero-links {
		display: flex;
		flex-wrap: wrap;
		gap: 1.35rem;
		margin-top: 1.2rem;
	}

	.hero-links a {
		display: inline-flex;
		align-items: center;
		gap: .45rem;
		color: var(--ink);
		text-decoration: none;
		font-size: .76rem;
		font-weight: 850;
	}

	.hero-links a span {
		color: var(--blue);
		transition: transform .16s ease;
	}

	.hero-links a:hover span {
		transform: translateX(3px);
	}

	.visual {
		position: relative;
		min-height: 490px;
	}

	.visual-kicker {
		position: absolute;
		z-index: 5;
		top: 0;
		right: 0;
		width: 250px;
		display: grid;
		gap: .35rem;
		text-align: right;
	}

	.visual-kicker span {
		color: var(--blue);
		font-size: .64rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .12em;
	}

	.visual-kicker strong {
		font-family: var(--display);
		font-size: 1.5rem;
		line-height: 1;
		letter-spacing: -.04em;
		font-weight: 500;
	}

	.art-stack {
		position: relative;
		height: 455px;
		margin-top: 1rem;
	}

	.art-panel {
		position: absolute;
		display: block;
		overflow: hidden;
		border: 1px solid rgba(18,16,14,.12);
		background: #f1efec;
		text-decoration: none;
		color: white;
		box-shadow: 0 18px 55px rgba(18,16,14,.12);
		transition: transform .2s ease, box-shadow .2s ease;
	}

	.art-panel:hover {
		transform: translateY(-5px) rotate(0deg) !important;
		box-shadow: 0 26px 70px rgba(18,16,14,.16);
		z-index: 8;
	}

	.art-panel img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}

	.art-panel::after {
		content: '';
		position: absolute;
		inset: 45% 0 0;
		background: linear-gradient(to bottom, transparent, rgba(18,16,14,.72));
	}

	.art-panel.primary {
		left: 0;
		bottom: 0;
		width: 58%;
		height: 72%;
		border-radius: 1.25rem;
		transform: rotate(-2.2deg);
		z-index: 3;
	}

	.art-panel.secondary {
		right: 3%;
		top: 70px;
		width: 49%;
		height: 64%;
		border-radius: 1rem;
		transform: rotate(2.6deg);
		z-index: 2;
	}

	.art-panel.tertiary {
		left: 28%;
		top: 0;
		width: 42%;
		height: 43%;
		border-radius: .9rem;
		transform: rotate(.8deg);
		z-index: 1;
	}

	.art-caption {
		position: absolute;
		z-index: 2;
		left: 1rem;
		right: 1rem;
		bottom: .95rem;
		display: grid;
		gap: .18rem;
	}

	.art-caption span {
		font-size: .62rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .1em;
		opacity: .78;
	}

	.art-caption strong {
		font-size: 1rem;
		line-height: 1.1;
	}

	.brand-art {
		position: absolute;
		left: 12%;
		right: 7%;
		top: 20%;
		bottom: 7%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 18px;
	}

	.brand-art i {
		display: block;
		width: 21%;
		border-radius: 0 2rem .5rem .5rem;
		background: var(--ink);
	}

	.brand-art i:nth-child(1) { height: 92%; }
	.brand-art i:nth-child(2) { height: 79%; background: var(--orange); }
	.brand-art i:nth-child(3) { height: 66%; background: var(--blue); }
	.brand-art i:nth-child(4) { height: 53%; background: var(--granite); }

	.recent-section {
		border-top: 1px solid var(--line);
		background: #fdfdfd;
		padding: 3.4rem 0 4rem;
	}

	.section-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 1.45rem;
	}

	.section-head h2,
	.browse-strip h2 {
		font-family: var(--display);
		letter-spacing: -.05em;
		line-height: .96;
		font-weight: 500;
	}

	.section-head h2 {
		margin: .4rem 0 0;
		font-size: 2.8rem;
	}

	.section-head a {
		color: var(--blue);
		text-decoration: none;
		font-size: .76rem;
		font-weight: 850;
	}

	.recent-grid {
		display: grid;
		grid-template-columns: repeat(3,minmax(0,1fr));
		gap: 1rem;
	}

	.recent-item {
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: white;
		text-decoration: none;
		color: inherit;
		transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
	}

	.recent-item:hover {
		transform: translateY(-3px);
		border-color: #bbb8bd;
		box-shadow: 0 16px 42px rgba(18,16,14,.07);
	}

	.thumb {
		position: relative;
		aspect-ratio: 16/8.3;
		overflow: hidden;
		background: #f2f1ef;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
		transition: transform .25s ease;
	}

	.recent-item:hover .thumb img {
		transform: scale(1.025);
	}

	.thumb.no-image {
		display: grid;
		place-items: center;
	}

	.thumb-fallback {
		display: flex;
		align-items: flex-end;
		gap: 7px;
		height: 55%;
	}

	.thumb-fallback i {
		width: 22px;
		border-radius: 0 12px 3px 3px;
		background: var(--ink);
	}

	.thumb-fallback i:nth-child(1) { height: 100%; }
	.thumb-fallback i:nth-child(2) { height: 82%; background: var(--orange); }
	.thumb-fallback i:nth-child(3) { height: 65%; background: var(--blue); }
	.thumb-fallback i:nth-child(4) { height: 49%; background: var(--granite); }

	.sport-pill {
		position: absolute;
		top: .75rem;
		left: .75rem;
		background: rgba(252,252,252,.92);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(18,16,14,.08);
		border-radius: 999px;
		padding: .32rem .5rem;
		font-size: .61rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .08em;
	}

	.recent-copy {
		padding: 1rem 1.05rem .95rem;
	}

	.recent-meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--blue);
		font-size: .63rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .1em;
	}

	.recent-copy h3 {
		margin: .55rem 0 1.25rem;
		font-size: 1.22rem;
		line-height: 1.1;
		letter-spacing: -.03em;
	}

	.recent-foot {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: .9rem;
		align-items: center;
		border-top: 1px solid var(--line);
		padding-top: .8rem;
		color: var(--muted);
		font-size: .7rem;
	}

	.recent-foot strong {
		justify-self: end;
		color: var(--ink);
		font-size: .95rem;
	}

	.empty {
		border: 1px dashed var(--line-strong);
		border-radius: 1rem;
		padding: 4rem 1rem;
		text-align: center;
		color: var(--muted);
	}

	.browse-strip {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		background: var(--ink);
		color: #fff;
	}

	.browse-strip-inner {
		display: grid;
		grid-template-columns: 1.15fr .85fr;
		gap: 4rem;
		align-items: end;
		padding-top: 3.5rem;
		padding-bottom: 3.5rem;
	}

	.browse-strip .eyebrow {
		color: var(--orange);
	}

	.browse-strip h2 {
		margin: .45rem 0 0;
		font-size: 2.7rem;
	}

	.browse-links {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-top: 1px solid rgba(255,255,255,.16);
	}

	.browse-links a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 3.2rem;
		padding: 0 .2rem;
		border-bottom: 1px solid rgba(255,255,255,.16);
		color: white;
		text-decoration: none;
		font-size: .82rem;
		font-weight: 800;
	}

	.browse-links a:nth-child(odd) {
		margin-right: 1.2rem;
	}

	.browse-links span {
		color: var(--orange);
	}

	@media (max-width: 1050px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.visual {
			min-height: 420px;
		}

		.art-stack {
			height: 390px;
		}

		.recent-grid {
			grid-template-columns: repeat(2,minmax(0,1fr));
		}
	}

	@media (max-width: 720px) {
		.hero {
			padding-top: 3.5rem;
			padding-bottom: 3.5rem;
		}

		.visual {
			min-height: 340px;
		}

		.visual-kicker {
			position: static;
			width: auto;
			text-align: left;
			margin-bottom: 1rem;
		}

		.art-stack {
			height: 300px;
		}

		.art-panel.primary {
			width: 65%;
			height: 72%;
		}

		.art-panel.secondary {
			width: 53%;
			height: 62%;
		}

		.art-panel.tertiary {
			display: none;
		}

		.recent-grid {
			grid-template-columns: 1fr;
		}

		.browse-strip-inner {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
	}
</style>
