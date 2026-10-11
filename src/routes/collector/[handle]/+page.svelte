<script>
	let { data } = $props();
	let tab = $state('sets');

	const name = $derived(data.collector.display_name || `@${data.collector.public_handle}`);
</script>

<svelte:head><title>{name}'s collection — setbound</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Collector</div>
			<h1>{name}</h1>
			{#if data.collector.profile_bio}<p>{data.collector.profile_bio}</p>{/if}
		</div>

		<div class="stats">
			<div><strong>{data.totals.owned.toLocaleString()}</strong><span>owned</span></div>
			<div><strong>{data.totals.wanted.toLocaleString()}</strong><span>wanted</span></div>
			<div><strong>{data.totals.sets}</strong><span>active sets</span></div>
		</div>
	</div>

	<div class="tabs">
		<button class:active={tab === 'sets'} onclick={() => tab = 'sets'}>Sets</button>
		<button class:active={tab === 'wanted'} onclick={() => tab = 'wanted'}>Want list <span>{data.wanted.length}</span></button>
	</div>

	{#if tab === 'sets'}
		<div class="set-grid">
			{#each data.sets as set}
				<a href={`/sets/${set.slug}`} class="set-card">
					<div class="image">{#if set.image_key}<img src={`/media/set/${set.slug}`} alt={`${set.year} ${set.name}`} />{/if}</div>
					<div class="copy">
						<div class="meta"><span>{set.manufacturer_name}</span><span>{set.year}</span></div>
						<h2>{set.name}</h2>
						<div class="progress"><strong>{set.owned_cards} / {set.total_cards}</strong><span>{set.total_cards ? Math.round(set.owned_cards/set.total_cards*100) : 0}%</span></div>
						<div class="bar"><i style={`width:${set.total_cards ? set.owned_cards/set.total_cards*100 : 0}%`}></i></div>
						<div class="foot"><span>{set.wanted_cards ? `${set.wanted_cards} wanted` : ''}</span><strong>→</strong></div>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<div class="wanted">
			{#each data.wanted as card}
				<a href={`/sets/${card.slug}?q=${encodeURIComponent(card.card_number)}`}>
					<strong>{card.card_number}</strong>
					<div><b>{card.subject_name}</b><span>{card.affiliation_name}</span></div>
					<div class="where"><b>{card.year} {card.manufacturer_name} {card.product_name}</b><span>{card.checklist_name}</span></div>
					<span>→</span>
				</a>
			{/each}
		</div>
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:6rem}.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}h1{font-family:var(--display);font-size:clamp(3.5rem,7vw,6rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0}.hero p{max-width:620px;margin:.7rem 0 0;color:var(--muted)}
	.stats{display:flex;gap:1.5rem}.stats div{display:grid}.stats strong{font-size:1.35rem}.stats span{font-size:.68rem;color:var(--muted)}.tabs{display:flex;gap:.35rem;padding:1rem 0}.tabs button{border:0;background:transparent;border-radius:999px;padding:.6rem .85rem;font:inherit;font-size:.76rem;font-weight:850}.tabs button.active{background:var(--ink);color:white}.tabs span{opacity:.6}
	.set-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.set-card{overflow:hidden;border:1px solid var(--line);border-radius:1rem;text-decoration:none;color:inherit;background:white}.image{aspect-ratio:16/8.4;background:#f2f1ef}.image img{width:100%;height:100%;object-fit:cover}.copy{padding:1rem}.meta,.progress,.foot{display:flex;justify-content:space-between;gap:1rem}.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase}.copy h2{font-size:1.15rem;margin:.45rem 0 1.2rem}.progress{font-size:.72rem}.progress span,.foot{color:var(--muted)}.bar{height:5px;background:var(--soft);margin:.6rem 0 .9rem}.bar i{display:block;height:100%;background:var(--orange)}.foot{padding-top:.75rem;border-top:1px solid var(--line);font-size:.68rem}.foot strong{color:var(--ink)}
	.wanted{border:1px solid var(--line);border-radius:1rem;overflow:hidden}.wanted a{display:grid;grid-template-columns:100px 1fr 1.4fr 24px;gap:1rem;padding:.85rem 1rem;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.wanted a>strong{color:var(--blue)}.wanted b,.wanted span{display:block}.wanted span{color:var(--muted);font-size:.69rem}.where{text-align:right}
	@media(max-width:900px){.set-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.hero{align-items:flex-start;flex-direction:column}.set-grid{grid-template-columns:1fr}.wanted a{grid-template-columns:75px 1fr 24px}.where{grid-column:2;text-align:left}.wanted a>span{grid-column:3;grid-row:1/3}}
</style>
