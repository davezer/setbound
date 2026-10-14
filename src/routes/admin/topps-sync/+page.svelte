<script>
	import { extractPdfText } from '$lib/client/pdf.js';
	import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
	import { parseChecklistText } from '$lib/client/checklist-parser.js';
	import { validateChecklistImport } from '$lib/checklist-validation.js';

	let { data } = $props();

	let filterYear = $state('All');
	let initialized = $state(false);
	let filterSport = $state('All sports');
	let query = $state('');
	let newOnly = $state(true);
	let selected = $state(new Set());
	let rows = $state([]);
	let busy = $state(false);
	let globalMessage = $state('');
	let globalError = $state('');

	$effect(() => {
		if (!initialized) {
			filterYear = String(data.requestedYear || 'All');
			initialized = true;
		}
	});

	const toppsManufacturer = $derived(
		data.manufacturers.find((item) => item.name.toLowerCase() === 'topps') ||
		data.manufacturers[0] ||
		null
	);

	const years = $derived([
		'All',
		...[...new Set(data.entries.map((entry) => String(entry.year)))].sort((a, b) => Number(b) - Number(a))
	]);

	const inferredSports = $derived([
		'All sports',
		...[...new Set(data.entries.map((entry) => entry.sport).filter(Boolean))].sort()
	]);

	const visibleEntries = $derived(
		data.entries.filter((entry) => {
			const q = query.trim().toLowerCase();
			return (
				(filterYear === 'All' || String(entry.year) === filterYear) &&
				(filterSport === 'All sports' || entry.sport === filterSport) &&
				(!newOnly || !entry.existing) &&
				(!q || `${entry.name} ${entry.filename} ${entry.sport}`.toLowerCase().includes(q))
			);
		})
	);

	function rowKey(entry) { return entry.url; }

	function toggle(entry) {
		const key = rowKey(entry);
		const next = new Set(selected);
		next.has(key) ? next.delete(key) : next.add(key);
		selected = next;
	}

	function selectVisible() {
		const next = new Set(selected);
		for (const entry of visibleEntries) if (!entry.existing) next.add(rowKey(entry));
		selected = next;
	}

	function clearSelected() { selected = new Set(); }

	function extension(filename) {
		return String(filename || '').toLowerCase().split('.').pop();
	}

	function sportIdFor(entry) {
		const exact = data.sports.find(
			(sport) => sport.name.toLowerCase() === String(entry.sport || '').toLowerCase()
		);
		return exact?.id ?? data.sports[0]?.id ?? null;
	}

	function makeQueueRow(entry) {
		return {
			key: entry.url,
			name: entry.name,
			year: Number(entry.year),
			sportId: sportIdFor(entry),
			manufacturerId: toppsManufacturer?.id ?? null,
			sourceUrl: entry.url,
			sourceFilename: entry.filename,
			extension: entry.extension,
			status: 'waiting',
			statusText: 'Waiting',
			error: '',
			parsed: null,
			audit: null,
			importedSlug: null
		};
	}

	async function fetchChecklist(row) {
		const response = await fetch(`/api/admin/topps-sync/download?url=${encodeURIComponent(row.sourceUrl)}`);
		if (!response.ok) {
			const message = await response.text();
			throw new Error(message || `Download failed (${response.status}).`);
		}
		const blob = await response.blob();
		return new File([blob], row.sourceFilename, { type: blob.type });
	}

	async function prepareRow(index) {
		const row = rows[index];
		if (!row) return;

		rows[index] = { ...row, status: 'preparing', statusText: 'Downloading & parsing…', error: '' };
		rows = [...rows];

		try {
			const file = await fetchChecklist(rows[index]);
			const ext = extension(file.name);
			let result;

			if (ext === 'pdf') {
				const text = await extractPdfText(file);
				result = parseChecklistText(text, data.affiliations);
			} else if (ext === 'xls' || ext === 'xlsx') {
				result = await extractSpreadsheetChecklist(file);
			} else {
				throw new Error(`Unsupported checklist file type: .${ext}`);
			}

			const audit = validateChecklistImport(result.cards, result.checklist_meta, result.sections);
			const unresolved = result.cards.filter(
				(card) => card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved'
			).length;

			rows[index] = {
				...rows[index],
				parsed: result,
				audit,
				status: unresolved ? 'review' : 'ready',
				statusText: unresolved
					? `${unresolved} unresolved affiliation${unresolved === 1 ? '' : 's'}`
					: `${result.cards.length.toLocaleString()} cards ready`
			};
		} catch (error) {
			rows[index] = {
				...rows[index],
				status: 'error',
				statusText: 'Could not prepare',
				error: error?.message || 'Could not prepare checklist.'
			};
		}

		rows = [...rows];
	}

	async function prepareSelected() {
		const chosen = data.entries
			.filter((entry) => selected.has(rowKey(entry)) && !entry.existing)
			.map(makeQueueRow);

		if (!chosen.length) {
			globalError = 'Select at least one new checklist first.';
			return;
		}

		rows = chosen;
		busy = true;
		globalError = '';
		globalMessage = `Preparing ${chosen.length} checklist${chosen.length === 1 ? '' : 's'}…`;

		for (let index = 0; index < chosen.length; index++) await prepareRow(index);

		const ready = rows.filter((row) => row.status === 'ready').length;
		const review = rows.filter((row) => row.status === 'review').length;
		const failed = rows.filter((row) => row.status === 'error').length;

		globalMessage = `${ready} ready${review ? ` · ${review} need review` : ''}${failed ? ` · ${failed} failed` : ''}`;
		busy = false;
	}

	async function importRow(index) {
		const row = rows[index];
		if (!row?.parsed || row.status !== 'ready') return;

		if (!row.sportId || !row.manufacturerId) {
			rows[index] = {
				...row,
				status: 'error',
				statusText: 'Missing sport or manufacturer',
				error: 'Choose a sport and manufacturer before importing.'
			};
			rows = [...rows];
			return;
		}

		rows[index] = { ...row, status: 'importing', statusText: 'Importing…', error: '' };
		rows = [...rows];

		try {
			const response = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					year: Number(rows[index].year),
					name: rows[index].name,
					sportId: Number(rows[index].sportId),
					manufacturerId: Number(rows[index].manufacturerId),
					sourceUrl: rows[index].sourceUrl,
					sourceFilename: rows[index].sourceFilename,
					cards: rows[index].parsed.cards,
					checklistMeta: rows[index].parsed.checklist_meta,
					sections: rows[index].parsed.sections
				})
			});

			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Import failed.');

			rows[index] = { ...rows[index], status: 'imported', statusText: 'Imported', importedSlug: result.slug };
		} catch (error) {
			rows[index] = {
				...rows[index],
				status: 'error',
				statusText: 'Import failed',
				error: error?.message || 'Import failed.'
			};
		}

		rows = [...rows];
	}

	async function importReady() {
		const indexes = rows
			.map((row, index) => ({ row, index }))
			.filter(({ row }) => row.status === 'ready')
			.map(({ index }) => index);

		if (!indexes.length) {
			globalError = 'There are no prepared checklists ready to import.';
			return;
		}

		busy = true;
		globalError = '';
		globalMessage = `Importing ${indexes.length} checklist${indexes.length === 1 ? '' : 's'}…`;

		for (const index of indexes) await importRow(index);

		const imported = rows.filter((row) => row.status === 'imported').length;
		const failed = rows.filter((row) => row.status === 'error').length;
		globalMessage = `${imported} imported${failed ? ` · ${failed} failed` : ''}`;
		busy = false;
	}

	function downloadUrl(entry) {
		const sourceUrl = entry.url || entry.sourceUrl;
		return `/api/admin/topps-sync/download?download=1&url=${encodeURIComponent(sourceUrl)}`;
	}

	function regularImporterUrl(row) {
		const params = new URLSearchParams({
			year: String(row.year),
			name: row.name,
			source: row.sourceUrl
		});
		return `/admin/import?${params}`;
	}

	function setRowValue(index, field, value) {
		rows[index] = { ...rows[index], [field]: value };
		rows = [...rows];
	}
