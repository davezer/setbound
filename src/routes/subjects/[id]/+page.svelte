<script>
	let { data } = $props();

	let query = $state('');
	let year = $state('All years');
	let set = $state('All sets');
	let team = $state('All affiliations');
	let status = $state('All cards');

	const years = $derived(['All years', ...[...new Set(data.cards.map((card) => String(card.year)))].sort((a,b) => Number(b)-Number(a))]);
	const sets = $derived(['All sets', ...[...new Set(data.cards.map((card) => `${card.year} ${card.product_name}`))]]);
	const teams = $derived(['All affiliations', ...[...new Set(data.cards.map((card) => card.affiliation_name))].sort()]);

	const visible = $derived(
		data.cards.filter((card) => {
			const q = query.trim().toLowerCase();
			return (
				(!q || `${card.card_number} ${card.product_name} ${card.checklist_name} ${card.affiliation_name}`.toLowerCase().includes(q)) &&
				(year === 'All years' || String(card.year) === year) &&
				(set === 'All sets' || `${card.year} ${card.product_name}` === set) &&
				(team === 'All affiliations' || card.affiliation_name === team) &&
				(status === 'All cards' || card.collection_status === status)
			);
		})
	);
</script>

<svelte:head><title>{data.subject.name} cards — setbound</title></svelte:head>

<section class="shell page">
	<div class="crumb"><a href="/search">Search</a><span>/</span>Subject</div>

	<div class="hero">
		<div>
			<div class="eyebrow">{data.subject.subject_type}</div>
			<h1>{data.subject.name}</h1>
		</div>

		<div class="stats">
			<div><strong>{data.stats.cards.toLocaleString()}</strong><span>cards</span></div>
			<div><strong>{data.stats.sets}</strong><span>sets</span></div>
			<div><strong>{data.stats.teams}</strong><span>affiliations</span></div>
			{#if data.stats.owned || data.stats.wanted}
				<div><strong>{data.stats.owned}</strong><span>owned</span></div>
			{/if}
		</div>
	</div>

	<div class="filters">
		<label class="search"><span>Find</span><input class="input" bind:value={query} placeholder="Card number, set, checklist…" /></label>
		<label><span>Year</span><select class="input" bind:value={year}>{#each years as option}<option>{option}</option>{/each}</select></label>
		<label><span>Set</span><select class="input" bind:value={set}>{#each sets as option}<option>{option}</option>{/each}</select></label>
		<label><span>Affiliation</span><select class="input" bind:value={team}>{#each teams as option}<option>{option}</option>{/each}</select></label>
		{#if data.cards.some((card) => card.collection_status)}
			<label><span>Collection</span><select class="input" bind:value={status}><option>All cards</option><option value="owned">Owned</option><option value="wanted">Wanted</option></select></label>
		{/if}
	</div>

	<div class="result-count">{visible.length.toLocaleString()} cards shown</div>

	<div class="cards">
		{#each visible as card}
			<a href={`/sets/${card.slug}?q=${encodeURIComponent(card.card_number)}`}>
				<div class="number">{card.card_number}</div>
				<div class="identity">
					<strong>{card.year} {card.manufacturer_name} {card.product_name}</strong>
					<span>{card.checklist_name}</span>
				</div>
				<div class="affiliation">{card.affiliation_name}</div>
				<div class="tags">
					{#if card.rookie}<span>RC</span>{/if}
					{#if card.autograph}<span>AU</span>{/if}
					{#if card.memorabilia}<span>MEM</span>{/if}
					{#if card.serial_number}<span>/{card.serial_number}</span>{/if}
					{#if card.collection_status === 'owned'}<span class="owned">Owned</span>{/if}
					{#if card.collection_status === 'wanted'}<span class="wanted">Wanted</span>{/if}
				</div>
				<span class="arrow">→</span>
			</a>
		{/each}
	</div>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}.crumb{display:flex;gap:.45rem;color:var(--muted);font-size:.74rem}.crumb a{color:inherit}
	.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;padding:2.1rem 0;border-bottom:1px solid var(--line)}
	h1{font-family:var(--display);font-size:clamp(3rem,7vw,5.8rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.4rem 0 0}
	.stats{display:flex;gap:1.5rem}.stats div{display:grid}.stats strong{font-size:1.25rem}.stats span{font-size:.66rem;color:var(--muted)}
	.filters{display:grid;grid-template-columns:minmax(260px,1fr) 130px 230px 220px 140px;gap:.65rem;padding:1rem 0;border-bottom:1px solid var(--line)}.filters label{display:grid;gap:.3rem}.filters label>span{font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.result-count{padding:.8rem 0;color:var(--muted);font-size:.7rem}
	.cards{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:white}.cards a{display:grid;grid-template-columns:90px 1.4fr 1fr 1fr 24px;gap:1rem;align-items:center;padding:.78rem .9rem;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.cards a:hover{background:#fafafa}
	.number{color:var(--blue);font-weight:900}.identity strong,.identity span{display:block}.identity span{margin-top:.1rem;color:var(--muted);font-size:.69rem}.affiliation{font-size:.76rem}.tags{display:flex;gap:.25rem;flex-wrap:wrap}.tags span{background:#f3f2f1;border-radius:.3rem;padding:.2rem .3rem;font-size:.58rem;font-weight:900}.tags .owned{background:rgba(64,121,140,.12);color:var(--blue)}.tags .wanted{background:rgba(238,150,75,.14);color:#9a5319}.arrow{text-align:right}
	@media(max-width:1000px){.filters{grid-template-columns:1fr 1fr}.cards a{grid-template-columns:75px 1fr 1fr 24px}.tags{grid-column:2/4}.arrow{grid-column:4;grid-row:1/3}}
	@media(max-width:650px){.hero{align-items:flex-start;flex-direction:column}.stats{flex-wrap:wrap}.filters{grid-template-columns:1fr}.cards a{grid-template-columns:60px 1fr 24px}.affiliation,.tags{grid-column:2}.arrow{grid-column:3}}
</style>
