<script>
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();

	let search = $state(data.q || '');
	let sport = $state('All sports');
	let year = $state('All years');
	let manufacturer = $state('All brands');

	const sports = $derived([
		'All sports',
		...[...new Set(data.sets.map((set) => set.sport_name).filter(Boolean))].sort()
	]);

	const years = $derived([
		'All years',
		...[...new Set(data.sets.map((set) => Number(set.year)).filter(Boolean))]
			.sort((a, b) => b - a)
			.map(String)
	]);

	const manufacturers = $derived([
		'All brands',
		...[...new Set(data.sets.map((set) => set.manufacturer_name).filter(Boolean))].sort()
	]);

	const visible = $derived(data.sets.filter((set) => {
		const q = search.trim().toLowerCase();
		const matchesSearch =
			!q ||
			`${set.year} ${set.name} ${set.manufacturer_name} ${set.sport_name}`
				.toLowerCase()
				.includes(q);

		return (
			matchesSearch &&
			(sport === 'All sports' || set.sport_name === sport) &&
			(year === 'All years' || String(set.year) === year) &&
			(manufacturer === 'All brands' || set.manufacturer_name === manufacturer)
		);
	}));

	function clearFilters() {
		search = '';
		sport = 'All sports';
		year = 'All years';
		manufacturer = 'All brands';
	}
</script>

<svelte:head><title>Sets — setbound</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Browse the library</div>
			<h1>Card sets</h1>
			<p>Explore every checklist in Setbound by sport, year, brand, or product.</p>
		</div>
		<div class="count">
			<strong>{visible.length}</strong>
			<span>{visible.length === 1 ? 'set' : 'sets'} shown</span>
		</div>
	</div>

	<div class="filters">
		<label class="search">
			<span>Search</span>
			<input class="input" bind:value={search} placeholder="Search sets, brands, years…" />
		</label>

		<label>
			<span>Year</span>
			<select class="input" bind:value={year}>
				{#each years as option}<option>{option}</option>{/each}
			</select>
		</label>

		<label>
			<span>Brand</span>
			<select class="input" bind:value={manufacturer}>
				{#each manufacturers as option}<option>{option}</option>{/each}
			</select>
		</label>
	</div>

	<div class="sport-bar">
		<div class="sport-list" aria-label="Filter by sport">
			{#each sports as option}
				<button class:active={sport === option} onclick={() => sport = option}>
					{option}
					{#if option !== 'All sports'}
						<span>{data.sets.filter((set) => set.sport_name === option).length}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if search || sport !== 'All sports' || year !== 'All years' || manufacturer !== 'All brands'}
			<button class="clear" onclick={clearFilters}>Clear filters ×</button>
		{/if}
	</div>

	{#if visible.length}
		<div class="grid">
			{#each visible as set}
				<SetCard {set} />
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>No sets match those filters.</strong>
			<button onclick={clearFilters}>Show everything</button>
		</div>
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:5rem}
	.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;margin-bottom:2.25rem}
	.hero h1{font-family:var(--display,Georgia,serif);font-size:clamp(3rem,7vw,5.8rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.35rem 0 .8rem}
	.hero p{margin:0;color:var(--muted);font-size:1rem}
	.count{text-align:right;padding-bottom:.35rem}
	.count strong,.count span{display:block}
	.count strong{font-size:2.1rem;letter-spacing:-.05em}
	.count span{color:var(--muted);font-size:.75rem;font-weight:750}
	.filters{display:grid;grid-template-columns:minmax(260px,1fr) 180px 220px;gap:.75rem;padding:1rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
	.filters label{display:grid;gap:.35rem}
	.filters label>span{font-size:.66rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
	.sport-bar{min-height:4.2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
	.sport-list{display:flex;gap:.45rem;flex-wrap:wrap}
	.sport-list button{display:flex;align-items:center;gap:.45rem;border:1px solid var(--line);background:white;border-radius:999px;padding:.55rem .8rem;font:inherit;font-size:.75rem;font-weight:800;cursor:pointer;transition:.16s ease}
	.sport-list button:hover{border-color:var(--ink)}
	.sport-list button.active{background:var(--ink);border-color:var(--ink);color:white}
	.sport-list span{display:grid;place-items:center;min-width:1.25rem;height:1.25rem;padding:0 .3rem;border-radius:999px;background:rgba(127,123,130,.12);font-size:.64rem}
	.sport-list button.active span{background:rgba(255,255,255,.16)}
	.clear{border:0;background:transparent;color:var(--blue);font:inherit;font-size:.72rem;font-weight:850;cursor:pointer;white-space:nowrap}
	.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.1rem}
	.empty{border:1px dashed var(--line-strong);border-radius:1rem;padding:5rem 1rem;text-align:center;color:var(--muted);display:grid;justify-items:center;gap:.75rem}
	.empty button{border:0;background:transparent;color:var(--blue);font-weight:850;cursor:pointer}
	@media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.filters{grid-template-columns:1fr 160px}.filters label:last-child{grid-column:1/-1}}
	@media(max-width:620px){.hero{align-items:flex-start;flex-direction:column}.count{text-align:left}.filters{grid-template-columns:1fr}.filters label:last-child{grid-column:auto}.sport-bar{align-items:flex-start;flex-direction:column;padding:1rem 0}.grid{grid-template-columns:1fr}}
</style>