</script>

<svelte:head><title>Topps Sync — Setbound admin</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin · Official source</div>
			<h1>Topps Sync</h1>
			<p>Find official Topps checklist files, parse them in Setbound, and import clean products in batches.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	{#if data.fetchError}
		<div class="error"><strong>Could not refresh Topps.</strong><span>{data.fetchError}</span></div>
	{:else if data.sourceMode === 'fallback'}
		<div class="notice">
			<strong>Using verified Setbound catalog.</strong>
			<span>{data.sourceNote}</span>
		</div>
	{:else if data.sourceNote}
		<div class="notice">
			<strong>Live Topps directory connected.</strong>
			<span>{data.sourceNote}</span>
		</div>
	{/if}

	<section class="controls">
		<label class="search"><span>Find checklist</span><input class="input" bind:value={query} placeholder="Bowman, Chrome, WWE…" /></label>
		<label><span>Year</span><select class="input" bind:value={filterYear}>{#each years as year}<option value={year}>{year === 'All' ? 'All years' : year}</option>{/each}</select></label>
		<label><span>Sport</span><select class="input" bind:value={filterSport}>{#each inferredSports as sport}<option>{sport}</option>{/each}</select></label>
		<label class="check"><input type="checkbox" bind:checked={newOnly} /><span>New only</span></label>
	</section>

	<div class="toolbar">
		<div><strong>{visibleEntries.length.toLocaleString()}</strong> official files shown <span>· {selected.size} selected</span></div>
		<div class="toolbar-actions">
			<button class="ghost" onclick={selectVisible} disabled={busy}>Select visible</button>
			<button class="ghost" onclick={clearSelected} disabled={busy}>Clear</button>
			<button class="primary" onclick={prepareSelected} disabled={busy || !selected.size}>{busy ? 'Working…' : 'Prepare selected'}</button>
		</div>
	</div>

	{#if globalError}<div class="error">{globalError}</div>{/if}
	{#if globalMessage}<div class="notice">{globalMessage}</div>{/if}

	<div class="directory">
		<div class="directory-head"><span></span><span>Checklist</span><span>Sport</span><span>File</span><span>Status</span><span></span></div>

		{#each visibleEntries as entry}
			<div class="directory-row" class:existing={entry.existing}>
				<label class="selector">
					<input type="checkbox" checked={selected.has(rowKey(entry))} onchange={() => toggle(entry)} disabled={Boolean(entry.existing) || busy} />
				</label>
				<div class="identity"><strong>{entry.name}</strong><span>{entry.year}</span></div>
				<div>{entry.sport || 'Unclassified'}</div>
				<div class="file">{entry.extension.toUpperCase()}</div>
				<div>{#if entry.existing}<span class="badge existing-badge">Already in Setbound</span>{:else}<span class="badge">New</span>{/if}</div>
				<a class="download" href={downloadUrl(entry)}>Download</a>
			</div>
		{/each}

		{#if !visibleEntries.length}<div class="empty">No Topps checklist files match these filters.</div>{/if}
	</div>

	{#if rows.length}
		<section class="batch">
			<div class="batch-head">
				<div>
					<div class="eyebrow">Batch review</div>
					<h2>Prepared checklists</h2>
					<p>Only rows with zero unresolved affiliations can bulk import. Anything uncertain stays out of production.</p>
				</div>
				<button class="primary" onclick={importReady} disabled={busy || !rows.some((row) => row.status === 'ready')}>Import all ready</button>
			</div>

			<div class="batch-list">
				{#each rows as row, index}
					<div class="batch-row" class:needs-review={row.status === 'review'} class:done={row.status === 'imported'}>
						<div class="batch-main">
							<div class="row-title">
								<strong>{row.name}</strong>
								<span class={`state ${row.status}`}>{row.statusText}</span>
							</div>

							<div class="row-controls">
								<label>
									<span>Year</span>
									<input
										class="input small"
										type="number"
										value={row.year}
										onchange={(event) => setRowValue(index, 'year', Number(event.currentTarget.value))}
										disabled={row.status === 'importing' || row.status === 'imported'}
									/>
								</label>

								<label>
									<span>Sport</span>
									<select
										class="input"
										value={row.sportId}
										onchange={(event) => setRowValue(index, 'sportId', Number(event.currentTarget.value))}
										disabled={row.status === 'importing' || row.status === 'imported'}
									>
										{#each data.sports as sport}<option value={sport.id}>{sport.name}</option>{/each}
									</select>
								</label>

								<label>
									<span>Manufacturer</span>
									<select
										class="input"
										value={row.manufacturerId}
										onchange={(event) => setRowValue(index, 'manufacturerId', Number(event.currentTarget.value))}
										disabled={row.status === 'importing' || row.status === 'imported'}
									>
										{#each data.manufacturers as manufacturer}<option value={manufacturer.id}>{manufacturer.name}</option>{/each}
									</select>
								</label>
							</div>

							{#if row.parsed}
								<div class="metrics">
									<span>{row.parsed.cards.length.toLocaleString()} cards</span>
									<span>{row.parsed.sections.length} sections</span>
									<span>{row.audit?.totals?.review || 0} review flags</span>
									<span>{row.audit?.totals?.unresolvedCards || 0} unresolved</span>
								</div>
							{/if}

							{#if row.error}<div class="row-error">{row.error}</div>{/if}
						</div>

						<div class="row-actions">
							{#if row.status === 'ready'}
								<button class="secondary" onclick={() => importRow(index)} disabled={busy}>Import</button>
							{:else if row.status === 'review'}
								<a class="secondary" href={downloadUrl(row)} download>Download file</a>
								<a class="secondary" href={regularImporterUrl(row)}>Review manually →</a>
							{:else if row.status === 'error'}
								<button class="secondary" onclick={() => prepareRow(index)} disabled={busy}>Retry prepare</button>
							{:else if row.status === 'imported' && row.importedSlug}
								<a class="secondary" href={`/sets/${row.importedSlug}`}>View set →</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<div class="source-foot">
		<span>Discovery source</span>
		<a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.sourceUrl} ↗</a>
	</div>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}.topline{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;padding-bottom:2rem;border-bottom:1px solid var(--line)}.topline h1{font-family:var(--display);font-size:clamp(3.2rem,7vw,5.8rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 .65rem}.topline p{max-width:720px;margin:0;color:var(--muted);line-height:1.55}.topline>a{color:var(--blue);text-decoration:none;font-size:.74rem;font-weight:850}
	.controls{display:grid;grid-template-columns:minmax(260px,1fr) 130px 190px auto;gap:.75rem;align-items:end;padding:1rem 0;border-bottom:1px solid var(--line)}.controls label:not(.check){display:grid;gap:.3rem}.controls label>span,.row-controls label>span{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.check{height:42px;display:flex;align-items:center;gap:.45rem;padding:0 .7rem;border:1px solid var(--line);border-radius:.65rem;background:white}.check span{color:var(--ink)!important;font-size:.68rem!important;letter-spacing:0!important;text-transform:none!important}
	.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.85rem 0}.toolbar>div:first-child{font-size:.72rem;color:var(--muted)}.toolbar>div:first-child strong{color:var(--ink)}.toolbar-actions{display:flex;gap:.5rem}.toolbar button,.primary,.secondary,.ghost{border:1px solid var(--line);border-radius:.62rem;padding:.55rem .75rem;background:white;color:inherit;font:inherit;font-size:.69rem;font-weight:850;cursor:pointer}.primary{background:var(--ink)!important;color:white!important;border-color:var(--ink)!important}.secondary{text-decoration:none;display:inline-block}.toolbar button:disabled,.primary:disabled,.secondary:disabled{opacity:.45;cursor:not-allowed}
	.error,.notice{margin:.7rem 0;padding:.8rem .9rem;border-radius:.7rem;font-size:.75rem}.error{background:#fff2ee;border:1px solid #efc8bc;color:#8f3726}.error strong,.error span,.notice strong,.notice span{display:block}.notice{background:#f3f7f8;border:1px solid #d7e3e6;color:#35545e}
	.directory{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:white}.directory-head,.directory-row{display:grid;grid-template-columns:38px minmax(300px,1.7fr) 150px 80px 170px 90px;gap:.8rem;align-items:center;padding:.68rem .8rem}.directory-head{background:#faf9f7;color:var(--muted);font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.directory-row{border-top:1px solid var(--line);font-size:.73rem}.directory-row.existing{opacity:.62}.identity strong,.identity span{display:block}.identity span{margin-top:.12rem;color:var(--muted);font-size:.64rem}.file{font-weight:900}.badge{display:inline-block;padding:.22rem .4rem;border-radius:999px;background:#edf5f6;color:var(--blue);font-size:.58rem;font-weight:900}.existing-badge{background:#f0efed;color:var(--muted)}.download{color:var(--blue);font-size:.68rem;font-weight:850;text-decoration:none}.selector{display:grid;place-items:center}.empty{padding:2.5rem;text-align:center;color:var(--muted)}
	.batch{margin-top:2rem}.batch-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:.8rem}.batch-head h2{font-family:var(--display);font-size:2.3rem;font-weight:500;letter-spacing:-.04em;margin:.25rem 0}.batch-head p{margin:0;color:var(--muted);font-size:.76rem}.batch-list{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:white}.batch-row{display:grid;grid-template-columns:1fr auto;gap:1rem;padding:1rem;border-bottom:1px solid var(--line)}.batch-row:last-child{border-bottom:0}.batch-row.needs-review{background:#fff9f1}.batch-row.done{background:#f6faf8}.row-title{display:flex;justify-content:space-between;gap:1rem;align-items:center}.row-title strong{font-size:.86rem}.state{font-size:.61rem;font-weight:900}.state.ready{color:#26734d}.state.review{color:#9a5f18}.state.error{color:#9a3424}.state.imported{color:#26734d}.row-controls{display:grid;grid-template-columns:100px 170px 170px;gap:.55rem;margin-top:.7rem}.row-controls label{display:grid;gap:.25rem}.small{max-width:100px}.metrics{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.65rem;color:var(--muted);font-size:.65rem}.row-error{margin-top:.55rem;color:#9a3424;font-size:.69rem}.row-actions{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;justify-content:flex-end}
	.source-foot{display:flex;justify-content:space-between;gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.65rem}.source-foot a{color:var(--blue);text-decoration:none}
	@media(max-width:980px){.controls{grid-template-columns:1fr 1fr}.directory{overflow:auto}.directory-head,.directory-row{min-width:850px}.batch-row{grid-template-columns:1fr}.row-actions{justify-content:flex-start}}@media(max-width:650px){.controls{grid-template-columns:1fr}.toolbar,.batch-head,.source-foot{align-items:flex-start;flex-direction:column}.toolbar-actions{flex-wrap:wrap}.row-controls{grid-template-columns:1fr}}
</style>
