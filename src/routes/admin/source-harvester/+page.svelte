<script>
	import { parseChecklistSource } from '$lib/client/checklist-engine.js';
	import { validateChecklistImport } from '$lib/checklist-validation.js';
	import { extractOddsPdf } from '$lib/client/odds-pdf.js';

	let { data } = $props();

	let year = $state(new Date().getFullYear());
	let sourceTopps = $state(true);
	let sourceCI = $state(true);
	let sportFilter = $state('All sports');
	let manufacturerFilter = $state('All manufacturers');
	let query = $state('');
	let newOnly = $state(true);

	let catalog = $state([]);
	let selected = $state(new Set());
	let queue = $state([]);
	let busy = $state(false);
	let message = $state('');
	let errorMessage = $state('');

	let reviewQueueIndex = $state(null);
	let reviewCardIndex = $state(null);
	let editSubject = $state('');
	let editAffiliation = $state('');
	let editNil = $state(false);
	let editRookie = $state(false);
	let editAutograph = $state(false);
	let editMemorabilia = $state(false);

	let oddsPreviewUrl = $state('');
	let oddsPreviewName = $state('');

	let enrichment = $state(null);
	let enrichmentProductSlug = $state('');
	let enrichmentTargetIndex = $state(null);
	let enrichmentBusy = $state(false);
	let enrichmentError = $state('');
	let enrichReleaseDate = $state(true);
	let enrichOverview = $state(true);
	let enrichFormats = $state(true);
	let enrichImage = $state(true);
	let selectedEnrichmentImage = $state('');

	const affiliationOptions = $derived(
		[...new Set((data.affiliations || []).map((item) => item.name).filter(Boolean))].sort()
	);

	const activeReviewRow = $derived(
		reviewQueueIndex == null ? null : queue[reviewQueueIndex] || null
	);

	const activeReviewCard = $derived(
		activeReviewRow && reviewCardIndex != null
			? activeReviewRow.parsed?.cards?.[reviewCardIndex] || null
			: null
	);

	const sportNames = $derived(['All sports', ...[...new Set(catalog.map((item) => item.sport).filter(Boolean))].sort()]);
	const manufacturerNames = $derived(['All manufacturers', ...[...new Set(catalog.map((item) => item.manufacturer).filter(Boolean))].sort()]);

	function canonicalSlug(name, productYear) {
		const base = String(name || '').trim().replace(new RegExp(`^${productYear}\\s+`), '');
		return `${productYear}-${base
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/&/g, ' and ')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')}`;
	}

	function existingFor(item) {
		const slug = canonicalSlug(item.name, item.year);
		return data.products.find((product) => product.slug === slug) || null;
	}

	const visible = $derived(
		catalog.filter((item) => {
			const q = query.trim().toLowerCase();
			const existing = existingFor(item);

			return (
				(!year || Number(item.year) === Number(year)) &&
				(sportFilter === 'All sports' || item.sport === sportFilter) &&
				(manufacturerFilter === 'All manufacturers' || item.manufacturer === manufacturerFilter) &&
				(!newOnly || !existing) &&
				(!q || `${item.name} ${item.sport} ${item.manufacturer} ${item.source}`.toLowerCase().includes(q))
			);
		})
	);

	function key(item) {
		return item.checklistUrl || item.pageUrl || `${item.source}:${item.name}`;
	}

	function toggle(item) {
		const next = new Set(selected);
		const value = key(item);
		next.has(value) ? next.delete(value) : next.add(value);
		selected = next;
	}

	function selectVisible() {
		const next = new Set(selected);
		for (const item of visible) if (item.checklistUrl && !existingFor(item)) next.add(key(item));
		selected = next;
	}

	function clearSelected() {
		selected = new Set();
	}

	function mergeCatalog(items) {
		const map = new Map(catalog.map((item) => [
			`${item.source}|${item.pageUrl || ''}|${item.checklistUrl || ''}|${item.name}`,
			item
		]));

		for (const item of items) {
			const k = `${item.source}|${item.pageUrl || ''}|${item.checklistUrl || ''}|${item.name}`;
			map.set(k, { ...map.get(k), ...item });
		}

		catalog = [...map.values()].sort((a, b) =>
			Number(b.year || 0) - Number(a.year || 0) ||
			String(a.name).localeCompare(String(b.name))
		);
	}

	async function discoverTopps() {
		const response = await fetch('/api/admin/source-harvester/discover?source=topps');
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || 'Topps discovery failed.');
		mergeCatalog(result.entries || []);
		return result.note || `Loaded ${(result.entries || []).length} Topps files.`;
	}

	async function discoverCI() {
		const response = await fetch(`/api/admin/source-harvester/discover?source=checklistinsider&year=${encodeURIComponent(year)}`);
		const result = await response.json();
		if (!response.ok) throw new Error(result.message || 'Checklist Insider discovery failed.');

		const stubs = result.entries || [];
		let scanned = 0;
		let found = 0;

		for (let i = 0; i < stubs.length; i += 2) {
			const batch = stubs.slice(i, i + 2);

			const results = await Promise.all(batch.map(async (stub) => {
				try {
					const scanResponse = await fetch(`/api/admin/source-harvester/scan?url=${encodeURIComponent(stub.pageUrl)}`);
					const scanResult = await scanResponse.json();
					if (!scanResponse.ok) return null;
					return scanResult.entry;
				} catch {
					return null;
				}
			}));

			scanned += batch.length;
			const usable = results.filter((entry) => entry && (entry.checklistUrl || entry.oddsUrl));
			found += usable.length;
			if (usable.length) mergeCatalog(usable);

			message = `Scanning Checklist Insider: ${scanned}/${stubs.length} pages · ${found} products with downloads`;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		return `${result.note} Found ${found} products with downloadable checklist/odds files.`;
	}

	async function refreshCatalog() {
		if (!sourceTopps && !sourceCI) {
			errorMessage = 'Choose at least one source.';
			return;
		}

		busy = true;
		errorMessage = '';
		message = 'Discovering source catalogs…';
		catalog = [];
		selected = new Set();

		const notes = [];

		try {
			if (sourceTopps) {
				try { notes.push(await discoverTopps()); }
				catch (error) { notes.push(`Topps: ${error.message}`); }
			}

			if (sourceCI) {
				try { notes.push(await discoverCI()); }
				catch (error) { notes.push(`Checklist Insider: ${error.message}`); }
			}

			message = notes.join(' · ');
		} catch (error) {
			errorMessage = error?.message || 'Catalog refresh failed.';
		} finally {
			busy = false;
		}
	}

	function downloadUrl(url, download = false) {
		return `/api/admin/source-harvester/download?${download ? 'download=1&' : ''}url=${encodeURIComponent(url)}`;
	}

	function sportIdFor(item) {
		const exact = data.sports.find((sport) => sport.name.toLowerCase() === String(item.sport || '').toLowerCase());
		return exact?.id ?? data.sports[0]?.id ?? null;
	}

	function manufacturerIdFor(item) {
		const exact = data.manufacturers.find((manufacturer) =>
			manufacturer.name.toLowerCase() === String(item.manufacturer || '').toLowerCase()
		);
		return exact?.id ?? data.manufacturers[0]?.id ?? null;
	}

	async function fetchFile(url, filename) {
		const response = await fetch(downloadUrl(url));
		if (!response.ok) throw new Error(`Download failed (${response.status}).`);
		const blob = await response.blob();
		return new File([blob], filename || 'checklist', { type: blob.type });
	}

	function openOddsPreview(row) {
		if (!row?.oddsUrl) return;
		oddsPreviewUrl = downloadUrl(row.oddsUrl);
		oddsPreviewName = row.name || 'Odds PDF';
	}

	function closeOddsPreview() {
		oddsPreviewUrl = '';
		oddsPreviewName = '';
	}

	function oddsProblems(parsedOdds, names) {
		if (!parsedOdds) return [];

		// Validate only what is actually wrong with the editable label.
		// Repeated labels are valid because separate Topps SKUs can share the
		// same collector-facing format name (Hobby, Mega EA, etc.).
		const issues = [];

		for (let index = 0; index < names.length; index++) {
			const name = String(names[index] || '').trim();

			if (!name || /^format \d+$/i.test(name)) {
				issues.push(`Column ${index + 1} needs a real pack-format name.`);
			}

			if (/^\d{3,}\b/.test(name) || /MLB-|NFL-|NBA-|NHL-/i.test(name)) {
				issues.push(`"${name}" still looks like a SKU/product code.`);
			}

			if (/^cards?\b/i.test(name)) {
				issues.push(`"${name}" incorrectly includes the Card column heading.`);
			}
		}

		return [...new Set(issues)];
	}

	function productContextAffiliation(row) {
		const name = String(row?.name || '').toLowerCase();
		const manufacturer = String(row?.manufacturer || '').toLowerCase();
		const sport = String(row?.sport || '').toLowerCase();

		if (manufacturer !== 'upper deck' || sport !== 'hockey') return '';

		if (/\bteam canada juniors?\b/.test(name)) return 'Canada';
if (/\bteam canada\b/.test(name)) return 'Canada';
if (/\bteam usa juniors?\b/.test(name)) return 'United States';

		return '';
	}

	function applyProductContextAffiliation(row, parsed) {
		const affiliation = productContextAffiliation(row);
		if (!affiliation || !parsed?.cards?.length) return parsed;

		let changed = 0;

		const cards = parsed.cards.map((card) => {
			const unresolved =
				card.affiliation === 'UNRESOLVED' ||
				card.affiliation_status === 'unresolved';

			if (!unresolved) return card;

			changed += 1;

			return {
				...card,
				affiliation,
				affiliation_id: null,
				affiliation_status: 'product-context',
				confidence: Math.max(Number(card.confidence || 0), 0.98)
			};
		});

		if (!changed) return parsed;

		return {
			...parsed,
			cards,
			high: cards.filter((card) => Number(card.confidence || 0) >= 0.85).length,
			review: cards.filter((card) => Number(card.confidence || 0) < 0.85).length,
			productContextAffiliation: affiliation,
			productContextResolved: changed
		};
	}

	function rowReadyState(row) {
		if (!row?.parsed) return row;

		if (row.parsed.safety?.blocked) {
			return {
				...row,
				status: 'parse-review',
				statusText: 'Parser review required'
			};
		}

		const unresolved = row.parsed.cards.filter(
			(card) =>
				card.affiliation === 'UNRESOLVED' ||
				card.affiliation_status === 'unresolved'
		).length;

		if (unresolved) {
			return {
				...row,
				status: 'review',
				statusText: `${unresolved} unresolved`
			};
		}

		if (row.oddsUrl) {
			if (!row.parsedOdds) {
				return {
					...row,
					status: 'odds-error',
					statusText: 'Odds could not be prepared'
				};
			}

			const problems = oddsProblems(row.parsedOdds, row.oddsFormatNames || []);

			if (problems.length || !row.oddsVerified) {
				return {
					...row,
					status: 'odds-review',
					statusText: problems.length
						? `${problems.length} odds header issue${problems.length === 1 ? '' : 's'}`
						: 'Verify odds formats'
				};
			}
		}

		return {
			...row,
			status: 'ready',
			statusText: `${row.parsed.cards.length.toLocaleString()} cards ready${row.oddsUrl ? ' + odds' : ''}`
		};
	}

	function setOddsFormatName(index, formatIndex, value) {
		const row = queue[index];
		const names = [...(row.oddsFormatNames || [])];
		names[formatIndex] = value;

		queue[index] = rowReadyState({
			...row,
			oddsFormatNames: names,
			oddsVerified: false
		});

		queue = [...queue];
	}

	function setOddsVerified(index, checked) {
		const row = queue[index];
		queue[index] = rowReadyState({
			...row,
			oddsVerified: checked
		});
		queue = [...queue];
	}

	async function prepareItem(index) {
		const row = queue[index];
		if (!row?.checklistUrl) return;

		queue[index] = { ...row, status: 'preparing', statusText: 'Parsing checklist…', error: '', oddsError: '' };
		queue = [...queue];

		try {
			const file = await fetchFile(row.checklistUrl, row.checklistFilename);
			const ext = String(row.checklistExtension || '').toLowerCase();
			let parsed;

			parsed = await parseChecklistSource(file, {
				name: row.name,
				manufacturer: row.manufacturer,
				sport: row.sport,
				extension: ext,
				affiliations: data.affiliations
			});
			parsed = applyProductContextAffiliation(row, parsed);

			const audit = validateChecklistImport(parsed.cards, parsed.checklist_meta, parsed.sections);

			let parsedOdds = null;
			let oddsFormatNames = [];
			let oddsVerified = false;
			let oddsError = '';

			if (row.oddsUrl) {
				queue[index] = {
					...queue[index],
					parsed,
					audit,
					status: 'preparing',
					statusText: 'Parsing odds PDF…'
				};
				queue = [...queue];

				try {
					const oddsFile = await fetchFile(row.oddsUrl, row.oddsFilename || 'odds.pdf');
					parsedOdds = await extractOddsPdf(oddsFile);
					oddsFormatNames = parsedOdds.formats.map((format) => format.name);
				} catch (error) {
					oddsError = error?.message || 'Could not parse odds PDF.';
				}
			}

			queue[index] = rowReadyState({
				...queue[index],
				parsed,
				audit,
				parsedOdds,
				oddsFormatNames,
				oddsVerified,
				oddsError
			});
		} catch (error) {
			queue[index] = {
				...queue[index],
				status: 'error',
				statusText: 'Checklist failed',
				error: error?.message || 'Parse failed.'
			};
		}

		queue = [...queue];
	}

	async function prepareSelected() {
		const items = catalog.filter((item) => selected.has(key(item)) && item.checklistUrl && !existingFor(item));

		if (!items.length) {
			errorMessage = 'Select at least one new product with a checklist file.';
			return;
		}

		queue = items.map((item) => ({
			...item,
			sportId: sportIdFor(item),
			manufacturerId: manufacturerIdFor(item),
			status: 'waiting',
			statusText: 'Waiting',
			error: '',
			oddsError: '',
			parsed: null,
			audit: null,
			parsedOdds: null,
			oddsFormatNames: [],
			oddsVerified: false,
			importedSlug: null,
			oddsImported: false
		}));

		busy = true;
		errorMessage = '';
		message = `Preparing ${queue.length} checklist${queue.length === 1 ? '' : 's'}…`;

		for (let i = 0; i < queue.length; i++) {
			await prepareItem(i);
		}

		const ready = queue.filter((row) => row.status === 'ready').length;
		const review = queue.filter((row) => row.status === 'review').length;
		const oddsReview = queue.filter((row) => row.status === 'odds-review').length;
		const parseReview = queue.filter((row) => row.status === 'parse-review').length;
		const failed = queue.filter((row) => row.status === 'error' || row.status === 'odds-error').length;
		message = `${ready} ready · ${review} checklist review · ${parseReview} parse review · ${oddsReview} odds review · ${failed} failed`;
		busy = false;
	}

	async function importOddsForRow(index) {
		const row = queue[index];

		if (!row?.oddsUrl || !row?.parsedOdds || !row?.oddsVerified || !row?.importedSlug) return true;

		queue[index] = { ...row, status: 'importing', statusText: 'Importing odds…', error: '' };
		queue = [...queue];

		try {
			const response = await fetch('/api/admin/source-harvester/import-odds', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					productSlug: row.importedSlug,
					filename: row.parsedOdds.filename || row.oddsFilename || 'odds.pdf',
					sourceUrl: row.oddsUrl,
					disclaimer: row.parsedOdds.disclaimer || '',
					formats: row.parsedOdds.formats.map((format, formatIndex) => ({
						...format,
						name: String(row.oddsFormatNames?.[formatIndex] || '').trim()
					})),
					rows: row.parsedOdds.rows
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Odds import failed.');
			}

			queue[index] = {
				...queue[index],
				oddsImported: true,
				status: 'imported',
				statusText: `Imported + ${result.importedRows.toLocaleString()} odds rows`
			};
			queue = [...queue];
			return true;
		} catch (error) {
			queue[index] = {
				...queue[index],
				status: 'odds-import-error',
				statusText: 'Checklist imported · odds failed',
				error: error?.message || 'Odds import failed.'
			};
			queue = [...queue];
			return false;
		}
	}

	async function importRow(index) {
		let row = queue[index];
		if (!row?.parsed) return;

		if (row.importedSlug) {
			if (row.oddsUrl && !row.oddsImported) {
				await importOddsForRow(index);
			}
			return;
		}

		if (row.status !== 'ready') return;

		queue[index] = { ...row, status: 'importing', statusText: 'Importing checklist…', error: '' };
		queue = [...queue];

		try {
			const response = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					year: Number(row.year),
					name: row.name,
					sportId: Number(row.sportId),
					manufacturerId: Number(row.manufacturerId),
					sourceUrl: row.checklistUrl,
					sourceFilename: row.checklistFilename,
					cards: row.parsed.cards,
					checklistMeta: row.parsed.checklist_meta,
					sections: row.parsed.sections,
					replaceDraft: true
				})
			});

			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Import failed.');

			queue[index] = {
				...queue[index],
				importedSlug: result.slug,
				status: row.oddsUrl ? 'importing' : 'imported',
				statusText: row.oddsUrl ? 'Checklist imported · importing odds…' : 'Imported'
			};
			queue = [...queue];

			if (row.oddsUrl) {
				await importOddsForRow(index);
			}
		} catch (error) {
			queue[index] = {
				...queue[index],
				status: 'error',
				statusText: 'Import failed',
				error: error?.message || 'Import failed.'
			};
			queue = [...queue];
		}
	}

	async function importAllReady() {
		const indexes = queue.map((row, index) => ({ row, index })).filter(({ row }) => row.status === 'ready').map(({ index }) => index);
		if (!indexes.length) return;

		busy = true;
		for (const index of indexes) await importRow(index);
		busy = false;
		const imported = queue.filter((row) => row.status === 'imported').length;
		const oddsFailures = queue.filter((row) => row.status === 'odds-import-error').length;
		message = `${imported} imported${oddsFailures ? ` · ${oddsFailures} odds import failure${oddsFailures === 1 ? '' : 's'}` : ''}`;
	}



	function unresolvedIndexes(row) {
		if (!row?.parsed?.cards) return [];
		return row.parsed.cards
			.map((card, index) => ({ card, index }))
			.filter(({ card }) =>
				card.affiliation === 'UNRESOLVED' ||
				card.affiliation_status === 'unresolved'
			)
			.map(({ index }) => index);
	}

	function openReview(queueIndex, cardIndex = null) {
		const row = queue[queueIndex];
		if (!row?.parsed?.cards?.length) return;

		const unresolved = unresolvedIndexes(row);
		const targetIndex = Number.isInteger(cardIndex)
			? cardIndex
			: unresolved[0] ?? 0;

		const card = row.parsed.cards[targetIndex];
		if (!card) return;

		reviewQueueIndex = queueIndex;
		reviewCardIndex = targetIndex;
		editSubject = card.subject || '';
		editNil = card.affiliation === 'NIL';
		editAffiliation =
			card.affiliation === 'NIL' || card.affiliation === 'UNRESOLVED'
				? ''
				: card.affiliation || '';
		editRookie = Boolean(card.rookie);
		editAutograph = Boolean(card.autograph);
		editMemorabilia = Boolean(card.memorabilia);
		errorMessage = '';
	}

	function closeReview() {
		reviewQueueIndex = null;
		reviewCardIndex = null;
	}

	function saveReviewCard() {
		if (reviewQueueIndex == null || reviewCardIndex == null) return;

		const row = queue[reviewQueueIndex];
		if (!row?.parsed) return;

		const subject = editSubject.trim();
		const affiliation = editNil ? 'NIL' : editAffiliation.trim();

		if (!subject) {
			errorMessage = 'Subject name cannot be blank.';
			return;
		}

		if (!editNil && !affiliation) {
			errorMessage = 'Enter an affiliation or mark this card as true NIL.';
			return;
		}

		const cards = row.parsed.cards.map((card, index) =>
			index === reviewCardIndex
				? {
						...card,
						subject,
						affiliation,
						affiliation_id: null,
						affiliation_status: editNil ? 'manual-nil' : 'manual',
						rookie: editRookie,
						autograph: editAutograph,
						memorabilia: editMemorabilia,
						confidence: 1
					}
				: card
		);

		const parsed = {
			...row.parsed,
			cards
		};

		const audit = validateChecklistImport(
			cards,
			parsed.checklist_meta,
			parsed.sections
		);

		const unresolved = cards.filter(
			(card) =>
				card.affiliation === 'UNRESOLVED' ||
				card.affiliation_status === 'unresolved'
		).length;

		queue[reviewQueueIndex] = {
			...row,
			parsed,
			audit,
			status: unresolved ? 'review' : 'ready',
			statusText: unresolved
				? `${unresolved} unresolved`
				: `${cards.length.toLocaleString()} cards ready`
		};

		queue = [...queue];
		errorMessage = '';

		if (!unresolved) {
			closeReview();
			return;
		}

		const nextUnresolved = unresolvedIndexes(queue[reviewQueueIndex]);
		const nextIndex =
			nextUnresolved.find((index) => index > reviewCardIndex) ??
			nextUnresolved[0];

		openReview(reviewQueueIndex, nextIndex);
	}

	async function openEnrichment(item, productSlug, queueIndex = null) {
		if (!item?.pageUrl || !productSlug) {
			errorMessage = 'This product does not have a Checklist Insider source page to enrich from.';
			return;
		}

		enrichmentBusy = true;
		enrichmentError = '';
		enrichment = null;
		enrichmentProductSlug = productSlug;
		enrichmentTargetIndex = queueIndex;
		enrichReleaseDate = true;
		enrichOverview = true;
		enrichFormats = true;
		enrichImage = true;

		try {
			const response = await fetch(
				`/api/admin/source-harvester/enrich?url=${encodeURIComponent(item.pageUrl)}&name=${encodeURIComponent(item.name || '')}`
			);
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not enrich this product.');
			enrichment = result.enrichment;
			selectedEnrichmentImage = result.enrichment.images?.[0]?.url || '';
		} catch (error) {
			enrichmentError = error?.message || 'Could not enrich this product.';
		} finally {
			enrichmentBusy = false;
		}
	}

	function closeEnrichment() {
		enrichment = null;
		enrichmentProductSlug = '';
		enrichmentTargetIndex = null;
		enrichmentError = '';
		selectedEnrichmentImage = '';
	}

	async function applyEnrichment() {
		if (!enrichment || !enrichmentProductSlug) return;

		enrichmentBusy = true;
		enrichmentError = '';

		try {
			const response = await fetch('/api/admin/source-harvester/apply-enrichment', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					productSlug: enrichmentProductSlug,
					releaseDate: enrichment.releaseDate || '',
					overview: enrichment.overview || '',
					formats: enrichment.formats || [],
					imageUrl: selectedEnrichmentImage,
					applyReleaseDate: enrichReleaseDate,
					applyOverview: enrichOverview,
					applyFormats: enrichFormats,
					applyImage: enrichImage && Boolean(selectedEnrichmentImage)
				})
			});

			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Enrichment failed.');

			if (enrichmentTargetIndex != null && queue[enrichmentTargetIndex]) {
				queue[enrichmentTargetIndex] = {
					...queue[enrichmentTargetIndex],
					enriched: true,
					statusText: queue[enrichmentTargetIndex].oddsImported
						? 'Imported + odds + enriched'
						: 'Imported + enriched'
				};
				queue = [...queue];
			}

			message = 'Product metadata and artwork saved.';
			closeEnrichment();
		} catch (error) {
			enrichmentError = error?.message || 'Enrichment failed.';
		} finally {
			enrichmentBusy = false;
		}
	}

	function setQueueValue(index, field, value) {
		queue[index] = { ...queue[index], [field]: value };
		queue = [...queue];
	}
