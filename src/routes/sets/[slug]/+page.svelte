<script>
	import { getOwned, setOwned } from '$lib/client/collection.js';

	let { data } = $props();
	const websiteSchema = JSON.stringify({
	'@context': 'https://schema.org',
	'@type': 'WebSite',
	name: 'Setbound',
	url: 'https://setbound.app/',
	potentialAction: {
		'@type': 'SearchAction',
		target: 'https://setbound.app/search?q={search_term_string}',
		'query-input': 'required name=search_term_string'
	}
});
	// SEO-PASS:setbound
	const fullProductTitle = $derived(String(data.product.year) + ' ' + data.product.name);
	const seoTitle = $derived(fullProductTitle + ' Checklist, Cards & Set Details | Setbound');
	const seoDescription = $derived.by(() => {
		const fallback = 'Browse the complete ' + fullProductTitle + ' checklist with ' + data.cards.length.toLocaleString() + ' cards across ' + data.checklists.length + ' checklists. Search players, card numbers and affiliations and track your collection.';
		const source = String(data.product.product_notes || fallback).replace(/\s+/g, ' ').trim();
		return source.length > 158 ? source.slice(0, 155).trimEnd() + '…' : source;
	});
	const canonicalUrl = $derived('https://setbound.app/sets/' + data.product.slug);
	const socialImage = $derived(data.product.image_key ? 'https://setbound.app/media/set/' + data.product.slug : null);

	let active = $state('All');
  let parallelSection = $state(String(data.checklists.find(c=>c.parallels?.length)?.id ?? ''));
  const currentParallelSection = $derived(data.checklists.find(c=>String(c.id)===parallelSection && c.parallels?.length) || data.checklists.find(c=>c.parallels?.length));
	let query = $state(data.initialQuery || '');
	let team = $state('All teams');
	let statusFilter = $state('All cards');
	let checklistBrowserOpen = $state(false);
	let checklistQuery = $state('');
	let scrollY = $state(0);
	let oddsBrowserOpen = $state(false);
	let oddsQuery = $state('');
	let oddsFormat = $state('All formats');
	let guestOwned = $state(new Set());
	let statuses = $state(new Map(data.cards.filter((c) => c.collection_status).map((c) => [String(c.id), c.collection_status])));
	let saving = $state(new Set());

	$effect(() => {
		if (!data.preview && !data.user) guestOwned = getOwned();
	});

	const teams = $derived([
		'All teams',
		...[...new Set(data.cards.map((card) => card.franchise_name || card.affiliation_name))].sort((a, b) => a.localeCompare(b))
	]);

	const activeChecklist = $derived(active === 'All' ? null : data.checklists.find((checklist) => checklist.name === active));
	const filteredChecklists = $derived(data.checklists.filter((checklist) => !checklistQuery || checklist.name.toLowerCase().includes(checklistQuery.toLowerCase())));

	function cardStatus(card) {
		if (data.preview) return null;
		if (data.user) return statuses.get(String(card.id)) || null;
		return guestOwned.has(String(card.id)) ? 'owned' : null;
	}

	const visible = $derived(data.cards.filter((card) => {
		const status = cardStatus(card);
		return (
			(active === 'All' || card.checklist_name === active) &&
			(team === 'All teams' || (card.franchise_name || card.affiliation_name) === team) &&
			(statusFilter === 'All cards' ||
				(statusFilter === 'Owned' && status === 'owned') ||
				(statusFilter === 'Wanted' && status === 'wanted') ||
				(statusFilter === 'Missing' && status !== 'owned')) &&
			(!query || `${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.franchise_name || ''} ${card.checklist_name}`.toLowerCase().includes(query.toLowerCase()))
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
			.map(([name, cards]) => ({
				name,
				cards,
				checklist: data.checklists.find((checklist) => checklist.name === name)
			}));
	});

	const ownedCount = $derived(data.cards.filter((card) => cardStatus(card) === 'owned').length);
	const wantedCount = $derived(data.cards.filter((card) => cardStatus(card) === 'wanted').length);
	const percentComplete = $derived(data.cards.length ? Math.round(ownedCount / data.cards.length * 100) : 0);

	const filteredOdds = $derived(
		data.odds.filter((row) => {
			const queryMatch = !oddsQuery || row.name.toLowerCase().includes(oddsQuery.toLowerCase());

			if (!queryMatch) return false;
			if (oddsFormat === 'All formats') return true;

			const format = data.oddsFormats.find((item) => item.name === oddsFormat);
			if (!format) return true;

			return Boolean(row.values[String(format.id)]);
		})
	);

	function chooseChecklist(name) {
		active = name;
		checklistBrowserOpen = false;
		checklistQuery = '';
	}

	async function setStatus(cardId, nextStatus) {
		if (data.preview) return;
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

<svelte:head>
	<title>{data.preview ? 'Draft preview | ' + seoTitle : seoTitle}</title>
	<meta name="description" content={seoDescription} />
	<meta name="robots" content={data.preview ? "noindex,nofollow,noarchive" : "index,follow"} />
	{#if !data.preview}<link rel="canonical" href={canonicalUrl} />{/if}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Setbound" />
	<meta property="og:title" content={seoTitle} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={canonicalUrl} />
	{#if socialImage}<meta property="og:image" content={socialImage} />{/if}
	<meta name="twitter:card" content={socialImage ? 'summary_large_image' : 'summary'} />
	{#if !data.preview}{@html `<script type="application/ld+json">${websiteSchema}</script>`}{/if}
</svelte:head>
<svelte:window bind:scrollY />

<section class="shell page">
	{#if data.preview}
		<div class="draft-preview-banner" role="status"><strong>DRAFT PREVIEW · ADMIN ONLY</strong><span>This set is not publicly visible. Collection controls are disabled.</span><a href="/admin/sets">← Back to Manage Sets</a></div>
	{/if}
	<div class="crumb"><a href="/sets">Sets</a><span>/</span>{data.product.year} {data.product.name}</div>

	<section class="hero">
		<div class="hero-copy">
			<div class="eyebrow">{data.product.manufacturer_name} · {data.product.sport_name}</div>
			<h1>{data.product.year} {data.product.name}</h1>

			<div class="meta-line">
				<span><strong>{data.cards.length.toLocaleString()}</strong> cards</span>
				<span><strong>{data.checklists.length}</strong> checklists</span>
				{#if data.product.release_date}
					<span>Released <strong>{new Date(`${data.product.release_date}T00:00:00`).toLocaleDateString()}</strong></span>
				{/if}
			</div>

			{#if data.product.product_notes}
				<p class="summary">{data.product.product_notes}</p>
			{/if}
		</div>

		<aside class="hero-side">
			{#if data.product.image_key}
				<div class="artwork">
					<img src={`/media/set/${data.product.slug}`} alt={`${data.product.year} ${data.product.name}`} />
				</div>
			{/if}

			<div class="collection-progress">
				<div class="progress-head">
					<div>
						<strong>{ownedCount} / {data.cards.length}</strong>
						<span>in your collection</span>
					</div>
					<b>{percentComplete}%</b>
				</div>

				<div class="progress-bar"><i style={`width:${percentComplete}%`}></i></div>

				<div class="progress-foot">
					<span>{wantedCount} wanted</span>
					{#if !data.user}<a href="/auth/register">Sync your collection →</a>{/if}
				</div>
			</div>
		</aside>
	</section>

	<div class="checklist-feedback">
		<span>Problems with this checklist? Let us know!</span>
		<a href={`mailto:hello.setbound@gmail.com?subject=${encodeURIComponent('Checklist correction: ' + data.product.year + ' ' + data.product.name + ' (' + data.product.slug + ')')}`}>hello.setbound@gmail.com ↗</a>
	</div>

	{#if data.formats.length}
		<section class="facts">
			{#each data.formats as format}
				<div class="fact">
					<span>{format.label}</span>
					<strong>{format.details}</strong>
				</div>
			{/each}
		</section>
	{/if}

  {#if data.checklists.some(c=>c.parallels?.length)}
    <details class="parallel-guide">
      <summary><span><strong>Parallels & variations</strong><small>Names, print runs and exclusives by checklist</small></span><span>Explore ↗</span></summary>
      <div class="compact-parallels">
        <div class="compact-parallel-controls">
          <label for="parallel-set-choice">Checklist section</label>
          <select id="parallel-set-choice" class="input" bind:value={parallelSection}>
            {#each data.checklists.filter(c=>c.parallels?.length) as c (c.id)}
              <option value={String(c.id)}>{c.name} ({c.parallels.length})</option>
            {/each}
          </select>
        </div>
        {#if currentParallelSection}
          <p class="compact-parallel-count">{currentParallelSection.parallels.length} parallels · {currentParallelSection.name}</p>
          <div class="compact-parallel-scroll">
            <table class="compact-parallel-table">
              <thead><tr><th>Print run</th><th>Parallel</th></tr></thead>
              <tbody>
                {#each currentParallelSection.parallels as item,i (i)}
                  <tr>
                    <td class="compact-parallel-run">{typeof item==='string'?'—':((item.number||item.serial_number||item.print_run||'Unnumbered')==='Unnumbered'?'—':(item.number||item.serial_number||item.print_run))}</td>
                    <td>{typeof item==='string'?item:(item.name||item.label||'Parallel')}{#if typeof item==='object'&&item.availability}<small class="parallel-exclusive">{item.availability}</small>{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </details>
  {/if}
	<section class="browser">
		<div class="browser-headline">
			<div>
				<div class="eyebrow">Checklist</div>
				<h2>{active === 'All' ? 'Browse the set' : active}</h2>
			</div>

			<div class="browser-meta">
				<span>{active === 'All' ? `${data.checklists.length} sections` : `${activeChecklist?.card_count || 0} cards`}</span>
				{#if data.odds.length}
					<button class="odds-button" onclick={() => oddsBrowserOpen = true}>
						Odds <b>{data.odds.length}</b>
					</button>
				{/if}
				<button class="browse-checklists" onclick={() => checklistBrowserOpen = true}>Browse checklists <b>⌘</b></button>
			</div>
		</div>

		<div class="filters">
			<label><span>Search</span><input class="input" bind:value={query} placeholder="Player, card number, team, checklist…" /></label>
			<label><span>Team / affiliation</span><select class="input" bind:value={team}>{#each teams as option}<option>{option}</option>{/each}</select></label>
			<label><span>Collection</span><select class="input" bind:value={statusFilter}><option>All cards</option><option>Owned</option><option>Wanted</option><option>Missing</option></select></label>
		</div>
	</section>

	{#if oddsBrowserOpen}
		<div class="browser-scrim" onclick={(event) => { if (event.target === event.currentTarget) oddsBrowserOpen = false; }}>
			<aside class="odds-browser">
				<div class="browser-panel-head">
					<div>
						<div class="eyebrow">Official odds</div>
						<h2>Pack odds</h2>
					</div>
					<button onclick={() => oddsBrowserOpen = false}>×</button>
				</div>

				<div class="odds-controls">
					<input class="input" bind:value={oddsQuery} placeholder="Search parallels, inserts, autographs…" />
					<select class="input" bind:value={oddsFormat}>
						<option>All formats</option>
						{#each data.oddsFormats as format}<option>{format.name}</option>{/each}
					</select>
				</div>

				<div class="odds-table-wrap">
					<table class="odds-table">
						<thead>
							<tr>
								<th>Card / parallel</th>
								{#each data.oddsFormats as format}<th>{format.name}</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each filteredOdds as row}
								<tr>
									<td><strong>{row.name}</strong></td>
									{#each data.oddsFormats as format}
										{@const value = row.values[String(format.id)]}
										<td class:unavailable={!value || value.text === '-'}>{value?.text || '—'}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if data.oddsSource}
					<div class="odds-source-note">
						{#if data.oddsSource.disclaimer}<p>{data.oddsSource.disclaimer}</p>{/if}
						<div>
							<span>{data.oddsSource.original_filename || 'Official odds sheet'}</span>
							{#if data.oddsSource.source_url}
								<a href={data.oddsSource.source_url} target="_blank" rel="noreferrer">Official source ↗</a>
							{/if}
						</div>
					</div>
				{/if}
			</aside>
		</div>
	{/if}

	{#if checklistBrowserOpen}
		<div class="browser-scrim" onclick={(event) => { if (event.target === event.currentTarget) checklistBrowserOpen = false; }}>
			<aside class="checklist-browser">
				<div class="browser-panel-head">
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
							<td class="action-col"><button class="track have" class:active={status === 'owned'} disabled={data.preview} onclick={() => setStatus(card.id, status === 'owned' ? null : 'owned')} aria-label="Toggle owned">{status === 'owned' ? '✓' : ''}</button></td>
							<td class="action-col"><button class="track want" class:active={status === 'wanted'} disabled={data.preview} onclick={() => setStatus(card.id, status === 'wanted' ? null : 'wanted')} aria-label="Toggle wanted">{status === 'wanted' ? '★' : ''}</button></td>
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
	.draft-preview-banner{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem 1.1rem;padding:.85rem 1rem;margin-bottom:1.3rem;border:1px solid #baaa87;border-radius:.7rem;background:#fff9ed;font-size:.76rem}.draft-preview-banner strong{color:#674a21}.draft-preview-banner span{color:#695d4d;flex:1}.draft-preview-banner a{font-weight:850;color:#674a21}.track:disabled{cursor:not-allowed;opacity:.5}
	.page{padding-top:2.65rem;padding-bottom:5rem}
	.crumb{display:flex;gap:.55rem;color:var(--muted);font-size:.78rem;font-weight:700}
	.crumb a{text-decoration:none}
	.hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(270px,.55fr);gap:3rem;align-items:start;padding:2.1rem 0 1.6rem}
	.hero-copy{padding-top:.15rem}
	.hero-copy h1{font-size:clamp(2.7rem,5.5vw,5rem);letter-spacing:-.064em;line-height:.92;margin:.45rem 0 .8rem}
	.meta-line{display:flex;flex-wrap:wrap;gap:.45rem 1rem;color:var(--muted);font-size:.74rem}
	.meta-line span{position:relative}.meta-line span+span::before{content:'·';position:absolute;left:-.62rem;color:#b7b1b4}.meta-line strong{color:var(--ink);font-weight:850}
	.summary{max-width:780px;margin:1.1rem 0 0;color:#3f3a3c;font-size:.9rem;line-height:1.62;white-space:pre-wrap}
	.hero-side{display:grid;gap:.85rem;align-self:start}
	.artwork{aspect-ratio:16/8.5;border-radius:.85rem;overflow:hidden;background:#f3f1ef;border:1px solid var(--line)}
	.artwork img{width:100%;height:100%;object-fit:cover;display:block}
	.collection-progress{padding-top:.1rem}.progress-head{display:flex;justify-content:space-between;align-items:end;gap:1rem}.progress-head>div{display:grid;gap:.08rem}.progress-head strong{font-size:1.12rem;letter-spacing:-.02em}.progress-head span{color:var(--muted);font-size:.66rem}.progress-head b{font-size:.74rem}
	.progress-bar{height:5px;margin:.62rem 0 .4rem;background:#f0eeee;border-radius:999px;overflow:hidden}.progress-bar i{display:block;height:100%;background:var(--orange)}
	.progress-foot{display:flex;justify-content:space-between;gap:1rem;color:var(--muted);font-size:.66rem}.progress-foot a{color:var(--blue);font-weight:800;text-decoration:none}
	.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
	.fact{padding:.9rem 1rem .95rem 0;min-width:0}.fact+.fact{border-left:1px solid var(--line);padding-left:1rem}
	.fact span{display:block;margin-bottom:.28rem;color:var(--blue);font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.085em}
	.fact strong{display:block;white-space:pre-line;font-size:.73rem;line-height:1.5;font-weight:650}
	.browser{padding:1.85rem 0 0}.browser-headline{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:.85rem}
	.browser-headline h2{margin:.18rem 0 0;font-family:var(--display);font-size:2rem;font-weight:500;letter-spacing:-.04em}
	.browser-meta{display:flex;align-items:center;gap:.8rem}.browser-meta>span{color:var(--muted);font-size:.7rem}
	.filters{display:grid;grid-template-columns:1fr 260px 190px;gap:.7rem}.filters label{display:grid;gap:.35rem}.filters label>span{font-size:.63rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.browse-checklists{border:1px solid var(--line-strong);background:white;border-radius:999px;padding:.6rem .75rem;font:inherit;font-size:.71rem;font-weight:850;cursor:pointer}.browse-checklists b{background:var(--ink);color:white;border-radius:50%;padding:.25rem .4rem;margin-left:.4rem}
	.browser-scrim{position:fixed;inset:0;z-index:80;background:rgba(18,16,14,.35);display:flex;justify-content:flex-end}
	.checklist-browser{width:min(520px,92vw);height:100%;background:#fcfcfc;padding:1.3rem;overflow:auto}
	.browser-panel-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}.browser-panel-head h2{margin:.25rem 0}.browser-panel-head button{border:1px solid var(--line);background:white;border-radius:50%;width:2rem;height:2rem;cursor:pointer}
	.browser-list{margin-top:.7rem}.browser-list button{width:100%;display:flex;justify-content:space-between;border:0;border-bottom:1px solid var(--line);background:transparent;padding:.8rem .4rem;text-align:left;cursor:pointer}.browser-list button.active{background:rgba(64,121,140,.07)}
	.details{border:1px solid var(--line);border-radius:.9rem;padding:1rem 1.1rem;margin:1rem 0}.details h2{margin:.25rem 0}.parallel{display:grid;gap:.25rem;margin-top:1rem;border-left:2px solid var(--orange);padding-left:.8rem}.parallel span{font-size:.78rem;color:var(--muted)}
	.results-line{display:flex;justify-content:space-between;align-items:center;padding:1rem 0 .75rem;font-size:.74rem;color:var(--muted)}
	.table-wrap{border:1px solid var(--line);border-radius:.9rem;overflow:auto;background:#fff}table{width:100%;border-collapse:collapse;min-width:900px}th,td{padding:.75rem .8rem;border-bottom:1px solid var(--line);text-align:left;font-size:.8rem}th{font-size:.64rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.action-col{width:54px;text-align:center}.track{width:24px;height:24px;border:1px solid #d3d1d1;border-radius:6px;background:white;cursor:pointer;font-weight:900}.track.have.active{background:var(--blue);border-color:var(--blue);color:white}.track.want.active{background:var(--orange);border-color:var(--orange);color:white}
	.number{font-weight:900}.muted{color:var(--muted)}.tags{display:flex;gap:.3rem}.tags span{background:#f3f2f1;border-radius:.35rem;padding:.2rem .35rem;font-size:.64rem;font-weight:850}.saving{opacity:.6}
	.group-heading td{padding:0}.group-heading button{width:100%;border:0;background:#f6f7f7;padding:.7rem .85rem;display:flex;justify-content:space-between;text-align:left;cursor:pointer}.group-heading button>span:first-child{display:flex;align-items:baseline;gap:.6rem}.group-heading small{color:var(--muted)}
	.source{display:flex;justify-content:space-between;align-items:end;gap:1rem;border-top:1px solid var(--line);margin-top:1.5rem;padding:1.2rem 0}.source strong,.source a{display:block}.source a{margin-top:.25rem;color:var(--blue);font-size:.72rem}.source>span{color:var(--muted);font-size:.72rem}
	.back-to-top{position:fixed;right:14px;bottom:14px;border:1px solid var(--line-strong);background:rgba(255,255,255,.94);border-radius:999px;padding:.55rem .75rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}

	.odds-button{
		border:1px solid var(--line-strong);
		background:white;
		border-radius:999px;
		padding:.6rem .75rem;
		font:inherit;
		font-size:.71rem;
		font-weight:850;
		cursor:pointer;
	}

	.odds-button b{
		margin-left:.35rem;
		color:var(--orange);
	}

	.odds-browser{
		width:min(860px,96vw);
		height:100%;
		background:#fcfcfc;
		padding:1.3rem;
		overflow:auto;
	}

	.odds-controls{
		display:grid;
		grid-template-columns:1fr 190px;
		gap:.6rem;
		margin-bottom:.8rem;
	}

	.odds-table-wrap,
	.checklist-odds-table{
		overflow:auto;
		border:1px solid var(--line);
		border-radius:.8rem;
		background:white;
	}

	.odds-table{
		min-width:720px;
	}

	.odds-table th,
	.checklist-odds-table th{
		white-space:nowrap;
	}

	.odds-table td:not(:first-child),
	.checklist-odds-table td:not(:first-child){
		white-space:nowrap;
	}

	.unavailable{
		color:#aaa;
	}

	.odds-source-note{
		margin-top:1rem;
		padding-top:.8rem;
		border-top:1px solid var(--line);
		color:var(--muted);
		font-size:.7rem;
		line-height:1.5;
	}

	.odds-source-note p{
		margin:0 0 .7rem;
	}

	.odds-source-note>div{
		display:flex;
		justify-content:space-between;
		gap:1rem;
	}

	.odds-source-note a{
		color:var(--blue);
		font-weight:800;
		text-decoration:none;
	}

	.checklist-odds{
		margin:1rem 0;
		padding:1rem 0;
		border-top:1px solid var(--line);
	}

	.checklist-odds-head{
		display:flex;
		justify-content:space-between;
		align-items:end;
		gap:1rem;
		margin-bottom:.75rem;
	}

	.checklist-odds-head h2{
		margin:.2rem 0 0;
		font-size:1.25rem;
	}

	.checklist-odds-head button{
		border:0;
		background:transparent;
		color:var(--blue);
		font:inherit;
		font-size:.7rem;
		font-weight:850;
		cursor:pointer;
	}

	.checklist-odds-table table{
		min-width:720px;
	}

	@media(max-width:1050px){.hero{grid-template-columns:1fr;gap:1.35rem}.hero-side{grid-template-columns:minmax(0,1fr) minmax(240px,.7fr);align-items:end}}
	@media(max-width:800px){.filters{grid-template-columns:1fr}.odds-controls{grid-template-columns:1fr}.browser-headline{align-items:flex-start;flex-direction:column}.hero-side{grid-template-columns:1fr}}
	@media(max-width:560px){.fact+.fact{border-left:0;padding-left:0}}

	.checklist-feedback{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .65rem;margin-top:1.8rem;padding:1rem 0;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}
	.checklist-feedback a{font-weight:800;color:var(--ink);text-decoration:underline;text-decoration-color:var(--orange);text-underline-offset:3px}
	.checklist-feedback a:hover{color:var(--orange)}
  .parallel-guide{margin:1.7rem 0;border-block:1px solid var(--line);padding:1rem 0}.parallel-guide>summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer;list-style:none}.parallel-guide>summary::-webkit-details-marker{display:none}.parallel-guide>summary strong{display:block;font-family:var(--display);font-size:1.25rem}.parallel-guide>summary small{display:block;color:var(--muted);font-size:.76rem;margin-top:.2rem}.parallel-guide>summary>span:last-child{color:var(--blue);font-size:.77rem;font-weight:800}.parallel-inner{padding:1.2rem 0 .2rem}.parallel-group{margin-bottom:1.3rem}.parallel-group h3{font-size:1rem;margin:0 0 .5rem}.parallel-group h3 small{color:var(--muted);font-size:.72rem;font-weight:400;margin-left:.5rem}.parallel-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 1.5rem}.parallel-items>div{display:flex;align-items:baseline;gap:.6rem;border-bottom:1px solid var(--line);padding:.55rem 0;font-size:.78rem}.parallel-items>div strong{flex:1;font-weight:650}.parallel-items>div span{font-weight:800;white-space:nowrap}.parallel-items>div small{color:var(--muted);font-size:.65rem}@media(max-width:850px){.parallel-items{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.parallel-items{grid-template-columns:1fr}}

.parallel-table-wrap{overflow:auto}
.parallel-table{width:100%;border-collapse:collapse;font-size:.8rem}
.parallel-table th{font-size:.64rem;text-transform:uppercase;letter-spacing:.07em;text-align:left;color:var(--muted);border-bottom:1px solid var(--line);padding:.6rem .5rem}
.parallel-table td{padding:.64rem .5rem;border-bottom:1px solid var(--line);vertical-align:middle}
.parallel-table .parallel-run{width:125px;font-weight:800;color:var(--ink);white-space:nowrap}
.parallel-exclusive{display:inline-block;margin-left:.65rem;border:1px solid var(--line-strong);border-radius:999px;padding:.15rem .45rem;font-size:.65rem;color:var(--muted);white-space:nowrap}

/* Compact parallel reference: a single section at a time, capped scroll area. */
.compact-parallels{padding:1rem 0 .3rem;max-width:900px}
.compact-parallel-controls{display:flex;align-items:center;gap:.8rem;margin-bottom:.65rem}
.compact-parallel-controls label{font-size:.76rem;font-weight:800;white-space:nowrap}
.compact-parallel-controls select{width:min(100%,480px);max-width:100%}
.compact-parallel-count{margin:.35rem 0 .65rem;color:var(--muted);font-size:.73rem}
.compact-parallel-scroll{max-height:370px;overflow:auto;border:1px solid var(--line);border-radius:.5rem}
.compact-parallel-table{width:100%;border-collapse:collapse;font-size:.79rem}
.compact-parallel-table th{position:sticky;top:0;z-index:1;background:var(--soft);text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:.63rem;color:var(--muted);padding:.65rem .85rem;border-bottom:1px solid var(--line)}
.compact-parallel-table td{padding:.55rem .85rem;border-bottom:1px solid var(--line)}
.compact-parallel-table tr:last-child td{border-bottom:0}
.compact-parallel-run{width:115px;white-space:nowrap;font-weight:800}
@media(max-width:600px){.compact-parallel-controls{display:block}.compact-parallel-controls select{margin-top:.35rem;width:100%}.compact-parallel-scroll{max-height:330px}}
</style>
