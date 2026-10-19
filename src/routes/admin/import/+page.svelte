<script>
	import { parseSourceCsv } from '$lib/client/source-csv.js';
	import { extractPdfText } from '$lib/client/pdf.js';
	import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
	import { parseChecklistText, groupByChecklist } from '$lib/client/checklist-parser.js';
	import { validateChecklistImport } from '$lib/checklist-validation.js';

	let { data } = $props();

	let year = $state(data.prefill?.year || new Date().getFullYear());
	let name = $state(data.prefill?.name || '');
	let sportId = $state();
	let manufacturerId = $state();
	let sourceUrl = $state(data.prefill?.source || '');
	let sourceFilename = $state('');
	let sourceKind = $state('');
	let rawDialog = $state();
	let text = $state('');
	let parsed = $state(null);
	let busy = $state(false);
	let status = $state('');
	let errorMessage = $state('');
	let selected = $state(new Set());
	let auditFilter = $state('all');

	let editingIndex = $state(null);
	let editSubject = $state('');
	let editAffiliation = $state('');
	let editNil = $state(false);
	let editRookie = $state(false);
	let editAutograph = $state(false);
	let editMemorabilia = $state(false);
	let remoteLoaded = $state(false);

	async function loadRemoteChecklist(remoteUrl) {
		busy = true;
		errorMessage = '';
		parsed = null;
		text = '';
		status = 'Downloading source checklist…';

		try {
			const response = await fetch(`/api/admin/source-harvester/download?url=${encodeURIComponent(remoteUrl)}`);
			if (!response.ok) throw new Error(`Remote checklist download failed (${response.status}).`);
			const blob = await response.blob();
			const filename = decodeURIComponent(new URL(remoteUrl).pathname.split('/').pop() || 'checklist');
			const file = new File([blob], filename, { type: blob.type });
			sourceFilename = filename;

			const ext = extension(filename);
			if (ext === 'pdf') {
				sourceKind = 'PDF';
				status = 'Reading PDF…';
				text = await extractPdfText(file);
				status = 'Parsing checklist…';
				finishParse(parseChecklistText(text, data.affiliations));
			} else if (ext === 'csv') {
				sourceKind = 'CSV';
				finishParse(await parseSourceCsv(file));
			} else if (ext === 'xls' || ext === 'xlsx') {
				sourceKind = ext.toUpperCase();
				status = `Reading ${ext.toUpperCase()} workbook…`;
				finishParse(await extractSpreadsheetChecklist(file));
			} else {
				throw new Error(`Unsupported checklist file type: .${ext}`);
			}
			status = '';
		} catch (error) {
			errorMessage = error?.message || 'Could not load remote checklist.';
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (!remoteLoaded && data.prefill?.source) {
			remoteLoaded = true;
			loadRemoteChecklist(data.prefill.source);
		}
	});

	$effect(() => {
		if (sportId == null) sportId = data.sports[0]?.id ?? 1;
		if (manufacturerId == null) manufacturerId = data.manufacturers[0]?.id ?? 1;
	});

	function finishParse(result) {
		result.audit = validateChecklistImport(
			result.cards,
			result.checklist_meta,
			result.sections
		);

		parsed = result;
		selected = new Set(result.cards.map((_, index) => index));
		auditFilter = result.audit?.issues?.length ? 'issues' : 'all';
	}

	function extension(filename) {
		return String(filename || '').toLowerCase().split('.').pop();
	}

	async function fileChanged(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

		sourceFilename = file.name;
		errorMessage = '';
		parsed = null;
		text = '';
		busy = true;

		try {
			const ext = extension(file.name);

			if (ext === 'csv') {
				sourceKind = 'CSV';
				status = 'Reading CSV…';
				finishParse(await parseSourceCsv(file));
			} else if (ext === 'pdf') {
				sourceKind = 'PDF';
				status = 'Reading PDF…';
				text = await extractPdfText(file);

				status = 'Parsing checklist…';
				finishParse(parseChecklistText(text, data.affiliations));
			} else if (ext === 'xls' || ext === 'xlsx') {
				sourceKind = ext.toUpperCase();
				status = `Reading ${ext.toUpperCase()} workbook…`;

				const result = await extractSpreadsheetChecklist(file);

				status = 'Parsing spreadsheet…';
				finishParse(result);
			} else {
				throw new Error('Use a CSV, CSV, PDF, XLS, or XLSX checklist.');
			}

			status = '';
		} catch (error) {
			errorMessage = error?.message || 'Could not read checklist.';
		} finally {
			busy = false;
		}
	}

	function parsePasted() {
		sourceKind = 'TEXT';
		finishParse(parseChecklistText(text, data.affiliations));
		rawDialog?.close();
	}

	function toggle(index) {
		const next = new Set(selected);
		next.has(index) ? next.delete(index) : next.add(index);
		selected = next;
	}

	function openEditor(index) {
		if (!parsed?.cards?.[index]) return;

		const card = parsed.cards[index];

		editingIndex = index;
		editSubject = card.subject || '';
		editNil = card.affiliation === 'NIL';
		editAffiliation =
			card.affiliation === 'NIL' || card.affiliation === 'UNRESOLVED'
				? ''
				: card.affiliation || '';
		editRookie = Boolean(card.rookie);
		editAutograph = Boolean(card.autograph);
		editMemorabilia = Boolean(card.memorabilia);
	}

	function openIssue(issue) {
		const index = issue?.cardIndexes?.[0];

		if (Number.isInteger(index)) {
			openEditor(index);
			return;
		}

		const checklist = issue?.checklist;
		if (!checklist || !parsed) return;

		const fallback = parsed.cards.findIndex(
			(card) =>
				card.checklist_name === checklist &&
				(card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved')
		);

		if (fallback >= 0) openEditor(fallback);
	}

	function closeEditor() {
		editingIndex = null;
	}

	function saveEditor() {
		if (!parsed || editingIndex == null) return;

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

		const cards = parsed.cards.map((card, index) =>
			index === editingIndex
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

		parsed = {
			...parsed,
			cards,
			audit: validateChecklistImport(cards, parsed.checklist_meta, parsed.sections)
		};

		errorMessage = '';
		closeEditor();
	}

	async function importData() {
		if (!parsed || !name) return;

		const cards = parsed.cards.filter((_, index) => selected.has(index));
		const audit = validateChecklistImport(
			cards,
			parsed.checklist_meta,
			parsed.sections
		);

		if (!audit.canImport) {
			errorMessage = 'Nothing is selected to import.';
			return;
		}

		const unresolved = cards.filter(
			(card) => card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved'
		);

		if (unresolved.length) {
			errorMessage =
				`${unresolved.length} selected card${unresolved.length === 1 ? '' : 's'} still ` +
				`have unresolved affiliations. Fix them here or deselect them before importing.`;
			return;
		}

		busy = true;
		status = 'Importing…';
		errorMessage = '';

		try {
			const response = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					year: Number(year),
					name,
					sportId: Number(sportId),
					manufacturerId: Number(manufacturerId),
					sourceUrl,
					sourceFilename,
					cards,
					checklistMeta: parsed.checklist_meta,
					sections: parsed.sections
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Import failed.');
			}

			location.href = `/sets/${result.slug}`;
		} catch (error) {
			errorMessage = error?.message || 'Import failed.';
			busy = false;
			status = '';
		}
	}

	const groups = $derived(parsed ? groupByChecklist(parsed.cards) : {});

	const currentAudit = $derived(
		parsed
			? validateChecklistImport(
					parsed.cards.filter((_, index) => selected.has(index)),
					parsed.checklist_meta,
					parsed.sections
				)
			: null
	);

	const visibleIssues = $derived(
		!currentAudit
			? []
			: auditFilter === 'review'
				? currentAudit.review
				: currentAudit.issues
	);

	const currentEditingCard = $derived(
		parsed && editingIndex != null ? parsed.cards[editingIndex] : null
	);

	const affiliationOptions = $derived(
		[...new Set((data.affiliations || []).map((item) => item.name).filter(Boolean))].sort()
	);
</script>

<svelte:head><title>Import checklist — setbound</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Import a checklist</h1>
			<p>Upload the official checklist, review what Setbound found, then import it.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	<div class="form card-shell">
		<label>
			Sport
			<select class="input" bind:value={sportId}>
				{#each data.sports as sport}
					<option value={sport.id}>{sport.name}</option>
				{/each}
			</select>
		</label>

		<label>
			Year
			<input class="input" type="number" bind:value={year} />
		</label>

		<label>
			Manufacturer
			<select class="input" bind:value={manufacturerId}>
				{#each data.manufacturers as manufacturer}
					<option value={manufacturer.id}>{manufacturer.name}</option>
				{/each}
			</select>
		</label>

		<label class="wide">
			Product name
			<input class="input" bind:value={name} placeholder="Universe WWE" />
		</label>

		<label class="wide">
			Official source URL <span>(optional)</span>
			<input class="input" bind:value={sourceUrl} placeholder="https://…" />
		</label>
	</div>

	<div class="upload">
		<input
			id="checklist-file"
			type="file"
			accept=".csv,.pdf,.xls,.xlsx,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
			onchange={fileChanged}
		/>

		<label for="checklist-file">
			<strong>{sourceFilename || 'Choose an official checklist'}</strong>
			<span>
				{#if busy}
					{status}
				{:else if sourceFilename}
					{sourceKind} loaded locally before import.
				{:else}
					CSV, PDF, XLS, or XLSX
				{/if}
			</span>
		</label>

		<div>or</div>

		<button class="btn btn-secondary" onclick={() => rawDialog?.showModal()}>
			Paste extracted text
		</button>
	</div>

	{#if errorMessage}
		<div class="error">{errorMessage}</div>
	{/if}

	{#if parsed && currentAudit}
		{#if parsed.sheetStats?.length}
			<div class="source-note">
				<strong>Workbook detected</strong>
				<span>
					{parsed.sheetStats.length} sheet{parsed.sheetStats.length === 1 ? '' : 's'} ·
					{parsed.sheetStats.map((sheet) => sheet.name).join(', ')}
				</span>
			</div>
		{/if}

		{#if currentAudit.totals.unresolvedCards > 0}
			<div class="unresolved-banner">
				<strong>
					{currentAudit.totals.unresolvedCards} selected card{currentAudit.totals.unresolvedCards === 1 ? '' : 's'}
					still {currentAudit.totals.unresolvedCards === 1 ? 'has' : 'have'} unresolved affiliations.
				</strong>
				<span>Use the Review buttons below to fix them without leaving this import.</span>
			</div>
		{/if}

		<div class="summary-grid">
			<div>
				<strong>{selected.size.toLocaleString()}</strong>
				<span>cards selected</span>
			</div>
			<div>
				<strong>{parsed.sections.length}</strong>
				<span>sections detected</span>
			</div>
			<div class:warn={currentAudit.totals.review > 0}>
				<strong>{currentAudit.totals.review}</strong>
				<span>review flags</span>
			</div>
			<div>
				<strong>{currentAudit.totals.nilCards}</strong>
				<span>NIL / no affiliation</span>
			</div>
		</div>

		<section class="audit card-shell">
			<div class="audit-head">
				<div>
					<div class="eyebrow">Import audit</div>
					<h2>Ready to review</h2>
					<p>
						Fix unresolved rows here. Other review flags are advisory and can be deselected before import.
					</p>
				</div>

				<div class="audit-metrics">
					<span>{currentAudit.totals.lowConfidence} low confidence</span>
					<span>{currentAudit.totals.review} review</span>
				</div>
			</div>

			{#if currentAudit.issues.length}
				<div class="audit-tabs">
					<button class:active={auditFilter === 'all'} onclick={() => auditFilter = 'all'}>
						All issues <span>{currentAudit.issues.length}</span>
					</button>

					<button class:active={auditFilter === 'review'} onclick={() => auditFilter = 'review'}>
						Review <span>{currentAudit.review.length}</span>
					</button>
				</div>

				<div class="issue-list">
					{#each visibleIssues as issue}
						<div class="issue-row">
							<span class="issue-dot"></span>
							<div>
								<strong>{issue.checklist || 'Import'}</strong>
								<p>{issue.message}</p>
							</div>

							{#if issue.cardIndexes?.length}
								<button class="issue-action" onclick={() => openIssue(issue)}>Review</button>
							{:else}
								<span class="issue-type">Review</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<div class="review-head">
			<div>
				<h2>Review rows</h2>
				<p>{selected.size.toLocaleString()} of {parsed.cards.length.toLocaleString()} rows selected</p>
			</div>

			<button
				class="btn btn-accent"
				disabled={busy || !name || selected.size === 0 || currentAudit.totals.unresolvedCards > 0}
				onclick={importData}
			>
				{busy
					? status
					: currentAudit.totals.unresolvedCards > 0
						? `Fix ${currentAudit.totals.unresolvedCards} unresolved`
						: `Import ${selected.size.toLocaleString()} cards`}
			</button>
		</div>

		{#each Object.entries(groups) as [section, cards]}
			{@const meta = parsed.checklist_meta?.[section]}
			{@const sectionAudit = currentAudit.byChecklist?.[section]}

			<details open={sectionAudit?.issues > 0}>
				<summary>
					<div class="summary-title">
						<strong>{section}</strong>
						{#if sectionAudit?.issues}
							<span class="section-badge">{sectionAudit.issues} review</span>
						{/if}
					</div>

					<span>
						{cards.length} cards
						{meta?.card_count_declared ? ` · ${meta.card_count_declared} declared` : ''}
					</span>
				</summary>

				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th></th>
								<th>#</th>
								<th>Subject</th>
								<th>Affiliation</th>
								<th>Flags</th>
								<th>Confidence</th>
								<th></th>
							</tr>
						</thead>

						<tbody>
							{#each cards as card}
								{@const index = parsed.cards.indexOf(card)}
								{@const unresolved = card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved'}

								<tr class:low={card.confidence < 0.85} class:unresolved>
									<td>
										<input
											type="checkbox"
											checked={selected.has(index)}
											onchange={() => toggle(index)}
										/>
									</td>
									<td>{card.card_number}</td>
									<td><strong>{card.subject}</strong></td>
									<td class:muted={card.affiliation === 'NIL' || unresolved}>
										{card.affiliation}
									</td>
									<td>
										{card.rookie ? 'RC ' : ''}
										{card.autograph ? 'AU ' : ''}
										{card.memorabilia ? 'MEM ' : ''}
									</td>
									<td>{Math.round(card.confidence * 100)}%</td>
									<td><button class="row-edit" onclick={() => openEditor(index)}>Edit</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		{/each}
	{/if}
</section>

<dialog bind:this={rawDialog} class="raw-dialog">
	<form method="dialog" class="dialog-head">
		<strong>Paste extracted checklist text</strong>
		<button>×</button>
	</form>

	<textarea bind:value={text} placeholder="Paste extracted checklist text here…"></textarea>

	<div class="dialog-actions">
		<button class="btn btn-secondary" onclick={() => rawDialog?.close()}>Cancel</button>
		<button class="btn btn-accent" onclick={parsePasted}>Parse text</button>
	</div>
</dialog>

{#if currentEditingCard}
	<div class="editor-backdrop" role="presentation" onclick={closeEditor}>
		<div class="editor" role="dialog" aria-modal="true" aria-label="Fix import row" onclick={(event) => event.stopPropagation()}>
			<div class="editor-head">
				<div>
					<div class="eyebrow">Fix before import</div>
					<h2>{currentEditingCard.card_number} · {currentEditingCard.subject}</h2>
					<p>{currentEditingCard.checklist_name}</p>
				</div>
				<button class="close" onclick={closeEditor}>×</button>
			</div>

			{#if currentEditingCard.raw}
				<div class="source-row">
					<span>Source row</span>
					<code>{currentEditingCard.raw}</code>
				</div>
			{/if}

			<div class="editor-grid">
				<label>
					<span>Subject</span>
					<input bind:value={editSubject} />
				</label>

				<label>
					<span>Team / affiliation</span>
					<input
						bind:value={editAffiliation}
						list="import-affiliations"
						disabled={editNil}
						placeholder="Type the exact source affiliation"
					/>
					<datalist id="import-affiliations">
						{#each affiliationOptions as affiliation}
							<option value={affiliation}></option>
						{/each}
					</datalist>
				</label>
			</div>

			<label class="nil-choice">
				<input type="checkbox" bind:checked={editNil} />
				<span><strong>True NIL / no affiliation</strong> — the source genuinely has no team, school, country, or organization.</span>
			</label>

			<fieldset>
				<legend>Tags</legend>
				<label><input type="checkbox" bind:checked={editRookie} /> Rookie / RC</label>
				<label><input type="checkbox" bind:checked={editAutograph} /> Autograph / AU</label>
				<label><input type="checkbox" bind:checked={editMemorabilia} /> Memorabilia / relic</label>
			</fieldset>

			<div class="editor-note">
				Saving here only changes this pending import row. It does not alter your existing affiliation database.
			</div>

			<div class="editor-actions">
				<button class="btn btn-secondary" onclick={closeEditor}>Cancel</button>
				<button class="btn btn-accent" onclick={saveEditor}>Save correction</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page{padding-top:3rem;padding-bottom:6rem}
	.topline{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;margin-bottom:1.5rem}
	.topline h1{font-size:clamp(3rem,6vw,5rem);letter-spacing:-.06em;margin:.35rem 0 .5rem}
	.topline p{margin:0;color:var(--muted)}
	.topline>a{color:var(--blue);text-decoration:none;font-size:.75rem;font-weight:850}

	.card-shell{border:1px solid var(--line);border-radius:1rem;background:#fff}
	.form{display:grid;grid-template-columns:170px 130px 190px 1fr;gap:.75rem;padding:1rem}
	.form label{display:grid;gap:.35rem;font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}
	.form label span{color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0}
	.form .wide{grid-column:span 2}
	.input{width:100%;box-sizing:border-box;border:1px solid var(--line-strong);border-radius:.65rem;padding:.7rem;background:white;font:inherit}

	.upload{display:flex;align-items:center;justify-content:center;gap:1rem;min-height:125px;margin:1rem 0;border:1px dashed var(--line-strong);border-radius:1rem}
	.upload>input{display:none}
	.upload>label{display:grid;gap:.2rem;text-align:center;cursor:pointer}
	.upload label span{color:var(--muted);font-size:.72rem}
	.upload>div{color:var(--muted);font-size:.7rem}

	.btn{border-radius:.65rem;padding:.65rem .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.btn-secondary{border:1px solid var(--line-strong);background:#fff;color:inherit}
	.btn-accent{border:0;background:var(--blue);color:white}
	.btn:disabled{opacity:.45;cursor:not-allowed}

	.error,.unresolved-banner{margin:.85rem 0;padding:.8rem 1rem;border-radius:.7rem}
	.error{border:1px solid #efc2bb;background:#fff8f7;color:#8d3028}
	.unresolved-banner{display:grid;gap:.2rem;border:1px solid #efc58f;background:#fff8ee;color:#7b4518}
	.unresolved-banner span{font-size:.72rem}

	.source-note{display:flex;justify-content:space-between;padding:.8rem 1rem;border:1px solid var(--line);border-radius:.75rem}
	.source-note span{color:var(--muted);font-size:.72rem}

	.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:1rem 0}
	.summary-grid>div{display:grid;gap:.1rem;padding:1rem;border:1px solid var(--line);border-radius:.9rem}
	.summary-grid strong{font-size:1.5rem}
	.summary-grid span{font-size:.68rem}
	.summary-grid .warn strong{color:#b15c11}

	.audit{padding:1rem}
	.audit-head{display:flex;justify-content:space-between;gap:2rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
	.audit-head h2{margin:.25rem 0}
	.audit-head p{margin:.2rem 0 0;color:var(--muted);font-size:.76rem}
	.audit-metrics{display:flex;gap:.45rem;align-items:flex-start}
	.audit-metrics span{border:1px solid var(--line);border-radius:999px;padding:.45rem .55rem;font-size:.62rem;font-weight:850}

	.audit-tabs{display:flex;gap:.3rem;padding:.7rem 0;border-bottom:1px solid var(--line)}
	.audit-tabs button{border:0;background:transparent;padding:.5rem .6rem;border-radius:.55rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.audit-tabs button.active{background:#f0efed}
	.issue-row{display:grid;grid-template-columns:10px 1fr auto;gap:.7rem;align-items:center;padding:.75rem 0;border-bottom:1px solid var(--line)}
	.issue-dot{width:6px;height:6px;border-radius:50%;background:#ed9443}
	.issue-row p{margin:.12rem 0 0;color:var(--muted);font-size:.69rem}
	.issue-type,.issue-action{border:1px solid var(--line);border-radius:999px;padding:.38rem .55rem;background:white;font:inherit;font-size:.62rem;font-weight:850}
	.issue-action{cursor:pointer}

	.review-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin:2rem 0 .8rem}
	.review-head h2{margin:0}.review-head p{margin:.2rem 0 0;color:var(--muted);font-size:.7rem}

	details{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;margin-bottom:.8rem;background:#fff}
	summary{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:.85rem 1rem;cursor:pointer;list-style:none}
	summary>span{color:var(--muted);font-size:.69rem}
	.summary-title{display:flex;gap:.55rem;align-items:center}
	.section-badge{border:1px solid #efc58f;background:#fff8ee;color:#9c561b;border-radius:999px;padding:.25rem .4rem;font-size:.58rem;font-weight:850}

	.table-wrap{overflow:auto;border-top:1px solid var(--line)}
	table{width:100%;border-collapse:collapse;font-size:.74rem}
	th{text-align:left;padding:.65rem .8rem;background:#fafafa;font-size:.57rem;text-transform:uppercase;letter-spacing:.08em}
	td{padding:.72rem .8rem;border-top:1px solid var(--line)}
	tr.low{background:#fffaf4}
	tr.unresolved{background:#fff7ef}
	td.muted{color:var(--muted)}
	.row-edit{border:1px solid var(--line-strong);background:white;border-radius:.5rem;padding:.38rem .5rem;font:inherit;font-size:.62rem;font-weight:850;cursor:pointer}

	.raw-dialog{width:min(800px,calc(100vw - 2rem));border:0;border-radius:1rem;padding:1rem}
	.raw-dialog::backdrop{background:rgba(20,18,16,.45)}
	.dialog-head,.dialog-actions{display:flex;justify-content:space-between;align-items:center;gap:.8rem}
	.dialog-head button{border:0;background:transparent;font-size:1.2rem;cursor:pointer}
	.raw-dialog textarea{width:100%;box-sizing:border-box;min-height:420px;margin:1rem 0;padding:.8rem;border:1px solid var(--line-strong);border-radius:.7rem;font:inherit}
	.dialog-actions{justify-content:flex-end}

	.editor-backdrop{position:fixed;inset:0;z-index:200;background:rgba(20,18,16,.48);display:grid;place-items:center;padding:1rem}
	.editor{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:1rem;padding:1.1rem;box-shadow:0 30px 90px rgba(0,0,0,.22)}
	.editor-head{display:flex;justify-content:space-between;gap:1rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
	.editor-head h2{margin:.25rem 0 .15rem}
	.editor-head p{margin:0;color:var(--muted);font-size:.72rem}
	.close{width:36px;height:36px;border:1px solid var(--line);background:white;border-radius:50%;font-size:1.1rem;cursor:pointer}
	.source-row{display:grid;gap:.3rem;margin:1rem 0;padding:.7rem;background:#f6f5f3;border-radius:.65rem}
	.source-row>span,.editor-grid label>span{font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.source-row code{white-space:pre-wrap;font-size:.7rem}
	.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
	.editor-grid label{display:grid;gap:.3rem}
	.editor-grid input{width:100%;box-sizing:border-box;padding:.7rem;border:1px solid var(--line-strong);border-radius:.65rem;font:inherit}
	.nil-choice{display:flex;align-items:flex-start;gap:.5rem;margin:1rem 0;padding:.7rem;border:1px solid var(--line);border-radius:.65rem;font-size:.72rem;line-height:1.4}
	.editor fieldset{display:flex;gap:1rem;flex-wrap:wrap;border:1px solid var(--line);border-radius:.65rem;padding:.75rem}
	.editor legend{font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
	.editor fieldset label{display:flex;gap:.35rem;align-items:center;font-size:.72rem}
	.editor-note{margin-top:1rem;color:var(--muted);font-size:.68rem}
	.editor-actions{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)}

	@media(max-width:900px){
		.form{grid-template-columns:1fr 1fr}
		.form .wide{grid-column:auto}
		.summary-grid{grid-template-columns:1fr 1fr}
	}
	@media(max-width:650px){
		.form,.summary-grid,.editor-grid{grid-template-columns:1fr}
		.upload,.audit-head,.review-head{align-items:flex-start;flex-direction:column}
	}
</style>
