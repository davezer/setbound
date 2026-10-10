<script>
	import { getOwned, setOwned } from '$lib/client/collection.js';

	let { data } = $props();

	let active = $state('All');
	let query = $state(data.initialQuery || '');
	let team = $state('All teams');
	let statusFilter = $state('All cards');
	let checklistBrowserOpen = $state(false);
	let checklistQuery = $state('');
	let scrollY = $state(0);
	let guestOwned = $state(new Set());
	let statuses = $state(new Map(data.cards.filter((c) => c.collection_status).map((c) => [String(c.id), c.collection_status])));
	let saving = $state(new Set());

	$effect(() => {
		if (!data.user) guestOwned = getOwned();
	});

	const teams = $derived([
		'All teams',
		...[...new Set(data.cards.map((card) => card.affiliation_name))].sort((a, b) => a.localeCompare(b))
	]);

	const activeChecklist = $derived(active === 'All' ? null : data.checklists.find((checklist) => checklist.name === active));
	const filteredChecklists = $derived(data.checklists.filter((checklist) => !checklistQuery || checklist.name.toLowerCase().includes(checklistQuery.toLowerCase())));

	function cardStatus(card) {
		if (data.user) return statuses.get(String(card.id)) || null;
		return guestOwned.has(String(card.id)) ? 'owned' : null;
	}

	const visible = $derived(data.cards.filter((card) => {
		const status = cardStatus(card);
		return (
			(active === 'All' || card.checklist_name === active) &&
			(team === 'All teams' || card.affiliation_name === team) &&
			(statusFilter === 'All cards' ||
				(statusFilter === 'Owned' && status === 'owned') ||
				(statusFilter === 'Wanted' && status === 'wanted') ||
				(statusFilter === 'Missing' && status !== 'owned')) &&
			(!query || `${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.checklist_name}`.toLowerCase().includes(query.toLowerCase()))
		);
	}));

	const visibleGroups = $derived.by(() => {
		const map = new Map();
		for (const card of visible) {
			if (!map.has(card.checklist_name)) map.set(card.checklist_name, []);
			map.get(card.checklist_name).push(card);
		}
		const order = new Map(data.checklists.map((checklist, index) => [checklist.name, index]));
		return [...map.entries()]
			.sort(([a], [b]) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999))
			.map(([name, cards]) => ({ name, cards, checklist: data.checklists.find((checklist) => checklist.name === name) }));
	});

	const ownedCount = $derived(data.cards.filter((card) => cardStatus(card) === 'owned').length);
	const wantedCount = $derived(data.cards.filter((card) => cardStatus(card) === 'wanted').length);

	function chooseChecklist(name) {
		active = name;
		checklistBrowserOpen = false;
		checklistQuery = '';
	}

	async function setStatus(cardId, nextStatus) {
		const key = String(cardId);

		if (!data.user) {
			if (nextStatus === 'wanted') {
				location.href = `/auth/register?next=${encodeURIComponent(location.pathname)}`;
				return;
			}
			const next = new Set(guestOwned);
			nextStatus === 'owned' ? next.add(key) : next.delete(key);
			guestOwned = next;
			setOwned(next);
			return;
		}

		const previous = statuses.get(key) || null;
		const nextMap = new Map(statuses);
		nextStatus ? nextMap.set(key, nextStatus) : nextMap.delete(key);
		statuses = nextMap;

		const busy = new Set(saving);
		busy.add(key);
		saving = busy;

		try {
			const response = await fetch(`/api/collection/${cardId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			if (!response.ok) throw new Error('Save failed');
		} catch {
			const rollback = new Map(statuses);
			previous ? rollback.set(key, previous) : rollback.delete(key);
			statuses = rollback;
		} finally {
			const done = new Set(saving);
			done.delete(key);
			saving = done;
		}
	}
</script>

<svelte:head><title>{data.product.year} {data.product.name} — setbound</title></svelte:head>
<svelte:window bind:scrollY />

<section class="shell page">
	<div class="crumb"><a href="/sets">Sets</a><span>/</span>{data.product.year} {data.product.name}</div>

	<div class="heading">
		<div>
			<div class="eyebrow">{data.product.manufacturer_name} · {data.product.sport_name}</div>
			<h1>{data.product.year} {data.product.name}</h1>
			<div class="product-meta">
				<span>{data.cards.length.toLocaleString()} cards</span>
				<span>{data.checklists.length} checklists</span>
				{#if data.product.release_date}<span>Released {new Date(`${data.product.release_date}T00:00:00`).toLocaleDateString()}</span>{/if}
			</div>
			{#if data.product.product_notes}<p class="notes">{data.product.product_notes}</p>{/if}
		</div>

		<div class="progress">
			<strong>{ownedCount} / {data.cards.length}</strong>
			<span>{data.user ? `${wantedCount} wanted` : 'saved in this browser'}</span>
			<i><b style={`width:${data.cards.length ? ownedCount / data.cards.length * 100 : 0}%`}></b></i>
			{#if !data.user}<a href="/auth/register">Create an account to sync →</a>{/if}
		</div>
	</div>

	<div class="filters">
		<label><span>Search</span><input class="input" bind:value={query} placeholder="Player, card number, team, checklist…" /></label>
		<label><span>Team / affiliation</span><select class="input" bind:value={team}>{#each teams as option}<option>{option}</option>{/each}</select></label>
		<label><span>Collection</span><select class="input" bind:value={statusFilter}><option>All cards</option><option>Owned</option><option>Wanted</option><option>Missing</option></select></label>
	</div>

	<div class="checklist-nav">
		<button class="checklist-current" onclick={() => checklistBrowserOpen = true}>
			<span class="checklist-kicker">Checklist</span>
			<strong>{active === 'All' ? 'All checklists' : active}</strong>
			<span>{active === 'All' ? `${data.checklists.length} sections` : `${activeChecklist?.card_count || 0} cards`}</span>
		</button>

		<div class="checklist-actions">
			{#if active !== 'All'}<button class="text-action" onclick={() => active = 'All'}>Show all</button>{/if}
			<button class="browse-checklists" onclick={() => checklistBrowserOpen = true}>Browse {data.checklists.length} checklists <b>⌘</b></button>
		</div>
	</div>

	{#if checklistBrowserOpen}
		<div class="browser-scrim" onclick={(event) => { if (event.target === event.currentTarget) checklistBrowserOpen = false; }}>
			<aside class="checklist-browser">
				<div class="browser-head">
					<div><div class="eyebrow">Browse product</div><h2>Choose a checklist</h2></div>
					<button onclick={() => checklistBrowserOpen = false}>×</button>
				</div>
				<input class="input" bind:value={checklistQuery} placeholder="Search checklist names…" autofocus />
				<div class="browser-list">
					<button class:active={active === 'All'} onclick={() => chooseChecklist('All')}><span>All checklists</span><span>{data.cards.length}</span></button>
					{#each filteredChecklists as checklist}
						<button class:active={active === checklist.name} onclick={() => chooseChecklist(checklist.name)}><span>{checklist.name}</span><span>{checklist.card_count}</span></button>
					{/each}
				</div>
			</aside>
		</div>
	{/if}

	{#if activeChecklist && (activeChecklist.parallels?.length || activeChecklist.notes?.length)}
		<section class="details">
			<div><div class="eyebrow">Checklist details</div><h2>{activeChecklist.name}</h2></div>
			{#if activeChecklist.parallels?.length}
				<div class="parallel"><strong>Parallels</strong>{#each activeChecklist.parallels as line}<span>{line}</span>{/each}</div>
			{/if}
			{#each activeChecklist.notes || [] as note}<p>{note}</p>{/each}
		</section>
	{/if}

	<div class="results-line">
		<span>{visible.length.toLocaleString()} card{visible.length === 1 ? '' : 's'}</span>
		{#if statusFilter !== 'All cards'}<button onclick={() => statusFilter = 'All cards'}>Clear collection filter ×</button>{/if}
	</div>

	<div class="table-wrap">
		<table>
			<thead><tr><th class="action-col">Have</th><th class="action-col">Want</th><th>#</th><th>Subject</th><th>Affiliation</th><th>Tags</th></tr></thead>

			{#each visibleGroups as group}
				<tbody>
					{#if active === 'All'}
						<tr class="group-heading"><td colspan="6"><button onclick={() => chooseChecklist(group.name)}><span><strong>{group.name}</strong><small>{group.cards.length} matching · {group.checklist?.card_count || 0} total</small></span><span>View checklist →</span></button></td></tr>
					{/if}

					{#each group.cards as card}
						{@const status = cardStatus(card)}
						<tr class:saving={saving.has(String(card.id))}>
							<td class="action-col"><button class="track have" class:active={status === 'owned'} onclick={() => setStatus(card.id, status === 'owned' ? null : 'owned')} aria-label="Toggle owned">{status === 'owned' ? '✓' : ''}</button></td>
							<td class="action-col"><button class="track want" class:active={status === 'wanted'} onclick={() => setStatus(card.id, status === 'wanted' ? null : 'wanted')} aria-label="Toggle wanted">{status === 'wanted' ? '★' : ''}</button></td>
							<td class="number">{card.card_number}</td>
							<td><strong>{card.subject_name}</strong></td>
							<td class:muted={card.affiliation_name === 'NIL'}>{card.affiliation_name}</td>
							<td><div class="tags">{#if card.rookie}<span>RC</span>{/if}{#if card.autograph}<span>AU</span>{/if}{#if card.memorabilia}<span>MEM</span>{/if}{#if card.serial_number}<span>/{card.serial_number}</span>{/if}</div></td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>

	<div class="source">
		<div>
			<div class="eyebrow">Source</div>
			<strong>{data.product.original_filename || 'Official checklist'}</strong>
			{#if data.product.source_url}<a href={data.product.source_url} target="_blank" rel="noreferrer">Open source ↗</a>{/if}
		</div>
		<span>Imported {data.product.imported_at ? new Date(data.product.imported_at).toLocaleDateString() : '—'}</span>
	</div>
</section>

{#if scrollY > 520}
	<button class="back-to-top" onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ <span>Back to top</span></button>
{/if}

<style>
.page{padding-top:3rem;padding-bottom:5rem}.crumb{display:flex;gap:.55rem;color:var(--muted);font-size:.8rem;font-weight:700}.crumb a{text-decoration:none}
.heading{display:flex;justify-content:space-between;align-items:end;gap:2rem;margin:2.2rem 0}.heading h1{font-size:clamp(2.3rem,5vw,4.6rem);letter-spacing:-.06em;line-height:.95;margin:.45rem 0 .7rem}.product-meta{display:flex;gap:.9rem;color:var(--muted);font-size:.76rem}.notes{max-width:720px;color:var(--muted);line-height:1.55}
.progress{min-width:220px}.progress strong,.progress span{display:block}.progress strong{font-size:1.25rem}.progress span{color:var(--muted);font-size:.75rem}.progress i{display:block;height:5px;background:var(--soft);border-radius:5px;margin:.8rem 0 .45rem;overflow:hidden}.progress b{display:block;height:100%;background:var(--orange)}.progress a{font-size:.68rem;font-weight:800;color:var(--blue)}
.filters{display:grid;grid-template-columns:1fr 260px 190px;gap:.7rem}.filters label{display:grid;gap:.35rem}.filters label>span{font-size:.66rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.checklist-nav{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:1rem 0;padding:.9rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.checklist-current{border:0;background:transparent;text-align:left;cursor:pointer;display:grid;grid-template-columns:auto auto;gap:.15rem .7rem}.checklist-kicker{grid-column:1/-1;color:var(--blue);font-size:.64rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.checklist-current>span:last-child{color:var(--muted);font-size:.72rem}.checklist-actions{display:flex;align-items:center;gap:.7rem}.text-action{border:0;background:transparent;color:var(--blue);font-weight:800;cursor:pointer}.browse-checklists{border:1px solid var(--line-strong);background:white;border-radius:999px;padding:.6rem .75rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.browse-checklists b{background:var(--ink);color:white;border-radius:50%;padding:.25rem .4rem;margin-left:.4rem}
.browser-scrim{position:fixed;inset:0;z-index:80;background:rgba(18,16,14,.35);display:flex;justify-content:flex-end}.checklist-browser{width:min(520px,92vw);height:100%;background:#fcfcfc;padding:1.3rem;overflow:auto}.browser-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}.browser-head h2{margin:.25rem 0}.browser-head button{border:1px solid var(--line);background:white;border-radius:50%;width:2rem;height:2rem;cursor:pointer}.browser-list{margin-top:.7rem}.browser-list button{width:100%;display:flex;justify-content:space-between;border:0;border-bottom:1px solid var(--line);background:transparent;padding:.8rem .4rem;text-align:left;cursor:pointer}.browser-list button.active{background:rgba(64,121,140,.07)}
.details{border:1px solid var(--line);border-radius:.9rem;padding:1rem 1.1rem;margin-bottom:1rem}.details h2{margin:.25rem 0}.parallel{display:grid;gap:.25rem;margin-top:1rem;border-left:2px solid var(--orange);padding-left:.8rem}.parallel span{font-size:.78rem;color:var(--muted)}
.results-line{display:flex;justify-content:space-between;align-items:center;padding:.8rem 0;font-size:.76rem}.results-line button{border:0;background:transparent;color:var(--blue);font-weight:800;cursor:pointer}
.table-wrap{border:1px solid var(--line);border-radius:.9rem;overflow:auto;background:#fff}table{width:100%;border-collapse:collapse;min-width:900px}th,td{padding:.75rem .8rem;border-bottom:1px solid var(--line);text-align:left;font-size:.8rem}th{font-size:.64rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.action-col{width:54px;text-align:center}.track{width:24px;height:24px;border:1px solid #d3d1d1;border-radius:6px;background:white;cursor:pointer;font-weight:900}.track.have.active{background:var(--blue);border-color:var(--blue);color:white}.track.want.active{background:var(--orange);border-color:var(--orange);color:white}.number{font-weight:900}.muted{color:var(--muted)}.tags{display:flex;gap:.3rem}.tags span{background:#f3f2f1;border-radius:.35rem;padding:.2rem .35rem;font-size:.64rem;font-weight:850}.saving{opacity:.6}
.group-heading td{padding:0}.group-heading button{width:100%;border:0;background:#f6f7f7;padding:.7rem .85rem;display:flex;justify-content:space-between;text-align:left;cursor:pointer}.group-heading button>span:first-child{display:flex;align-items:baseline;gap:.6rem}.group-heading small{color:var(--muted)}
.source{display:flex;justify-content:space-between;align-items:end;gap:1rem;border-top:1px solid var(--line);margin-top:1.5rem;padding:1.2rem 0}.source strong,.source a{display:block}.source a{margin-top:.25rem;color:var(--blue);font-size:.72rem}.source>span{color:var(--muted);font-size:.72rem}
.back-to-top{position:fixed;right:14px;bottom:14px;border:1px solid var(--line-strong);background:rgba(255,255,255,.94);border-radius:999px;padding:.55rem .75rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
@media(max-width:800px){.heading{align-items:flex-start;flex-direction:column}.progress{width:100%}.filters{grid-template-columns:1fr}.checklist-nav{align-items:flex-start;flex-direction:column}.product-meta{flex-wrap:wrap}}
</style>
