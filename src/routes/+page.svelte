<script>
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();

	const firstYear = $derived(
		data.years.length ? Math.min(...data.years.map((year) => Number(year.year))) : null
	);

	const latestYear = $derived(
		data.years.length ? Math.max(...data.years.map((year) => Number(year.year))) : null
	);

	const websiteSchema = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Setbound',
		url: 'https://setbound.app/',
		potentialAction: {
			'@type': 'SearchAction',
			target: 'https://setbound.app/search?q={search_term_string}',
			'query-input': 'required name=search_term_string'
		}
	});
</script>

<!-- SEO-PASS:setbound -->
<svelte:head>
	<title>Sports Card Checklists & Collection Tracking | Setbound</title>
	<meta
		name="description"
		content="Browse sports card checklists, search players and teams, and track the cards you own or want with Setbound."
	/>
	<meta name="robots" content="index,follow" />
	<link rel="canonical" href="https://setbound.app/" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Setbound" />
	<meta property="og:title" content="Sports Card Checklists & Collection Tracking | Setbound" />
	<meta
		property="og:description"
		content="Browse sports card checklists, search players and teams, and track the cards you own or want."
	/>
	<meta property="og:url" content="https://setbound.app/" />
	<meta name="twitter:card" content="summary" />
	{@html `<script type="application/ld+json">${websiteSchema}</script>`}
</svelte:head>

