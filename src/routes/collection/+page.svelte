<script>
	import { invalidateAll } from '$app/navigation';
	import { getOwned } from '$lib/client/collection.js';

	let { data, form } = $props();

	let tab = $state('sets');
	let setView = $state('all');
	let query = $state('');
	let syncing = $state(false);
	let syncMessage = $state('');
	let sharingOpen = $state(false);

	const visibleSets = $derived(
		data.sets.filter((set) => {
			const q = query.trim().toLowerCase();
			const matchesQuery =
				!q ||
				`${set.year} ${set.name} ${set.manufacturer_name} ${set.sport_name}`
					.toLowerCase()
					.includes(q);

			const matchesView =
				setView === 'all' ||
				(setView === 'incomplete' && set.owned_cards < set.total_cards) ||
				(setView === 'complete' && set.total_cards > 0 && set.owned_cards >= set.total_cards);

			return matchesQuery && matchesView;
		})
	);

	const currentCards = $derived(tab === 'owned' ? data.owned : data.wanted);

	const visibleCards = $derived(
		currentCards.filter((card) => {
			const q = query.trim().toLowerCase();
			return (
				!q ||
				`${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.product_name} ${card.checklist_name}`
					.toLowerCase()
					.includes(q)
			);
		})
	);

	const suggestedHandle = $derived.by(() => {
		if (data.profile.public_handle) return data.profile.public_handle;

		const base = String(data.profile.display_name || data.profile.email?.split('@')[0] || 'collector')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');

		return base.length >= 3 ? base.slice(0, 32) : `collector-${data.profile.id}`;
	});

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
			<div><strong>{data.totals.incomplete}</strong><span>sets in progress</span></div>
		</div>
	</div>

	<div class="toolbar">
		<div class="tabs">
			<button class:active={tab === 'sets'} onclick={() => { tab = 'sets'; query = ''; }}>Sets <span>{data.sets.length}</span></button>
			<button class:active={tab === 'owned'} onclick={() => { tab = 'owned'; query = ''; }}>Owned <span>{data.owned.length}</span></button>
			<button class:active={tab === 'wanted'} onclick={() => { tab = 'wanted'; query = ''; }}>Want list <span>{data.wanted.length}</span></button>
		</div>

		<div class="actions">
			<a href="/collection/export.csv">Export CSV</a>
			<button onclick={() => sharingOpen = !sharingOpen}>{data.profile.collection_public ? 'Sharing on' : 'Share collection'}</button>
			<button disabled={syncing} onclick={importBrowserCollection}>{syncing ? 'Importing…' : 'Import browser cards'}</button>
		</div>
	</div>

	{#if syncMessage}<div class="message">{syncMessage}</div>{/if}
	{#if form?.shareError}<div class="error">{form.shareError}</div>{/if}

	{#if sharingOpen}
		<section class="share-panel">
			<div>
				<div class="eyebrow">Sharing</div>
				<h2>Public collection</h2>
				<p>Turn this on only if you want anyone with the link to see your set progress and want list.</p>
			</div>

			<form method="POST" action="?/sharing">
				<label>
					<span>Public handle</span>
					<div class="handle-row">
						<span>setbound.app/collector/</span>
						<input name="public_handle" value={suggestedHandle} maxlength="32" />
					</div>
				</label>

				<label>
					<span>Profile note <em>optional</em></span>
					<textarea name="profile_bio" maxlength="240" placeholder="What do you collect?">{data.profile.profile_bio || ''}</textarea>
				</label>

				<label class="toggle">
					<input type="checkbox" name="collection_public" value="1" checked={data.profile.collection_public} />
					<span>Make my collection public</span>
				</label>

				<div class="share-actions">
					<button>Save sharing settings</button>
					{#if data.profile.collection_public && data.profile.public_handle}
						<a href={`/collector/${data.profile.public_handle}`} target="_blank" rel="noreferrer">View public page ↗</a>
					{/if}
				</div>
			</form>
		</section>
	{/if}

	<div class="filter-row">
		<label>
			<span>Find</span>
			<input class="input" bind:value={query} placeholder={tab === 'sets' ? 'Search your sets…' : 'Player, card number, team, set…'} />
		</label>

		{#if tab === 'sets'}
			<div class="view-switch">
				<button class:active={setView === 'all'} onclick={() => setView = 'all'}>All</button>
				<button class:active={setView === 'incomplete'} onclick={() => setView = 'incomplete'}>In progress</button>
				<button class:active={setView === 'complete'} onclick={() => setView = 'complete'}>Complete</button>
			</div>
		{/if}
	</div>

	{#if tab === 'sets'}
		{#if visibleSets.length}
			<div class="set-grid">
				{#each visibleSets as set}
					<a href={`/sets/${set.slug}`} class="set-card">
						<div class="image">
							{#if set.image_key}
								<img src={`/media/set/${set.slug}`} alt={`${set.year} ${set.name}`} />
							{:else}
								<div class="fallback"></div>
							{/if}

							{#if set.percent_complete === 100}
								<span class="complete-badge">Complete</span>
							{/if}
						</div>

						<div class="copy">
							<div class="meta"><span>{set.manufacturer_name} · {set.sport_name}</span><span>{set.year}</span></div>
							<h2>{set.name}</h2>

							<div class="progress-copy">
								<strong>{set.owned_cards.toLocaleString()} / {set.total_cards.toLocaleString()}</strong>
								<span>{set.percent_complete}%</span>
							</div>

							<div class="bar"><i style={`width:${set.percent_complete}%`}></i></div>

							<div class="set-foot">
								<span>{set.missing_cards.toLocaleString()} left</span>
								<span>{set.wanted_cards ? `${set.wanted_cards} wanted` : ''}</span>
								<strong>→</strong>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty"><h2>No sets match that view.</h2></div>
		{/if}
	{:else}
		{#if visibleCards.length}
			<div class="card-list">
				{#each visibleCards as card}
					<a href={`/sets/${card.slug}?q=${encodeURIComponent(card.card_number)}`}>
						<div class="number">{card.card_number}</div>

						<div class="subject">
							<strong>{card.subject_name}</strong>
							<span>{card.affiliation_name}</span>
						</div>

						<div class="tags">
							{#if card.rookie}<span>RC</span>{/if}
							{#if card.autograph}<span>AU</span>{/if}
							{#if card.memorabilia}<span>MEM</span>{/if}
						</div>

						<div class="where">
							<strong>{card.year} {card.manufacturer_name} {card.product_name}</strong>
							<span>{card.checklist_name}</span>
						</div>

						<span class="arrow">→</span>
					</a>
				{/each}
			</div>
		{:else}
			<div class="empty">
				<h2>{tab === 'owned' ? 'No owned cards match that search.' : 'Your want list is empty.'}</h2>
			</div>
		{/if}
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:6rem}
	.hero{display:flex;align-items:end;justify-content:space-between;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
	h1{font-family:var(--display);font-size:clamp(3.5rem,7vw,6rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 0}
	.totals{display:flex;gap:2rem}.totals div{display:grid}.totals strong{font-size:1.45rem}.totals span{font-size:.7rem;color:var(--muted)}
	.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 0}
	.tabs,.actions,.view-switch{display:flex;gap:.35rem;flex-wrap:wrap}
	.tabs button,.view-switch button{border:0;background:transparent;border-radius:999px;padding:.6rem .85rem;font:inherit;font-size:.76rem;font-weight:850;cursor:pointer}
	.tabs button.active,.view-switch button.active{background:var(--ink);color:white}
	.tabs span{opacity:.6;margin-left:.2rem}
	.actions a,.actions button{border:1px solid var(--line-strong);background:white;color:inherit;border-radius:.65rem;padding:.58rem .72rem;font:inherit;font-size:.69rem;font-weight:800;text-decoration:none;cursor:pointer}
	.message{padding:.7rem 0;color:var(--blue);font-size:.76rem;font-weight:750}.error{padding:.7rem .8rem;border:1px solid #efc2bb;background:#fff8f7;color:#8d3028;border-radius:.65rem}
	.share-panel{display:grid;grid-template-columns:.75fr 1.25fr;gap:2rem;padding:1.2rem 0 1.5rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
	.share-panel h2{margin:.25rem 0}.share-panel p{margin:.4rem 0;color:var(--muted);font-size:.78rem;line-height:1.5}
	.share-panel form{display:grid;gap:.8rem}.share-panel label{display:grid;gap:.35rem}.share-panel label>span{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
	.share-panel em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0}
	.handle-row{display:flex;align-items:center;border:1px solid var(--line-strong);border-radius:.65rem;overflow:hidden;background:white}.handle-row>span{padding:.65rem;background:#f6f5f3;color:var(--muted);font-size:.7rem}.handle-row input{flex:1;border:0;padding:.65rem;font:inherit;outline:none}
	.share-panel textarea{min-height:78px;border:1px solid var(--line-strong);border-radius:.65rem;padding:.7rem;font:inherit;resize:vertical}
	.toggle{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center}.toggle>span{text-transform:none!important;letter-spacing:0!important;color:var(--ink)!important;font-size:.74rem!important}
	.share-actions{display:flex;gap:.8rem;align-items:center}.share-actions button{border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.65rem .8rem;font:inherit;font-weight:850}.share-actions a{color:var(--blue);font-size:.72rem;font-weight:850}
	.filter-row{display:flex;justify-content:space-between;align-items:end;gap:1rem;padding:1rem 0 1.2rem}.filter-row label{display:grid;gap:.3rem;flex:1;max-width:620px}.filter-row label>span{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.set-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.set-card{overflow:hidden;border:1px solid var(--line);border-radius:1rem;background:#fff;color:inherit;text-decoration:none;transition:.18s ease}.set-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(18,16,14,.07)}
	.image{position:relative;aspect-ratio:16/8.4;background:#f2f1ef;overflow:hidden}.image img{width:100%;height:100%;object-fit:cover}.fallback{height:100%;background:linear-gradient(135deg,#f4f2ef,#ebe8e4)}.complete-badge{position:absolute;right:.7rem;top:.7rem;border-radius:999px;padding:.35rem .5rem;background:rgba(252,252,252,.92);font-size:.62rem;font-weight:900}
	.copy{padding:1rem}.meta{display:flex;justify-content:space-between;color:var(--blue);font-size:.61rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.copy h2{font-size:1.18rem;margin:.45rem 0 1.35rem}
	.progress-copy{display:flex;justify-content:space-between;font-size:.74rem}.progress-copy span{color:var(--muted)}.bar{height:5px;background:var(--soft);border-radius:5px;margin:.6rem 0 .9rem;overflow:hidden}.bar i{display:block;height:100%;background:var(--orange)}
	.set-foot{display:grid;grid-template-columns:1fr 1fr auto;gap:.5rem;padding-top:.8rem;border-top:1px solid var(--line);font-size:.68rem;color:var(--muted)}.set-foot strong{color:var(--ink)}
	.card-list{border:1px solid var(--line);border-radius:1rem;overflow:hidden;background:white}.card-list a{display:grid;grid-template-columns:90px 1fr auto 1.4fr 24px;gap:1rem;align-items:center;padding:.82rem 1rem;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}.card-list a:hover{background:#fafafa}
	.number{font-weight:900;color:var(--blue)}.subject strong,.subject span,.where strong,.where span{display:block}.subject span,.where span{margin-top:.12rem;color:var(--muted);font-size:.7rem}.where{text-align:right}.where strong{font-size:.76rem}.tags{display:flex;gap:.25rem}.tags span{background:#f3f2f1;border-radius:.3rem;padding:.2rem .3rem;font-size:.59rem;font-weight:900}.arrow{text-align:right}
	.empty{text-align:center;border:1px dashed var(--line-strong);border-radius:1rem;padding:4rem 1rem;color:var(--muted)}
	@media(max-width:950px){.set-grid{grid-template-columns:repeat(2,1fr)}.card-list a{grid-template-columns:75px 1fr auto 24px}.where{grid-column:2/4;text-align:left}.arrow{grid-column:4;grid-row:1/3}}
	@media(max-width:700px){.hero,.toolbar,.filter-row,.share-panel{align-items:flex-start;flex-direction:column}.share-panel{display:flex}.totals{gap:1.1rem}.set-grid{grid-template-columns:1fr}.actions{width:100%}.handle-row{align-items:stretch;flex-direction:column}.handle-row>span{border-bottom:1px solid var(--line)}}
</style>
