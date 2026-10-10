<script>
	import { invalidateAll } from '$app/navigation';
	import { getOwned } from '$lib/client/collection.js';

	let { data } = $props();
	let tab = $state('sets');
	let syncing = $state(false);
	let syncMessage = $state('');

	async function importBrowserCollection() {
		const cardIds = [...getOwned()];
		if (!cardIds.length) {
			syncMessage = 'No browser-only cards found on this device.';
			return;
		}

		syncing = true;
		syncMessage = '';

		try {
			const response = await fetch('/api/collection/import-browser', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cardIds })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not import browser collection.');
			syncMessage = `${result.imported.toLocaleString()} card${result.imported === 1 ? '' : 's'} moved into your account.`;
			await invalidateAll();
		} catch (error) {
			syncMessage = error?.message || 'Could not import browser collection.';
		} finally {
			syncing = false;
		}
	}
</script>

<svelte:head><title>My collection — setbound</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">My collection</div>
			<h1>Your cards.</h1>
		</div>

		<div class="totals">
			<div><strong>{data.totals.owned.toLocaleString()}</strong><span>owned</span></div>
			<div><strong>{data.totals.wanted.toLocaleString()}</strong><span>wanted</span></div>
			<div><strong>{data.totals.sets}</strong><span>active sets</span></div>
		</div>
	</div>

	<div class="tools">
		<div class="tabs">
			<button class:active={tab === 'sets'} onclick={() => tab = 'sets'}>Sets</button>
			<button class:active={tab === 'wanted'} onclick={() => tab = 'wanted'}>Want list <span>{data.wanted.length}</span></button>
		</div>

		<button class="browser-import" disabled={syncing} onclick={importBrowserCollection}>
			{syncing ? 'Importing…' : 'Import browser-only cards'}
		</button>
	</div>

	{#if syncMessage}<div class="sync-message">{syncMessage}</div>{/if}

	{#if tab === 'sets'}
		{#if data.sets.length}
			<div class="set-grid">
				{#each data.sets as set}
					<a href={`/sets/${set.slug}`} class="set-card">
						<div class="image">
							{#if set.image_key}
								<img src={`/media/set/${set.slug}`} alt={`${set.year} ${set.name}`} />
							{:else}
								<div class="fallback"></div>
							{/if}
						</div>

						<div class="copy">
							<div class="meta"><span>{set.manufacturer_name}</span><span>{set.year}</span></div>
							<h2>{set.name}</h2>

							<div class="progress-copy">
								<strong>{set.owned_cards.toLocaleString()} / {set.total_cards.toLocaleString()}</strong>
								<span>{set.total_cards ? Math.round(set.owned_cards / set.total_cards * 100) : 0}% complete</span>
							</div>

							<div class="bar"><i style={`width:${set.total_cards ? set.owned_cards / set.total_cards * 100 : 0}%`}></i></div>

							<div class="foot">
								<span>{set.wanted_cards ? `${set.wanted_cards} wanted` : 'No want-list cards'}</span>
								<strong>→</strong>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">
				<h2>No cards saved yet.</h2>
				<p>Open a set and start marking cards you have or want.</p>
				<a href="/sets">Browse sets →</a>
			</div>
		{/if}
	{:else}
		{#if data.wanted.length}
			<div class="wanted-list">
				{#each data.wanted as card}
					<a href={`/sets/${card.slug}?q=${encodeURIComponent(card.card_number)}`}>
						<div class="number">{card.card_number}</div>
						<div class="subject"><strong>{card.subject_name}</strong><span>{card.affiliation_name}</span></div>
						<div class="where"><strong>{card.year} {card.manufacturer_name} {card.product_name}</strong><span>{card.checklist_name}</span></div>
						<span class="arrow">→</span>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">
				<h2>Your want list is empty.</h2>
				<p>Mark cards as “Want” from any checklist and they’ll show up here.</p>
			</div>
		{/if}
	{/if}
</section>

<style>
.page{padding-top:4rem;padding-bottom:6rem}.hero{display:flex;align-items:end;justify-content:space-between;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}h1{font-family:var(--display);font-size:clamp(3.5rem,7vw,6rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 0}.totals{display:flex;gap:2rem}.totals div{display:grid}.totals strong{font-size:1.45rem}.totals span{font-size:.7rem;color:var(--muted)}
.tools{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0 1.4rem}.tabs{display:flex;gap:.35rem}.tabs button{border:0;background:transparent;border-radius:999px;padding:.6rem .85rem;font:inherit;font-size:.78rem;font-weight:850;cursor:pointer}.tabs button.active{background:var(--ink);color:white}.tabs span{opacity:.65;margin-left:.2rem}.browser-import{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.6rem .8rem;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer}.sync-message{padding:.75rem 0;color:var(--blue);font-size:.78rem;font-weight:750}
.set-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.set-card{overflow:hidden;border:1px solid var(--line);border-radius:1rem;background:#fff;color:inherit;text-decoration:none;transition:.18s ease}.set-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(18,16,14,.07)}.image{aspect-ratio:16/8.4;background:#f2f1ef;overflow:hidden}.image img{width:100%;height:100%;object-fit:cover}.fallback{height:100%;background:linear-gradient(135deg,#f4f2ef,#ebe8e4)}.copy{padding:1rem}.meta{display:flex;justify-content:space-between;color:var(--blue);font-size:.63rem;font-weight:900;text-transform:uppercase;letter-spacing:.09em}.copy h2{font-size:1.18rem;margin:.45rem 0 1.4rem}.progress-copy{display:flex;justify-content:space-between;gap:1rem;font-size:.74rem}.progress-copy span{color:var(--muted)}.bar{height:5px;background:var(--soft);border-radius:5px;margin:.65rem 0 1rem;overflow:hidden}.bar i{display:block;height:100%;background:var(--orange)}.foot{display:flex;justify-content:space-between;padding-top:.8rem;border-top:1px solid var(--line);font-size:.7rem;color:var(--muted)}.foot strong{color:var(--ink)}
.wanted-list{border:1px solid var(--line);border-radius:1rem;overflow:hidden;background:#fff}.wanted-list a{display:grid;grid-template-columns:100px 1fr 1.4fr 30px;gap:1rem;align-items:center;padding:.9rem 1rem;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.wanted-list a:hover{background:#fafafa}.number{font-weight:900;color:var(--blue)}.subject strong,.subject span,.where strong,.where span{display:block}.subject span,.where span{color:var(--muted);font-size:.72rem;margin-top:.15rem}.where{text-align:right}.where strong{font-size:.78rem}.arrow{text-align:right}
.empty{text-align:center;border:1px dashed var(--line-strong);border-radius:1rem;padding:5rem 1rem}.empty h2{margin:0 0 .5rem}.empty p{color:var(--muted)}.empty a{color:var(--blue);font-weight:800}
@media(max-width:900px){.set-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.hero{align-items:flex-start;flex-direction:column}.totals{gap:1.2rem}.tools{align-items:flex-start;flex-direction:column}.set-grid{grid-template-columns:1fr}.wanted-list a{grid-template-columns:75px 1fr 24px}.where{grid-column:2;text-align:left}.arrow{grid-row:1/3;grid-column:3}}
</style>