<section class="hero shell">
	<div class="hero-copy">
		<div class="eyebrow">Sports card checklists</div>
		<h1>Find the card.<br /><span>Finish the set.</span></h1>

		<p class="intro">
			Setbound is a searchable checklist library built for collectors. Find a release, see
			what belongs in it, and keep track of the cards you already have and the ones still
			missing.
		</p>

		<div class="search"><SearchBox large /></div>

		<div class="quick-links">
			<a href="/sets">Browse checklists →</a>
			<a href="/search">Search players & teams →</a>
		</div>
	</div>

	<div class="browse-panel">
		<div class="eyebrow">Browse by sport</div>
		<h2>Start somewhere.</h2>

		<div class="sports">
			{#each data.sports as sport}
				<a href={`/sets/sport/${sport.slug}`}>
					<span>{sport.name}</span>
					<strong>{Number(sport.set_count || 0).toLocaleString()} sets</strong>
				</a>
			{/each}
		</div>

		<a class="all-sports" href="/sets">Browse the full library →</a>
	</div>
</section>

<section class="why">
	<div class="shell why-grid">
		<div class="why-copy">
			<div class="eyebrow">Built for the collection</div>
			<h2>A checklist you can actually use.</h2>
			<p>
				Looking up a checklist is only half the job. Sign in and Setbound turns that list
				into a working view of your collection, without spreadsheets, notes apps, or
				trying to remember which parallel you bought three months ago.
			</p>

			{#if data.signedIn}
				<a class="cta primary" href="/collection">Open your collection →</a>
			{:else}
				<div class="signup-actions">
					<a class="cta primary" href="/auth/register">Create a free account →</a>
					<a class="cta secondary" href="/auth/login">Already have an account?</a>
				</div>
			{/if}
		</div>

		<div class="benefits">
			<article>
				<span class="number">01</span>
				<div>
					<h3>Mark what you own.</h3>
					<p>Check cards off directly from the checklist and see your progress as the set fills in.</p>
				</div>
			</article>

			<article>
				<span class="number">02</span>
				<div>
					<h3>Keep a want list.</h3>
					<p>Flag the cards you are still hunting so the next show, shop, or trade is easier.</p>
				</div>
			</article>

			<article>
				<span class="number">03</span>
				<div>
					<h3>Search across sets.</h3>
					<p>Find players, teams, card numbers and checklists without digging through product pages one by one.</p>
				</div>
			</article>
		</div>
	</div>
</section>

<section class="library-strip">
	<div class="shell strip-grid">
		<div>
			<div class="eyebrow">The library</div>
			<h2>One place for the checklists.</h2>
		</div>

		<div class="library-copy">
			<p>
				Setbound organizes releases by sport, year and manufacturer, with product checklists
				and official pack odds where they are available.
			</p>

			{#if firstYear && latestYear}
				<div class="range">
					<span>Currently covering</span>
					<strong>{firstYear === latestYear ? latestYear : `${firstYear}–${latestYear}`}</strong>
				</div>
			{/if}

			<a href="/sets">Explore the set library →</a>
		</div>
	</div>
</section>

<section class="recent">
	<div class="shell">
		<div class="section-head">
			<div>
				<div class="eyebrow">Recently added</div>
				<h2>New checklists</h2>
			</div>
			<a href="/sets">View all sets →</a>
		</div>

		{#if data.recent.length}
			<div class="grid">
				{#each data.recent as set}
					<SetCard {set} />
				{/each}
			</div>
		{:else}
			<div class="empty">No published sets yet.</div>
		{/if}
	</div>
</section>

{#if !data.signedIn}
	<section class="closing">
		<div class="shell closing-inner">
			<div>
				<div class="eyebrow">Your collection</div>
				<h2>Know what you have.<br />Know what you need.</h2>
			</div>

			<div class="closing-copy">
				<p>
					An account lets you save owned cards and wants as you browse. Your checklist
					stops being a reference page and starts becoming your collection.
				</p>
				<a class="cta primary" href="/auth/register">Start tracking for free →</a>
			</div>
		</div>
	</section>
{/if}

<style>
	.hero{min-height:650px;display:grid;grid-template-columns:1.2fr .8fr;gap:5rem;align-items:center;padding-top:3.5rem;padding-bottom:4.5rem}
	.hero-copy h1{font-family:var(--display);font-size:clamp(3.7rem,7vw,6.6rem);font-weight:700;letter-spacing:-.07em;line-height:.98;margin:.6rem 0 1.4rem}.hero-copy h1 span{color:var(--orange)}
	.intro{max-width:720px;margin:0 0 1.7rem;color:var(--muted);font-size:1rem;line-height:1.6}
	.search{max-width:720px}.quick-links{display:flex;gap:1rem;margin-top:1rem;flex-wrap:wrap}.quick-links a{color:var(--muted);font-size:.74rem;font-weight:800;text-decoration:none}.quick-links a:hover{color:var(--ink)}
	.browse-panel{border-left:1px solid var(--line);padding-left:2rem}.browse-panel h2{font-family:var(--display);font-size:2.4rem;font-weight:600;letter-spacing:-.04em;margin:.35rem 0 1.2rem}
	.sports{display:grid}.sports a{display:flex;justify-content:space-between;gap:1rem;padding:.82rem 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.sports a:hover span{color:var(--blue)}.sports span{font-weight:850}.sports strong{color:var(--muted);font-size:.72rem}.all-sports{display:inline-block;margin-top:1rem;color:var(--blue);font-size:.7rem;font-weight:850;text-decoration:none}
	.why{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--soft);padding:5rem 0}.why-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:6rem}.why-copy h2,.library-strip h2,.closing h2{font-family:var(--display);font-size:clamp(2.8rem,5vw,4.8rem);font-weight:600;letter-spacing:-.055em;line-height:.95;margin:.45rem 0 1rem}.why-copy>p{max-width:560px;color:var(--muted);line-height:1.65;margin:0 0 1.5rem}.signup-actions{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}.cta{display:inline-flex;align-items:center;justify-content:center;border-radius:.7rem;padding:.75rem .9rem;font-size:.74rem;font-weight:900;text-decoration:none}.cta.primary{background:var(--ink);color:#fff}.cta.secondary{border:1px solid var(--line-strong);color:var(--ink);background:#fff}
	.benefits{border-top:1px solid var(--line)}.benefits article{display:grid;grid-template-columns:58px 1fr;gap:1rem;padding:1.35rem 0;border-bottom:1px solid var(--line)}.number{color:var(--blue);font-size:.62rem;font-weight:900;letter-spacing:.08em}.benefits h3{font-size:1.05rem;margin:0 0 .3rem;letter-spacing:-.02em}.benefits p{max-width:520px;margin:0;color:var(--muted);font-size:.78rem;line-height:1.55}
	.library-strip{padding:4.5rem 0;border-bottom:1px solid var(--line)}.strip-grid{display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:start}.library-strip h2{margin-bottom:0}.library-copy{border-left:1px solid var(--line);padding-left:2rem}.library-copy>p{margin:0 0 1.5rem;max-width:580px;color:var(--muted);line-height:1.6}.library-copy>a{color:var(--blue);font-size:.73rem;font-weight:900;text-decoration:none}.range{display:flex;align-items:baseline;gap:.75rem;margin-bottom:1.35rem}.range span{color:var(--muted);font-size:.68rem}.range strong{font-family:var(--display);font-size:1.8rem;font-weight:500}
	.recent{padding:3.5rem 0 5rem}.section-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1.2rem}.section-head h2{font-family:var(--display);font-size:2.7rem;font-weight:600;letter-spacing:-.04em;margin:.25rem 0 0}.section-head>a{color:var(--blue);font-size:.72rem;font-weight:850;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.empty{padding:3rem;border:1px dashed var(--line-strong);border-radius:1rem;color:var(--muted);text-align:center}
	.closing{border-top:1px solid var(--line);padding:5rem 0 6rem}.closing-inner{display:grid;grid-template-columns:1.1fr .9fr;gap:5rem;align-items:end}.closing h2{margin-bottom:0}.closing-copy{border-left:1px solid var(--line);padding-left:2rem}.closing-copy p{margin:0 0 1.4rem;color:var(--muted);line-height:1.6;max-width:500px}
	@media(max-width:900px){.hero{grid-template-columns:1fr;gap:2rem;min-height:0}.browse-panel{border-left:0;border-top:1px solid var(--line);padding:2rem 0 0}.why-grid,.strip-grid,.closing-inner{grid-template-columns:1fr;gap:2rem}.library-copy,.closing-copy{border-left:0;border-top:1px solid var(--line);padding:1.5rem 0 0}.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.grid{grid-template-columns:1fr}.hero-copy h1{font-size:clamp(3.6rem,18vw,5.5rem)}.hero{padding-top:2.5rem}.why,.library-strip,.closing{padding-top:3.5rem;padding-bottom:3.5rem}}
</style>
