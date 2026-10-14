<script>
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();

	let search = $state(data.q || '');
	let year = $state(data.requestedYear || 'All years');
	let manufacturer = $state(data.requestedBrand || 'All brands');
	let sort = $state('Newest year');

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

	const yearGroups = $derived.by(() => {
		const q = search.trim().toLowerCase();

		const filtered = data.sets.filter((set) => (
			(!q || `${set.year} ${set.name} ${set.manufacturer_name}`.toLowerCase().includes(q)) &&
			(year === 'All years' || String(set.year) === year) &&
			(manufacturer === 'All brands' || set.manufacturer_name === manufacturer)
		));

		const map = new Map();

		for (const set of filtered) {
			const key = String(set.year);
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(set);
		}

		for (const sets of map.values()) {
			sets.sort((a, b) => {
				if (sort === 'Most cards') return Number(b.card_count || 0) - Number(a.card_count || 0) || a.name.localeCompare(b.name);
				return a.name.localeCompare(b.name);
			});
		}

		return [...map.entries()].sort(([a], [b]) =>
			sort === 'Oldest year' ? Number(a) - Number(b) : Number(b) - Number(a)
		);
	});

	const visibleCount = $derived(yearGroups.reduce((sum, [, sets]) => sum + sets.length, 0));

	function clearFilters() {
		search = '';
		year = 'All years';
		manufacturer = 'All brands';
		sort = 'Newest year';
	}
</script>

<svelte:head>
	<title>{data.sport.name} Card Sets & Checklists | Setbound</title>
	<meta
		name="description"
		content={`Browse ${data.sport.name.toLowerCase()} card checklists by year and manufacturer on Setbound.`}
	/>
	<meta name="robots" content="index,follow" />
	<link rel="canonical" href={`https://setbound.app/sets/sport/${data.sport.slug}`} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={`${data.sport.name} Card Sets & Checklists | Setbound`} />
	<meta
		property="og:description"
		content={`Browse complete ${data.sport.name.toLowerCase()} card checklists by year and manufacturer.`}
	/>
	<meta property="og:url" content={`https://setbound.app/sets/sport/${data.sport.slug}`} />
</svelte:head>

<section class="shell page">
	<div class="crumb"><a href="/sets">Sets</a><span>/</span>{data.sport.name}</div>

	<header class="hero">
		<div>
			<div class="eyebrow">Set library</div>
			<h1>{data.sport.name}</h1>
			<p>Browse every published {data.sport.name.toLowerCase()} checklist in Setbound.</p>
		</div>

		<div class="count">
			<strong>{visibleCount.toLocaleString()}</strong>
			<span>{visibleCount === 1 ? 'set' : 'sets'} shown</span>
		</div>
	</header>

	<section class="filters">
		<label class="search">
			<span>Search {data.sport.name}</span>
			<input class="input" bind:value={search} placeholder="Set, brand, year…" />
		</label>

		<label>
			<span>Year</span>
			<select class="input" bind:value={year}>
				{#each years as option}<option>{option}</option>{/each}
			</select>
		</label>

		<label>
			<span>Manufacturer</span>
			<select class="input" bind:value={manufacturer}>
				{#each manufacturers as option}<option>{option}</option>{/each}
			</select>
		</label>

		<label>
			<span>Sort</span>
			<select class="input" bind:value={sort}>
				<option>Newest year</option>
				<option>Oldest year</option>
				<option>A–Z</option>
				<option>Most cards</option>
			</select>
		</label>
	</section>

	<div class="filter-foot">
		<div class="year-jump">
			{#each years.filter((option) => option !== 'All years') as option}
				<button class:active={year === option} onclick={() => year = year === option ? 'All years' : option}>
					{option}
				</button>
			{/each}
		</div>

		{#if search || year !== 'All years' || manufacturer !== 'All brands' || sort !== 'Newest year'}
			<button class="clear" onclick={clearFilters}>Clear filters ×</button>
		{/if}
	</div>

	{#if yearGroups.length}
		<div class="library">
			{#each yearGroups as [groupYear, sets]}
				<section class="year-section">
					<header class="year-head">
						<h2>{groupYear}</h2>
						<span>{sets.length} {sets.length === 1 ? 'set' : 'sets'}</span>
					</header>

					<div class="grid">
						{#each sets as set}
							<SetCard {set} />
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>No {data.sport.name.toLowerCase()} sets match those filters.</strong>
			<button onclick={clearFilters}>Show everything</button>
		</div>
	{/if}
</section>

<style>
	.page{padding-top:2.5rem;padding-bottom:6rem}.crumb{display:flex;gap:.5rem;align-items:center;color:var(--muted);font-size:.68rem;margin-bottom:2rem}.crumb a{color:var(--blue);font-weight:850;text-decoration:none}
	.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}.hero h1{font-family:var(--display);font-size:clamp(3.6rem,8vw,6.8rem);font-weight:500;letter-spacing:-.065em;line-height:.88;margin:.4rem 0 .8rem}.hero p{margin:0;color:var(--muted)}.count{text-align:right}.count strong,.count span{display:block}.count strong{font-size:2.1rem}.count span{font-size:.7rem;color:var(--muted)}
	.filters{display:grid;grid-template-columns:minmax(280px,1fr) 145px 200px 170px;gap:.7rem;padding:1rem 0;border-bottom:1px solid var(--line)}.filters label{display:grid;gap:.3rem}.filters label>span{font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.filter-foot{min-height:4.2rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}.year-jump{display:flex;gap:.4rem;flex-wrap:wrap}.year-jump button{border:1px solid var(--line);border-radius:999px;background:#fff;padding:.45rem .68rem;font:inherit;font-size:.68rem;font-weight:800;cursor:pointer}.year-jump button.active{background:var(--ink);border-color:var(--ink);color:#fff}.clear{border:0;background:transparent;color:var(--blue);font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}
	.library{display:grid;gap:3.2rem}.year-section{scroll-margin-top:1rem}.year-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:.85rem;padding-bottom:.65rem;border-bottom:1px solid var(--line)}.year-head h2{font-family:var(--display);font-size:2.4rem;font-weight:500;letter-spacing:-.04em;margin:0}.year-head span{color:var(--muted);font-size:.68rem}
	.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.empty{border:1px dashed var(--line-strong);border-radius:1rem;padding:5rem 1rem;text-align:center;color:var(--muted);display:grid;justify-items:center;gap:.75rem}.empty button{border:0;background:transparent;color:var(--blue);font-weight:850;cursor:pointer}
	@media(max-width:1000px){.filters{grid-template-columns:1fr 1fr}.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.hero,.filter-foot{align-items:flex-start;flex-direction:column}.count{text-align:left}.filters{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.filter-foot{padding:1rem 0}}
</style>
