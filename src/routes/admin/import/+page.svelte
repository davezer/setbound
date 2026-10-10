<script>
	import { extractPdfText } from '$lib/client/pdf.js';
	import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
	import { parseChecklistText, groupByChecklist } from '$lib/client/checklist-parser.js';
	import { validateChecklistImport } from '$lib/checklist-validation.js';

	let { data } = $props();

	let year = $state(new Date().getFullYear());
	let name = $state('');
	let sportId = $state();
	let manufacturerId = $state();
	let sourceUrl = $state('');
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

			if (ext === 'pdf') {
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
				throw new Error('Use a PDF, XLS, or XLSX checklist.');
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
		const result = parseChecklistText(text, data.affiliations);
		finishParse(result);
	}

	function toggle(index) {
		const next = new Set(selected);
		next.has(index) ? next.delete(index) : next.add(index);
		selected = next;
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
			accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
					PDF, XLS, or XLSX
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
						Flags are advisory. Deselect anything that looks wrong before importing.
					</p>
				</div>

				<div class="audit-metrics">
					<span>{currentAudit.totals.lowConfidence} low confidence</span>
					<span>{currentAudit.totals.review} review</span>
				</div>
			</div>

			{#if currentAudit.issues.length}
				<div class="audit-tabs">
					<button
						class:active={auditFilter === 'all'}
						onclick={() => auditFilter = 'all'}
					>
						All issues <span>{currentAudit.issues.length}</span>
					</button>

					<button
						class:active={auditFilter === 'review'}
						onclick={() => auditFilter = 'review'}
					>
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
							<span class="issue-type">Review</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<div class="review-head">
			<div>
				<h2>Review rows</h2>
				<p>
					{selected.size.toLocaleString()} of {parsed.cards.length.toLocaleString()} rows selected
				</p>
			</div>

			<button
				class="btn btn-accent"
				disabled={busy || !name || selected.size === 0}
				onclick={importData}
			>
				{busy ? status : `Import ${selected.size.toLocaleString()} cards`}
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
							</tr>
						</thead>

						<tbody>
							{#each cards as card}
								{@const index = parsed.cards.indexOf(card)}

								<tr class:low={card.confidence < 0.85}>
									<td>
										<input
											type="checkbox"
											checked={selected.has(index)}
											onchange={() => toggle(index)}
										/>
									</td>
									<td>{card.card_number}</td>
									<td><strong>{card.subject}</strong></td>
									<td class:muted={card.affiliation === 'NIL'}>
										{card.affiliation}
									</td>
									<td>
										{card.rookie ? 'RC ' : ''}
										{card.autograph ? 'AU ' : ''}
										{card.memorabilia ? 'MEM ' : ''}
									</td>
									<td>{Math.round(card.confidence * 100)}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		{/each}
	{/if}
</section>

<dialog bind:this={rawDialog}>
	<form method="dialog">
		<div class="modal-head">
			<strong>Paste checklist text</strong>
			<button>×</button>
		</div>

		<textarea
			bind:value={text}
			placeholder="BASE CARDS&#10;1 John Cena Raw&#10;2 Cody Rhodes SmackDown"
		></textarea>

		<button class="btn btn-primary" onclick={parsePasted}>Parse text</button>
	</form>
</dialog>

<style>
	.page{padding-top:3rem;padding-bottom:5rem}
	.topline{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem}
	.topline h1{margin:.4rem 0 .5rem;font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em}
	.topline p{margin:0;color:var(--muted)}
	.topline>a{margin-top:.5rem;color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}
	.form{display:grid;grid-template-columns:1fr .7fr 1fr;gap:1rem;padding:1.2rem;margin:2rem 0}
	.form label{display:grid;gap:.4rem;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
	.form label span{font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted)}
	.wide{grid-column:span 3}
	.upload{min-height:145px;border:1px dashed var(--line-strong);border-radius:1rem;display:flex;align-items:center;justify-content:center;gap:1rem;padding:1.5rem;background:#fafafa}
	.upload input{display:none}
	.upload label{cursor:pointer;display:flex;flex-direction:column;align-items:center;text-align:center}
	.upload label span{margin-top:.25rem;color:var(--muted);font-size:.78rem}
	.upload>div{color:var(--muted);font-size:.75rem}
	.error{margin-top:1rem;padding:.8rem 1rem;background:#fff4ea;border:1px solid #f4c89f;border-radius:.7rem}
	.source-note{display:flex;justify-content:space-between;gap:1rem;margin-top:1rem;padding:.8rem 1rem;border:1px solid var(--line);border-radius:.75rem;background:#fff}
	.source-note span{color:var(--muted);font-size:.78rem}
	.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:1.5rem 0}
	.summary-grid>div{border:1px solid var(--line);border-radius:.8rem;background:#fff;padding:1rem}
	.summary-grid strong,.summary-grid span{display:block}
	.summary-grid strong{font-size:1.5rem}
	.summary-grid span{font-size:.75rem;color:var(--muted);font-weight:700}
	.summary-grid .warn strong{color:#b66420}
	.audit{padding:1.2rem;margin-bottom:2rem}
	.audit-head{display:flex;justify-content:space-between;gap:2rem}
	.audit-head h2{margin:.2rem 0 .35rem}
	.audit-head p{margin:0;color:var(--muted);font-size:.84rem}
	.audit-metrics{display:flex;gap:.5rem;flex-wrap:wrap}
	.audit-metrics span,.issue-type,.section-badge{border:1px solid var(--line);border-radius:999px;padding:.32rem .55rem;background:#fff;font-size:.68rem;font-weight:800}
	.audit-tabs{display:flex;gap:.4rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line)}
	.audit-tabs button{border:0;background:transparent;padding:.5rem .7rem;border-radius:.55rem;font:inherit;font-size:.76rem;font-weight:850;cursor:pointer}
	.audit-tabs button.active{background:#f1f1ef}
	.audit-tabs span{color:var(--muted)}
	.issue-list{margin-top:.4rem;border-top:1px solid var(--line)}
	.issue-row{display:grid;grid-template-columns:9px 1fr auto;gap:.7rem;align-items:center;padding:.75rem .2rem;border-bottom:1px solid var(--line)}
	.issue-dot{width:7px;height:7px;border-radius:50%;background:var(--orange)}
	.issue-row p{margin:.18rem 0 0;color:var(--muted);font-size:.77rem}
	.review-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin:2rem 0 1rem}
	.review-head h2,.review-head p{margin:0}
	.review-head p{margin-top:.2rem;color:var(--muted);font-size:.78rem}
	details{margin:.7rem 0}
	summary{display:flex;justify-content:space-between;align-items:center;gap:1rem;cursor:pointer;padding:.85rem 1rem;border:1px solid var(--line);border-radius:.7rem;background:#fff}
	.summary-title{display:flex;align-items:center;gap:.55rem}
	.section-badge{color:#8c5a23;background:#fff9f1;border-color:#efd7b9}
	summary>span{color:var(--muted);font-size:.75rem}
	.table-wrap{overflow:auto}
	table{width:100%;border-collapse:collapse;min-width:800px}
	th,td{padding:.65rem .7rem;border-bottom:1px solid var(--line);text-align:left;font-size:.8rem}
	th{font-size:.64rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.low{background:#fff9f3}
	.muted{color:var(--muted)}
	dialog{width:min(800px,calc(100% - 2rem));border:0;border-radius:1rem;padding:0;box-shadow:0 30px 90px rgba(0,0,0,.25)}
	dialog::backdrop{background:rgba(18,16,14,.45)}
	dialog form{padding:1rem}
	.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem}
	.modal-head button{border:0;background:transparent;font-size:1.4rem;cursor:pointer}
	textarea{width:100%;min-height:360px;box-sizing:border-box;border:1px solid var(--line);border-radius:.7rem;padding:.8rem;font:inherit;resize:vertical;margin-bottom:.8rem}
	@media(max-width:760px){.topline{display:block}.topline>a{display:inline-block;margin-top:1rem}.form{grid-template-columns:1fr}.wide{grid-column:auto}.upload{flex-direction:column}.summary-grid{grid-template-columns:1fr 1fr}.audit-head,.review-head{align-items:flex-start;flex-direction:column}.source-note{flex-direction:column}}
</style>