</script>

<svelte:head><title>Source Harvester — Setbound admin</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin · Data acquisition</div>
			<h1>Source Harvester</h1>
			<p>Build a historical checklist catalog from manufacturer archives and Checklist Insider download pages.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	<section class="source-panel">
		<div class="source-options">
			<label><input type="checkbox" bind:checked={sourceTopps} /> Official Topps archive</label>
			<label><input type="checkbox" bind:checked={sourceCI} /> Checklist Insider downloads</label>
		</div>

		<div class="year-control">
			<label><span>Year</span><input class="input" type="number" min="2018" max="2035" bind:value={year} /></label>
			<button class="primary" onclick={refreshCatalog} disabled={busy}>{busy ? 'Harvesting…' : 'Harvest year'}</button>
		</div>

		<p class="source-note">Checklist Insider scanning runs two pages at a time with a short delay instead of hammering the site.</p>
	</section>

	{#if errorMessage}<div class="error">{errorMessage}</div>{/if}
	{#if message}<div class="notice">{message}</div>{/if}

	{#if catalog.length}
		<section class="filters">
			<label class="wide"><span>Search</span><input class="input" bind:value={query} placeholder="Chrome, Bowman, Prizm…" /></label>
			<label><span>Sport</span><select class="input" bind:value={sportFilter}>{#each sportNames as sport}<option>{sport}</option>{/each}</select></label>
			<label><span>Manufacturer</span><select class="input" bind:value={manufacturerFilter}>{#each manufacturerNames as manufacturer}<option>{manufacturer}</option>{/each}</select></label>
			<label class="check"><input type="checkbox" bind:checked={newOnly} /><span>New only</span></label>
		</section>

		<div class="toolbar">
			<div><strong>{visible.length.toLocaleString()}</strong> products · {selected.size} selected</div>
			<div>
				<button class="ghost" onclick={selectVisible} disabled={busy}>Select visible checklists</button>
				<button class="ghost" onclick={clearSelected} disabled={busy}>Clear</button>
				<button class="primary" onclick={prepareSelected} disabled={busy || !selected.size}>Prepare selected</button>
			</div>
		</div>

		<div class="catalog">
			<div class="catalog-head"><span></span><span>Product</span><span>Source</span><span>Checklist</span><span>Odds</span><span>Status</span></div>
			{#each visible as item}
				{@const existing = existingFor(item)}
				<div class="catalog-row" class:existing>
					<label class="selector"><input type="checkbox" checked={selected.has(key(item))} onchange={() => toggle(item)} disabled={!item.checklistUrl || Boolean(existing) || busy} /></label>
					<div class="identity">
						<strong>{item.name}</strong>
						<span>{item.year} · {item.sport || 'Unknown sport'} · {item.manufacturer || 'Unknown manufacturer'}</span>
					</div>
					<div><span class="source-badge">{item.source}</span></div>
					<div>
						{#if item.checklistUrl}
							<a href={downloadUrl(item.checklistUrl, true)}>Download {String(item.checklistExtension || '').toUpperCase()}</a>
						{:else}<span class="muted">—</span>{/if}
					</div>
					<div>
						{#if item.oddsUrl}
							<a href={downloadUrl(item.oddsUrl, true)}>Download PDF</a>
						{:else}<span class="muted">—</span>{/if}
					</div>
					<div class="catalog-status">
						{#if existing}
							<span class="badge existing-badge">In Setbound</span>
							{#if item.source === 'Checklist Insider' && item.pageUrl}
								<button class="mini-enrich" type="button" onclick={() => openEnrichment(item, existing.slug)}>Enrich</button>
							{/if}
						{:else}
							<span class="badge">New</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if queue.length}
		<section class="batch">
			<div class="batch-head">
				<div>
					<div class="eyebrow">Import queue</div>
					<h2>Prepared checklists</h2>
					<p>Clean products can bulk-import. Unresolved products stay blocked for review.</p>
				</div>
				<button class="primary" onclick={importAllReady} disabled={busy || !queue.some((row) => row.status === 'ready')}>Import all ready</button>
			</div>

			<div class="batch-list">
				{#each queue as row, index}
					<div class="batch-row" class:review={row.status === 'review'} class:done={row.status === 'imported'}>
						<div>
							<div class="row-title"><strong>{row.name}</strong><span class={`state ${row.status}`}>{row.statusText}</span></div>

							<div class="row-controls">
								<label><span>Sport</span><select class="input" value={row.sportId} onchange={(event) => setQueueValue(index, 'sportId', Number(event.currentTarget.value))}>{#each data.sports as sport}<option value={sport.id}>{sport.name}</option>{/each}</select></label>
								<label><span>Manufacturer</span><select class="input" value={row.manufacturerId} onchange={(event) => setQueueValue(index, 'manufacturerId', Number(event.currentTarget.value))}>{#each data.manufacturers as manufacturer}<option value={manufacturer.id}>{manufacturer.name}</option>{/each}</select></label>
							</div>

							{#if row.parsed}
								<div class="metrics">
									<span>{row.parsed.cards.length.toLocaleString()} cards</span>
									<span>{row.parsed.sections.length} sections</span>
									{#if row.parsed.paniniStats}
										<span>{row.parsed.paniniStats.sourceRows.toLocaleString()} source rows → {row.parsed.paniniStats.cards.toLocaleString()} checklist cards</span>
										<span>{row.parsed.paniniStats.parallelSetCount.toLocaleString()} parallel sets collapsed</span>
									{/if}
									<span>{row.audit?.totals?.review || 0} review flags</span>
									<span>{row.audit?.totals?.unresolvedCards || 0} unresolved</span>
								</div>
							{/if}
							{#if row.oddsUrl}
								<div class="odds-block">
									<div class="odds-head">
										<div>
											<strong>Odds</strong>
											<span>{row.parsedOdds ? `${row.parsedOdds.rows.length.toLocaleString()} rows` : 'PDF found'}</span>
										</div>

										<div class="odds-head-actions">
											<button class="preview-pdf" type="button" onclick={() => openOddsPreview(row)}>
												Preview source PDF
											</button>

											{#if row.oddsImported}
												<span class="odds-state good">Imported</span>
											{:else if row.parsedOdds && row.oddsVerified && !oddsProblems(row.parsedOdds, row.oddsFormatNames).length}
												<span class="odds-state good">Verified</span>
											{:else}
												<span class="odds-state warn">Needs verification</span>
											{/if}
										</div>
									</div>

									{#if row.parsedOdds}
										<div class="odds-formats">
											{#each row.parsedOdds.formats as format, formatIndex}
												<label>
													<span>Column {formatIndex + 1}</span>
													<input
														class="input"
														value={row.oddsFormatNames?.[formatIndex] || ''}
														oninput={(event) => setOddsFormatName(index, formatIndex, event.currentTarget.value)}
														disabled={row.status === 'imported' || row.status === 'importing'}
													/>
													{#if format.rawHeader}<small>{format.rawHeader}</small>{/if}
												</label>
											{/each}
										</div>

										{#if oddsProblems(row.parsedOdds, row.oddsFormatNames).length}
											<div class="odds-problems">
												<strong>Fix these before import:</strong>
												{#each oddsProblems(row.parsedOdds, row.oddsFormatNames) as problem}
													<span>{problem}</span>
												{/each}
											</div>
										{/if}

										<label class="odds-verified">
											<input
												type="checkbox"
												checked={row.oddsVerified}
												onchange={(event) => setOddsVerified(index, event.currentTarget.checked)}
												disabled={oddsProblems(row.parsedOdds, row.oddsFormatNames).length > 0 || row.status === 'imported' || row.status === 'importing'}
											/>
											<span>I verified every odds format label against the source PDF.</span>
										</label>
									{:else}
										<div class="row-error">{row.oddsError || 'Odds PDF could not be prepared.'}</div>
									{/if}
								</div>
							{/if}

							{#if row.error}<div class="row-error">{row.error}</div>{/if}
						</div>

						<div class="row-actions">
							{#if row.status === 'ready'}<button class="secondary" onclick={() => importRow(index)} disabled={busy}>Import checklist + odds</button>{/if}
							{#if row.status === 'review'}<button class="secondary" onclick={() => openReview(index)}>Review checklist inline →</button>{/if}
							{#if row.status === 'parse-review'}
								<span class="action-note">Import blocked: suspicious spreadsheet parse</span>
								<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry prepare</button>
							{/if}
							{#if row.status === 'odds-review'}<span class="action-note">Verify odds formats above</span>{/if}
							{#if row.status === 'odds-error'}<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry odds/checklist prepare</button>{/if}
							{#if row.status === 'error'}<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry</button>{/if}
							{#if row.status === 'odds-import-error'}<button class="secondary" onclick={() => importOddsForRow(index)} disabled={busy}>Retry odds import</button>{/if}
							{#if row.importedSlug && row.pageUrl}
								<button class="secondary" type="button" onclick={() => openEnrichment(row, row.importedSlug, index)}>
									{row.enriched ? 'Enriched ✓' : 'Enrich draft →'}
								</button>
							{/if}
							{#if row.importedSlug}<a class="secondary" href={`/sets/${row.importedSlug}`}>View set →</a>{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	{#if enrichmentBusy && !enrichment}
		<div class="enrich-backdrop">
			<div class="enrich-loading">Harvesting product metadata and artwork…</div>
		</div>
	{/if}

	{#if enrichment || enrichmentError}
		<div class="enrich-backdrop" role="presentation" onclick={closeEnrichment}>
			<div class="enrich-modal" role="dialog" aria-modal="true" onclick={(event) => event.stopPropagation()}>
				<div class="enrich-head">
					<div>
						<div class="eyebrow">Product enrichment</div>
						<h2>{enrichment?.title || 'Checklist Insider metadata'}</h2>
						<p>Review everything before it is written to Setbound.</p>
					</div>
					<button class="close" type="button" onclick={closeEnrichment}>×</button>
				</div>

				{#if enrichmentError}<div class="enrich-error">{enrichmentError}</div>{/if}

				{#if enrichment}
					<div class="enrich-body">
						<section class="enrich-section">
							<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichReleaseDate} /><span>Release date</span></label>
							<input class="input" type="date" bind:value={enrichment.releaseDate} disabled={!enrichReleaseDate} />
						</section>

						<section class="enrich-section">
							<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichOverview} /><span>Setbound overview</span></label>
							<textarea class="input overview-edit" rows="6" bind:value={enrichment.overview} disabled={!enrichOverview}></textarea>
							<p class="enrich-help">This is an original Setbound draft assembled from factual product details, not copied article prose.</p>
						</section>

						<section class="enrich-section">
							<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichFormats} /><span>Product configuration / box break</span></label>
							{#if enrichment.formats?.length}
								<div class="enrich-formats">
									{#each enrichment.formats as format}
										<label>
											<span>{format.label}</span>
											<textarea class="input" rows="4" bind:value={format.details} disabled={!enrichFormats}></textarea>
										</label>
									{/each}
								</div>
							{:else}
								<p class="enrich-help">No structured box configuration was detected on this page.</p>
							{/if}
						</section>

						<section class="enrich-section">
							<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichImage} /><span>Product artwork</span></label>
							{#if enrichment.images?.length}
								<div class="image-candidates">
									{#each enrichment.images as image}
										<label class:selected={selectedEnrichmentImage === image.url}>
											<input type="radio" name="enrich_image" value={image.url} bind:group={selectedEnrichmentImage} disabled={!enrichImage} />
											<img src={image.url} alt={image.alt || 'Product image candidate'} loading="lazy" />
											<span>{image.alt || 'Checklist Insider image'}</span>
										</label>
									{/each}
								</div>
							{:else}
								<p class="enrich-help">No safe Checklist Insider product-image candidates were detected.</p>
							{/if}
						</section>

						{#if enrichment.sourceFacts?.length}
							<details class="source-facts">
								<summary>Source facts used for review</summary>
								{#each enrichment.sourceFacts as fact}<p>{fact}</p>{/each}
							</details>
						{/if}
					</div>

					<div class="enrich-footer">
						<a href={enrichment.sourceUrl} target="_blank" rel="noreferrer">Open source page ↗</a>
						<div>
							<button class="ghost" type="button" onclick={closeEnrichment}>Cancel</button>
							<button class="primary" type="button" onclick={applyEnrichment} disabled={enrichmentBusy}>{enrichmentBusy ? 'Saving…' : 'Apply enrichment'}</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if oddsPreviewUrl}
		<div class="pdf-backdrop" role="presentation" onclick={closeOddsPreview}>
			<div class="pdf-modal" role="dialog" aria-modal="true" aria-labelledby="odds-preview-title" onclick={(event) => event.stopPropagation()}>
				<div class="pdf-head">
					<div>
						<div class="eyebrow">Source PDF</div>
						<h2 id="odds-preview-title">{oddsPreviewName}</h2>
						<p>Compare the PDF's package-format headers against the editable labels before verifying.</p>
					</div>

					<div class="pdf-head-actions">
						<a class="ghost" href={oddsPreviewUrl} target="_blank" rel="noreferrer">Open in new tab ↗</a>
						<button class="close" type="button" onclick={closeOddsPreview} aria-label="Close odds preview">×</button>
					</div>
				</div>

				<div class="pdf-frame-wrap">
					<iframe
						class="pdf-frame"
						src={oddsPreviewUrl}
						title={`${oddsPreviewName} odds PDF`}
					></iframe>
				</div>
			</div>
		</div>
	{/if}

	{#if activeReviewRow && activeReviewCard}
		<div class="review-backdrop" role="presentation" onclick={closeReview}>
			<div class="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onclick={(event) => event.stopPropagation()}>
				<div class="review-head">
					<div>
						<div class="eyebrow">Inline review</div>
						<h2 id="review-title">{activeReviewRow.name}</h2>
						<p>
							Card {activeReviewCard.card_number} ·
							{unresolvedIndexes(activeReviewRow).length} unresolved remaining
						</p>
					</div>
					<button class="close" onclick={closeReview} aria-label="Close review">×</button>
				</div>

				<div class="review-raw">
					<span>Source row</span>
					<code>{activeReviewCard.raw || 'No raw source row available.'}</code>
				</div>

				<div class="review-form">
					<label class="wide">
						<span>Subject</span>
						<input class="input" bind:value={editSubject} />
					</label>

					<label class="wide">
						<span>Affiliation</span>
						<input
							class="input"
							bind:value={editAffiliation}
							list="harvester-affiliations"
							disabled={editNil}
							placeholder="Team, school, country…"
						/>
						<datalist id="harvester-affiliations">
							{#each affiliationOptions as affiliation}
								<option value={affiliation}></option>
							{/each}
						</datalist>
					</label>

					<label class="nil-check">
						<input type="checkbox" bind:checked={editNil} />
						<span>True NIL / no affiliation in source</span>
					</label>

					<div class="flag-grid">
						<label><input type="checkbox" bind:checked={editRookie} /> Rookie</label>
						<label><input type="checkbox" bind:checked={editAutograph} /> Autograph</label>
						<label><input type="checkbox" bind:checked={editMemorabilia} /> Memorabilia</label>
					</div>
				</div>

				<div class="review-footer">
					<div>
						{#if activeReviewCard.affiliation === 'UNRESOLVED'}
							<span class="needs-fix">This row must be resolved before import.</span>
						{:else}
							<span class="resolved">Resolved</span>
						{/if}
					</div>
					<div class="review-actions">
						<button class="ghost" onclick={closeReview}>Cancel</button>
						<button class="primary" onclick={saveReviewCard}>Save & next unresolved</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}.topline{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;padding-bottom:2rem;border-bottom:1px solid var(--line)}.topline h1{font-family:var(--display);font-size:clamp(3.2rem,7vw,5.8rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 .65rem}.topline p{max-width:760px;margin:0;color:var(--muted)}.topline>a{color:var(--blue);text-decoration:none;font-size:.74rem;font-weight:850}
	.source-panel{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:end;padding:1rem 0;border-bottom:1px solid var(--line)}.source-options{display:flex;gap:1rem;flex-wrap:wrap}.source-options label,.check{display:flex;align-items:center;gap:.4rem;font-size:.72rem;font-weight:800}.year-control{display:flex;gap:.5rem;align-items:end}.year-control label{display:grid;gap:.25rem}.year-control span,.filters label>span,.row-controls label>span{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.source-note{grid-column:1/-1;margin:0;color:var(--muted);font-size:.66rem}
	.primary,.secondary,.ghost{border:1px solid var(--line);border-radius:.62rem;padding:.58rem .78rem;background:white;color:inherit;font:inherit;font-size:.69rem;font-weight:850;cursor:pointer;text-decoration:none}.primary{background:var(--ink);color:white;border-color:var(--ink)}button:disabled{opacity:.45;cursor:not-allowed}
	.error,.notice{margin:.75rem 0;padding:.8rem .9rem;border-radius:.7rem;font-size:.72rem}.error{background:#fff2ee;border:1px solid #efc8bc;color:#8f3726}.notice{background:#f3f7f8;border:1px solid #d7e3e6;color:#35545e}
	.filters{display:grid;grid-template-columns:minmax(260px,1fr) 170px 190px auto;gap:.7rem;align-items:end;padding:1rem 0}.filters label:not(.check){display:grid;gap:.3rem}.check{height:42px;padding:0 .7rem;border:1px solid var(--line);border-radius:.65rem;background:white}
	.toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 0}.toolbar>div{display:flex;gap:.5rem;align-items:center}.toolbar>div:first-child{font-size:.7rem;color:var(--muted)}
	.catalog{border:1px solid var(--line);border-radius:.9rem;overflow:auto;background:white}.catalog-head,.catalog-row{display:grid;grid-template-columns:38px minmax(320px,1.7fr) 130px 145px 145px 120px;gap:.75rem;align-items:center;padding:.68rem .8rem;min-width:950px}.catalog-head{background:#faf9f7;color:var(--muted);font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.catalog-row{border-top:1px solid var(--line);font-size:.7rem}.catalog-row.existing{opacity:.68}.identity strong,.identity span{display:block}.identity span{margin-top:.12rem;color:var(--muted);font-size:.62rem}.catalog-row a{display:block;color:var(--blue);font-size:.65rem;font-weight:850;text-decoration:none}.sub-link{margin-top:.2rem}.source-badge,.badge{display:inline-block;padding:.22rem .4rem;border-radius:999px;background:#eef4f5;font-size:.56rem;font-weight:900}.existing-badge{background:#f0efed;color:var(--muted)}.muted{color:var(--muted)}
	.batch{margin-top:2rem}.batch-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:.8rem}.batch-head h2{font-family:var(--display);font-size:2.2rem;font-weight:500;letter-spacing:-.04em;margin:.25rem 0}.batch-head p{margin:0;color:var(--muted);font-size:.74rem}.batch-list{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:white}.batch-row{display:grid;grid-template-columns:1fr auto;gap:1rem;padding:1rem;border-bottom:1px solid var(--line)}.batch-row:last-child{border-bottom:0}.batch-row.review{background:#fff9f1}.batch-row.done{background:#f6faf8}.row-title{display:flex;justify-content:space-between;gap:1rem}.row-controls{display:grid;grid-template-columns:180px 180px;gap:.55rem;margin-top:.7rem}.row-controls label{display:grid;gap:.25rem}.metrics{display:flex;gap:.7rem;flex-wrap:wrap;margin-top:.55rem;color:var(--muted);font-size:.63rem}.state{font-size:.6rem;font-weight:900}.state.ready,.state.imported{color:#26734d}.state.review,.state.odds-review{color:#9a5f18}.state.error,.state.odds-error,.state.odds-import-error{color:#9a3424}.row-error{margin-top:.5rem;color:#9a3424;font-size:.67rem}.row-actions{display:flex;align-items:center;gap:.4rem}
	.odds-block{margin-top:.85rem;padding:.85rem;border:1px solid var(--line);border-radius:.75rem;background:#faf9f7}.odds-head{display:flex;justify-content:space-between;align-items:center;gap:1rem}.odds-head strong,.odds-head span{display:block}.odds-head>div>span{margin-top:.1rem;color:var(--muted);font-size:.62rem}.odds-state{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.odds-state.good{color:#26734d}.odds-state.warn{color:#9a5f18}.odds-formats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.55rem;margin-top:.7rem}.odds-formats label{display:grid;gap:.22rem}.odds-formats label>span{color:var(--muted);font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.odds-formats small{color:var(--muted);font-size:.55rem;line-height:1.35}.odds-problems{display:grid;gap:.18rem;margin-top:.65rem;padding:.6rem .7rem;border:1px solid #efc8bc;border-radius:.6rem;background:#fff4f0;color:#8f3726;font-size:.62rem}.odds-problems strong{margin-bottom:.1rem}.odds-verified{display:flex!important;align-items:center;gap:.45rem;margin-top:.65rem;font-size:.65rem;font-weight:800}.action-note{font-size:.62rem;color:#9a5f18;font-weight:850}
	.catalog-status{display:grid;justify-items:start;gap:.35rem}.mini-enrich{border:0;background:transparent;padding:0;color:var(--blue);font:inherit;font-size:.58rem;font-weight:900;cursor:pointer}.mini-enrich:hover{text-decoration:underline}
	.enrich-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:1rem;background:rgba(20,18,16,.52);backdrop-filter:blur(2px)}.enrich-loading{padding:1rem 1.2rem;border-radius:.8rem;background:#fff;font-size:.75rem;font-weight:850;box-shadow:0 20px 70px rgba(0,0,0,.2)}.enrich-modal{width:min(1040px,96vw);max-height:92vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:1rem;box-shadow:0 24px 90px rgba(0,0,0,.24)}.enrich-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1rem 1.15rem;border-bottom:1px solid var(--line)}.enrich-head h2{font-family:var(--display);font-size:2rem;font-weight:500;letter-spacing:-.04em;margin:.25rem 0}.enrich-head p{margin:0;color:var(--muted);font-size:.7rem}.enrich-body{overflow:auto;padding:0 1.15rem}.enrich-section{padding:1rem 0;border-bottom:1px solid var(--line)}.enrich-toggle{display:flex;align-items:center;gap:.45rem;margin-bottom:.6rem;font-size:.7rem;font-weight:900}.overview-edit{width:100%;resize:vertical;line-height:1.5}.enrich-help{margin:.4rem 0 0;color:var(--muted);font-size:.62rem;line-height:1.45}.enrich-formats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.enrich-formats label{display:grid;gap:.3rem}.enrich-formats label>span{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.enrich-formats textarea{resize:vertical;line-height:1.45}.image-candidates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.image-candidates label{position:relative;display:grid;grid-template-rows:150px auto;overflow:hidden;border:1px solid var(--line);border-radius:.7rem;background:#faf9f7;cursor:pointer}.image-candidates label.selected{outline:2px solid var(--blue);outline-offset:1px}.image-candidates input{position:absolute;top:.55rem;left:.55rem;z-index:2}.image-candidates img{width:100%;height:100%;object-fit:contain;background:#fff}.image-candidates label>span{padding:.5rem;font-size:.58rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source-facts{padding:1rem 0}.source-facts summary{cursor:pointer;font-size:.66rem;font-weight:900}.source-facts p{font-size:.65rem;line-height:1.5;color:var(--muted)}.enrich-footer{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 1.15rem;border-top:1px solid var(--line);background:#faf9f7}.enrich-footer>a{color:var(--blue);font-size:.65rem;font-weight:850;text-decoration:none}.enrich-footer>div{display:flex;gap:.5rem}.enrich-error{margin:1rem 1.15rem;padding:.7rem;border:1px solid #efc8bc;border-radius:.6rem;background:#fff2ee;color:#8f3726;font-size:.7rem}
	.odds-head-actions{display:flex;align-items:center;gap:.55rem}.preview-pdf{border:1px solid var(--line);border-radius:.55rem;padding:.4rem .55rem;background:white;color:var(--blue);font:inherit;font-size:.6rem;font-weight:850;cursor:pointer}.preview-pdf:hover{background:#f7f7f6}
	.pdf-backdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:1rem;background:rgba(20,18,16,.5);backdrop-filter:blur(2px)}.pdf-modal{width:min(1100px,96vw);height:min(88vh,950px);display:grid;grid-template-rows:auto 1fr;overflow:hidden;background:white;border:1px solid var(--line);border-radius:1rem;box-shadow:0 24px 80px rgba(0,0,0,.24)}.pdf-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;padding:1rem 1.1rem;border-bottom:1px solid var(--line)}.pdf-head h2{margin:.25rem 0;font-family:var(--display);font-size:1.7rem;font-weight:500;letter-spacing:-.035em}.pdf-head p{margin:0;color:var(--muted);font-size:.68rem}.pdf-head-actions{display:flex;align-items:center;gap:.5rem}.pdf-frame-wrap{min-height:0;background:#efefed}.pdf-frame{width:100%;height:100%;border:0;background:white}
	.review-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:1rem;background:rgba(20,18,16,.42);backdrop-filter:blur(2px)}.review-modal{width:min(760px,100%);max-height:min(86vh,900px);overflow:auto;background:white;border:1px solid var(--line);border-radius:1rem;box-shadow:0 24px 80px rgba(0,0,0,.2)}.review-head{display:flex;justify-content:space-between;gap:1rem;padding:1.2rem 1.25rem;border-bottom:1px solid var(--line)}.review-head h2{margin:.25rem 0;font-family:var(--display);font-size:2rem;font-weight:500;letter-spacing:-.04em}.review-head p{margin:0;color:var(--muted);font-size:.72rem}.close{border:0;background:transparent;font-size:1.5rem;line-height:1;cursor:pointer}.review-raw{padding:.9rem 1.25rem;background:#faf9f7;border-bottom:1px solid var(--line)}.review-raw span{display:block;margin-bottom:.35rem;color:var(--muted);font-size:.57rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.review-raw code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.68rem;line-height:1.5}.review-form{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;padding:1.2rem 1.25rem}.review-form label>span{display:block;margin-bottom:.3rem;color:var(--muted);font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.review-form .wide{grid-column:1/-1}.nil-check{grid-column:1/-1;display:flex;align-items:center;gap:.45rem}.nil-check span{margin:0!important;color:var(--ink)!important;text-transform:none!important;letter-spacing:0!important;font-size:.7rem!important}.flag-grid{grid-column:1/-1;display:flex;gap:1rem;flex-wrap:wrap;padding-top:.25rem}.flag-grid label{display:flex;align-items:center;gap:.4rem;font-size:.7rem;font-weight:800}.review-footer{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 1.25rem;border-top:1px solid var(--line);background:#faf9f7}.review-actions{display:flex;gap:.5rem}.needs-fix{color:#9a3424;font-size:.66rem;font-weight:850}.resolved{color:#26734d;font-size:.66rem;font-weight:850}
	@media(max-width:850px){.enrich-formats,.image-candidates{grid-template-columns:1fr}.enrich-footer{align-items:flex-start;flex-direction:column}.enrich-footer>div{width:100%;flex-wrap:wrap}.source-panel,.filters{grid-template-columns:1fr}.source-note{grid-column:auto}.toolbar,.batch-head{align-items:flex-start;flex-direction:column}.batch-row{grid-template-columns:1fr}.row-actions{justify-content:flex-start}.row-controls{grid-template-columns:1fr}}
</style>
