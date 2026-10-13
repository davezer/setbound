<script>
	import SearchBox from '$lib/components/SearchBox.svelte';
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Setbound — sports card checklists</title></svelte:head>

<section class="hero shell">
	<div class="hero-copy">
		<div class="eyebrow">Sports card checklists</div>
		<h1>Find the card.<br/><span>Finish the set.</span></h1>

		<div class="search"><SearchBox large /></div>

		<div class="quick-links">
			<a href="/sets">Browse all sets →</a>
			<a href="/search">Search everything →</a>
		</div>
	</div>

	<div class="browse-panel">
		<div class="eyebrow">Browse</div>
		<h2>Start somewhere.</h2>

		<div class="sports">
			{#each data.sports as sport}
				<a href={`/sets?sport=${encodeURIComponent(sport.name)}`}>
					<span>{sport.name}</span>
					<strong>{sport.set_count} sets</strong>
				</a>
			{/each}
		</div>

		<div class="years">
			{#each data.years as year}
				<a href={`/sets?year=${year.year}`}>{year.year}</a>
			{/each}
		</div>
	</div>
</section>

<section class="recent">
	<div class="shell">
		<div class="section-head">
			<div><div class="eyebrow">Recently added</div><h2>New checklists</h2></div>
			<a href="/sets">View all sets →</a>
		</div>

		{#if data.recent.length}
			<div class="grid">
				{#each data.recent as set}<SetCard {set} />{/each}
			</div>
		{:else}
			<div class="empty">No published sets yet.</div>
		{/if}
	</div>
</section>

<style>
	.hero{min-height:620px;display:grid;grid-template-columns:1.2fr .8fr;gap:5rem;align-items:center;padding-top:3rem;padding-bottom:4rem}
	.hero-copy h1{font-family:var(--display);font-size:clamp(4rem,8vw,7.6rem);font-weight:500;letter-spacing:-.075em;line-height:.82;margin:.6rem 0 2rem}.hero-copy h1 span{color:var(--blue)}
	.search{max-width:720px}.quick-links{display:flex;gap:1rem;margin-top:1rem}.quick-links a{color:var(--muted);font-size:.74rem;font-weight:800;text-decoration:none}.quick-links a:hover{color:var(--ink)}
	.browse-panel{border-left:1px solid var(--line);padding-left:2rem}.browse-panel h2{font-family:var(--display);font-size:2.4rem;font-weight:500;letter-spacing:-.04em;margin:.35rem 0 1.2rem}
	.sports{display:grid}.sports a{display:flex;justify-content:space-between;gap:1rem;padding:.82rem 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.sports span{font-weight:850}.sports strong{color:var(--muted);font-size:.72rem}
	.years{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:1rem}.years a{border:1px solid var(--line);border-radius:999px;padding:.4rem .55rem;text-decoration:none;color:inherit;font-size:.68rem;font-weight:850}
	.recent{border-top:1px solid var(--line);padding:3rem 0 5rem}.section-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1.2rem}.section-head h2{font-family:var(--display);font-size:2.7rem;font-weight:500;letter-spacing:-.04em;margin:.25rem 0 0}.section-head>a{color:var(--blue);font-size:.72rem;font-weight:850;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.empty{padding:3rem;border:1px dashed var(--line-strong);border-radius:1rem;color:var(--muted);text-align:center}
	@media(max-width:900px){.hero{grid-template-columns:1fr;gap:2rem;min-height:0}.browse-panel{border-left:0;border-top:1px solid var(--line);padding:2rem 0 0}.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.grid{grid-template-columns:1fr}.hero-copy h1{font-size:clamp(3.6rem,18vw,5.5rem)}}
</style>
