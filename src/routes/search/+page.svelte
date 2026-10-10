<script>
	import SearchBox from '$lib/components/SearchBox.svelte';

	let { data } = $props();

	const total = $derived(
		data.sets.length +
		data.subjects.length +
		data.affiliations.length +
		data.cards.length
	);

	function cardProductLabel(card) {
		const manufacturer = String(card.manufacturer_name || '').trim();
		const product = String(card.product_name || '').trim();

		const alreadyStartsWithManufacturer =
			manufacturer &&
			product.toLowerCase().startsWith(manufacturer.toLowerCase());

		return alreadyStartsWithManufacturer
			? `${card.year} ${product}`
			: `${card.year} ${manufacturer} ${product}`;
	}
</script>

<svelte:head><title>Search — setbound</title></svelte:head>

<section class="shell page">
	<div class="eyebrow">Search</div>
	<h1>Find it.</h1>

	<div class="search">
		<SearchBox large value={data.q} />
	</div>

	{#if data.q}
		<div class="summary">
			{total} result{total === 1 ? '' : 's'} shown for “{data.q}”
		</div>

		{#if data.sets.length}
			<section class="group">
				<div class="group-head">
					<h2>Sets</h2>
					<span>{data.sets.length}</span>
				</div>

				<div class="set-results">
					{#each data.sets as set}
						<a href={`/sets/${set.slug}`}>
							<div class="thumb">
								{#if set.image_key}
									<img src={`/media/set/${set.slug}`} alt="" />
								{/if}
							</div>

							<div>
								<span>{set.year} · {set.manufacturer_name} · {set.sport_name}</span>
								<strong>{set.name}</strong>
								<small>{Number(set.card_count).toLocaleString()} cards</small>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.subjects.length}
			<section class="group">
				<div class="group-head">
					<h2>Players & subjects</h2>
					<span>{data.subjects.length}</span>
				</div>

				<div class="chips">
					{#each data.subjects as subject}
						<a href={`/search?q=${encodeURIComponent(subject.name)}`}>
							<strong>{subject.name}</strong>
							<span>{subject.card_count} cards · {subject.set_count} sets</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.affiliations.length}
			<section class="group">
				<div class="group-head">
					<h2>Teams & affiliations</h2>
					<span>{data.affiliations.length}</span>
				</div>

				<div class="chips">
					{#each data.affiliations as affiliation}
						<a href={`/search?q=${encodeURIComponent(affiliation.name)}`}>
							<strong>{affiliation.name}</strong>
							<span>{affiliation.card_count} cards · {affiliation.set_count} sets</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.cards.length}
			<section class="group">
				<div class="group-head">
					<h2>Cards</h2>
					<span>{data.cards.length}</span>
				</div>

				<div class="cards">
					{#each data.cards as card}
						<a href={`/sets/${card.slug}?q=${encodeURIComponent(card.card_number)}`}>
							<div class="number">{card.card_number}</div>

							<div>
								<strong>{card.subject_name}</strong>
								<span>{card.affiliation_name}</span>
							</div>

							<div class="where">
								<strong>{cardProductLabel(card)}</strong>
								<span>{card.checklist_name}</span>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if total === 0}
			<div class="empty">Nothing matched “{data.q}”.</div>
		{/if}
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:6rem}
	.page>h1{font-family:var(--display);font-size:clamp(3.5rem,7vw,6rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 1.5rem}
	.search{max-width:850px}
	.summary{margin:1rem 0 2rem;color:var(--muted);font-size:.8rem}
	.group{margin:2.2rem 0}
	.group-head{display:flex;align-items:baseline;gap:.55rem;border-bottom:1px solid var(--line);padding-bottom:.55rem}
	.group-head h2{margin:0;font-size:1.35rem}
	.group-head span{color:var(--muted);font-size:.72rem}
	.set-results{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem;margin-top:.9rem}
	.set-results a{display:grid;grid-template-columns:90px 1fr;gap:.8rem;align-items:center;border:1px solid var(--line);border-radius:.8rem;padding:.65rem;text-decoration:none;color:inherit}
	.thumb{width:90px;aspect-ratio:16/10;border-radius:.55rem;background:#f2f1ef;overflow:hidden}
	.thumb img{width:100%;height:100%;object-fit:cover}
	.set-results strong,.set-results span,.set-results small{display:block}
	.set-results span{color:var(--blue);font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}
	.set-results strong{margin:.2rem 0;font-size:.85rem}
	.set-results small{color:var(--muted)}
	.chips{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.8rem}
	.chips a{border:1px solid var(--line);border-radius:.7rem;padding:.6rem .75rem;text-decoration:none;color:inherit;display:grid;gap:.15rem}
	.chips strong{font-size:.8rem}
	.chips span{font-size:.68rem;color:var(--muted)}
	.cards{border:1px solid var(--line);border-radius:1rem;overflow:hidden;background:white}
	.cards a{display:grid;grid-template-columns:100px 1fr 1.4fr;gap:1rem;align-items:center;padding:.85rem 1rem;text-decoration:none;color:inherit;border-bottom:1px solid var(--line)}
	.cards a:hover{background:#fafafa}
	.number{font-weight:900;color:var(--blue)}
	.cards strong,.cards span{display:block}
	.cards span{color:var(--muted);font-size:.72rem}
	.where{text-align:right}
	.where strong{font-size:.78rem}
	.empty{border:1px dashed var(--line-strong);border-radius:1rem;padding:4rem 1rem;text-align:center;color:var(--muted)}
	@media(max-width:850px){.set-results{grid-template-columns:1fr 1fr}}
	@media(max-width:620px){.set-results{grid-template-columns:1fr}.cards a{grid-template-columns:75px 1fr}.where{grid-column:2;text-align:left}}
</style>
