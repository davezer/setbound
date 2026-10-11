<script>
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();

	let search = $state(data.q || '');
	let sport = $state(data.requestedSport || 'All sports');
	let year = $state(data.requestedYear || 'All years');
	let manufacturer = $state(data.requestedBrand || 'All brands');
	let sort = $state('Newest year');

	const sports = $derived(['All sports', ...[...new Set(data.sets.map((set) => set.sport_name).filter(Boolean))].sort()]);
	const years = $derived(['All years', ...[...new Set(data.sets.map((set) => Number(set.year)).filter(Boolean))].sort((a,b)=>b-a).map(String)]);
	const manufacturers = $derived(['All brands', ...[...new Set(data.sets.map((set) => set.manufacturer_name).filter(Boolean))].sort()]);

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();

		const filtered = data.sets.filter((set) => (
			(!q || `${set.year} ${set.name} ${set.manufacturer_name} ${set.sport_name}`.toLowerCase().includes(q)) &&
			(sport === 'All sports' || set.sport_name === sport) &&
			(year === 'All years' || String(set.year) === year) &&
			(manufacturer === 'All brands' || set.manufacturer_name === manufacturer)
		));

		return [...filtered].sort((a,b) => {
			if (sort === 'A–Z') return a.name.localeCompare(b.name);
			if (sort === 'Most cards') return Number(b.card_count || 0) - Number(a.card_count || 0);
			if (sort === 'Fewest cards') return Number(a.card_count || 0) - Number(b.card_count || 0);
			return Number(b.year) - Number(a.year) || a.name.localeCompare(b.name);
		});
	});

	function clearFilters() {
		search = '';
		sport = 'All sports';
		year = 'All years';
		manufacturer = 'All brands';
		sort = 'Newest year';
	}
</script>

<svelte:head><title>Sets — setbound</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Browse</div>
			<h1>Card sets</h1>
		</div>
		<div class="count"><strong>{visible.length}</strong><span>{visible.length === 1 ? 'set' : 'sets'} shown</span></div>
	</div>

	<div class="filters">
		<label class="search"><span>Search</span><input class="input" bind:value={search} placeholder="Search sets, brands, years…" /></label>
		<label><span>Year</span><select class="input" bind:value={year}>{#each years as option}<option>{option}</option>{/each}</select></label>
		<label><span>Brand</span><select class="input" bind:value={manufacturer}>{#each manufacturers as option}<option>{option}</option>{/each}</select></label>
		<label><span>Sort</span><select class="input" bind:value={sort}><option>Newest year</option><option>A–Z</option><option>Most cards</option><option>Fewest cards</option></select></label>
	</div>

	<div class="sport-bar">
		<div class="sport-list">
			{#each sports as option}
				<button class:active={sport === option} onclick={() => sport = option}>
					{option}
					{#if option !== 'All sports'}<span>{data.sets.filter((set) => set.sport_name === option).length}</span>{/if}
				</button>
			{/each}
		</div>

		{#if search || sport !== 'All sports' || year !== 'All years' || manufacturer !== 'All brands' || sort !== 'Newest year'}
			<button class="clear" onclick={clearFilters}>Clear filters ×</button>
		{/if}
	</div>

	{#if visible.length}
		<div class="grid">{#each visible as set}<SetCard {set} />{/each}</div>
	{:else}
		<div class="empty"><strong>No sets match those filters.</strong><button onclick={clearFilters}>Show everything</button></div>
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:5rem}.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;margin-bottom:2rem}.hero h1{font-family:var(--display);font-size:clamp(3rem,7vw,5.8rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.35rem 0}.count{text-align:right}.count strong,.count span{display:block}.count strong{font-size:2rem}.count span{font-size:.72rem;color:var(--muted)}
	.filters{display:grid;grid-template-columns:minmax(260px,1fr) 150px 200px 180px;gap:.7rem;padding:1rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.filters label{display:grid;gap:.3rem}.filters label>span{font-size:.61rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.sport-bar{min-height:4.2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}.sport-list{display:flex;gap:.45rem;flex-wrap:wrap}.sport-list button{display:flex;align-items:center;gap:.4rem;border:1px solid var(--line);background:white;border-radius:999px;padding:.55rem .8rem;font:inherit;font-size:.73rem;font-weight:800;cursor:pointer}.sport-list button.active{background:var(--ink);border-color:var(--ink);color:white}.sport-list span{font-size:.62rem;opacity:.65}.clear{border:0;background:transparent;color:var(--blue);font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.empty{border:1px dashed var(--line-strong);border-radius:1rem;padding:5rem 1rem;text-align:center;color:var(--muted);display:grid;justify-items:center;gap:.75rem}.empty button{border:0;background:transparent;color:var(--blue);font-weight:850;cursor:pointer}
	@media(max-width:1000px){.filters{grid-template-columns:1fr 1fr}.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.hero,.sport-bar{align-items:flex-start;flex-direction:column}.count{text-align:left}.filters{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.sport-bar{padding:1rem 0}}
</style>
