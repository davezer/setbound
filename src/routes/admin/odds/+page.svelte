<script>
	import { extractOddsPdf } from '$lib/client/odds-pdf.js';

	let { data, form } = $props();

	let file = $state(null);
	let sourceUrl = $state('');
	let parsed = $state(null);
	let parsing = $state(false);
	let parseError = $state('');
	let replaceExisting = $state(data.sources.length > 0);
	let formatNames = $state([]);
	let formatsVerified = $state(false);
	let remoteLoaded = $state(false);

	async function loadRemoteOdds(remoteUrl) {
		parsing = true;
		parseError = '';
		try {
			const response = await fetch(`/api/admin/source-harvester/download?url=${encodeURIComponent(remoteUrl)}`);
			if (!response.ok) throw new Error(`Remote odds download failed (${response.status}).`);
			const blob = await response.blob();
			const filename = decodeURIComponent(new URL(remoteUrl).pathname.split('/').pop() || 'odds.pdf');
			file = new File([blob], filename, { type: blob.type || 'application/pdf' });
			sourceUrl = remoteUrl;
			parsed = await extractOddsPdf(file);
			formatNames = parsed.formats.map((format) => format.name);
			formatsVerified = false;
		} catch (error) {
			parseError = error?.message || 'Could not load remote odds PDF.';
		} finally {
			parsing = false;
		}
	}

	$effect(() => {
		if (!remoteLoaded && data.remoteSourceUrl) {
			remoteLoaded = true;
			loadRemoteOdds(data.remoteSourceUrl);
		}
	});

	const selectedProduct = $derived(
		data.products.find((product) => Number(product.id) === Number(data.selectedProductId))
	);

	async function chooseFile(event) {
		file = event.currentTarget.files?.[0] || null;
		parsed = null;
		parseError = '';

		if (!file) return;

		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			parseError = 'Odds importer currently expects a PDF.';
			return;
		}

		parsing = true;

		try {
			parsed = await extractOddsPdf(file);
			formatNames = parsed.formats.map((format) => format.name);
			formatsVerified = false;
		} catch (error) {
			parseError = error?.message || 'Could not parse this odds PDF.';
		} finally {
			parsing = false;
		}
	}

	function changeProduct(event) {
		const id = event.currentTarget.value;
		location.href = `/admin/odds?product=${encodeURIComponent(id)}`;
	}

	function payload() {
		if (!parsed) return '';

		return JSON.stringify({
			formats: parsed.formats.map((format, index) => ({
				...format,
				name: String(formatNames[index] || '').trim()
			})),
			rows: parsed.rows
		});
	}

	const formatProblems = $derived.by(() => {
		if (!parsed) return [];

		const issues = [...(parsed.headerIssues || [])];
		const seen = new Set();

		for (let index = 0; index < formatNames.length; index++) {
			const name = String(formatNames[index] || '').trim();
			const lower = name.toLowerCase();

			if (!name || /^format \d+$/i.test(name)) {
				issues.push(`Column ${index + 1} needs a real pack-format name.`);
			}

			if (/^\d{3,}\b/.test(name) || /MLB-|NFL-|NBA-|NHL-/i.test(name)) {
				issues.push(`"${name}" still looks like a SKU/product code.`);
			}

			if (seen.has(lower) && lower) {
				issues.push(`Duplicate format name: "${name}".`);
			}

			if (lower) seen.add(lower);
		}

		return [...new Set(issues)];
	});
</script>

<svelte:head><title>Odds importer — setbound admin</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Product odds</h1>
			<p>Turn official pack-odds PDFs into structured Setbound data.</p>
		</div>

		<a href="/admin">← Admin</a>
	</div>

	{#if form?.message}
		<div class="error">{form.message}</div>
	{/if}

	<section class="picker">
		<label>
			<span>Set</span>
			<select class="input" value={data.selectedProductId} onchange={changeProduct}>
				{#each data.products as product}
					<option value={product.id}>
						{product.year} {product.manufacturer_name} {product.name}
						{product.odds_rows ? ` · ${product.odds_rows} odds rows` : ''}
					</option>
				{/each}
			</select>
		</label>
	</section>

	{#if selectedProduct}
		<section class="importer">
			<div class="import-copy">
				<div class="eyebrow">Import odds</div>
				<h2>{selectedProduct.year} {selectedProduct.name}</h2>
				<p>
					Upload the official odds PDF. Setbound detects the package-format columns,
					reads each odds row, and automatically links rows to checklists when the names line up.
				</p>
			</div>

			<div class="file-box">
				<input id="odds-file" type="file" accept=".pdf,application/pdf" onchange={chooseFile} />
				<label for="odds-file">
					<strong>{file?.name || 'Choose odds PDF'}</strong>
					<span>{parsing ? 'Reading odds…' : 'PDF from Topps, Panini, Upper Deck, etc.'}</span>
				</label>
			</div>

			<label class="source-url">
				<span>Official source URL <em>optional</em></span>
				<input
					class="input"
					bind:value={sourceUrl}
					placeholder="https://..."
				/>
			</label>

			{#if parseError}
				<div class="error">{parseError}</div>
			{/if}
		</section>
	{/if}

	{#if parsed}
		<section class="preview">
			<div class="preview-head">
				<div>
					<div class="eyebrow">Import preview</div>
					<h2>{parsed.rows.length.toLocaleString()} odds rows</h2>
				</div>

				<div class="format-chips">
					{#each parsed.formats as format}
						<span>{format.name}</span>
					{/each}
				</div>
			</div>

			<div class="format-verification">
				<div class="verification-head">
					<div>
						<div class="eyebrow">Required verification</div>
						<h3>Confirm the package formats</h3>
						<p>
							These become the public odds columns. They must match the official PDF exactly:
							Hobby, Jumbo, Value Box, Mega, Breaker Delight, Fat Pack, Fanatics, and so on.
						</p>
					</div>
				</div>

				<div class="format-editor">
					{#each parsed.formats as format, index}
						<label>
							<span>Column {index + 1}</span>
							<input
								class="input"
								value={formatNames[index] || ''}
								oninput={(event) => {
									const next = [...formatNames];
									next[index] = event.currentTarget.value;
									formatNames = next;
									formatsVerified = false;
								}}
							/>
							{#if format.rawHeader}
								<small>Extracted header text: {format.rawHeader}</small>
							{/if}
						</label>
					{/each}
				</div>

				{#if formatProblems.length}
					<div class="header-warning">
						<strong>Import blocked until the headers are clean.</strong>
						{#each formatProblems as issue}<span>{issue}</span>{/each}
					</div>
				{/if}

				<label class="verified-check">
					<input
						type="checkbox"
						bind:checked={formatsVerified}
						disabled={formatProblems.length > 0}
					/>
					<span>I verified every format label against the official odds PDF.</span>
				</label>
			</div>

			<div class="preview-table">
				<table>
					<thead>
						<tr>
							<th>Card / parallel</th>
							{#each parsed.formats as format}<th>{format.name}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each parsed.rows.slice(0, 80) as row}
							<tr>
								<td><strong>{row.name}</strong></td>
								{#each row.values as value}
									<td class:unavailable={value === '-'}>{value || '—'}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if parsed.rows.length > 80}
				<p class="more">Showing the first 80 rows. All {parsed.rows.length.toLocaleString()} rows will be imported.</p>
			{/if}

			{#if parsed.disclaimer}
				<div class="disclaimer">
					<div class="eyebrow">Source note</div>
					{parsed.disclaimer}
				</div>
			{/if}

			<form method="POST" action="?/importOdds" class="import-form">
				<input type="hidden" name="product_id" value={data.selectedProductId} />
				<input type="hidden" name="filename" value={parsed.filename} />
				<input type="hidden" name="source_url" value={sourceUrl} />
				<input type="hidden" name="disclaimer" value={parsed.disclaimer} />
				<input type="hidden" name="payload" value={payload()} />
				<input type="hidden" name="replace_existing" value={replaceExisting ? '1' : '0'} />

				{#if data.sources.length}
					<label class="replace">
						<input type="checkbox" bind:checked={replaceExisting} />
						<span>Replace existing odds for this set</span>
					</label>
				{/if}

				<button disabled={!formatsVerified || formatProblems.length > 0}>Import {parsed.rows.length.toLocaleString()} odds rows</button>
			</form>
		</section>
	{/if}

	{#if data.sources.length}
		<section class="existing">
			<div>
				<div class="eyebrow">Imported odds</div>
				<h2>Current source</h2>
			</div>

			{#each data.sources as source}
				<div class="source-row">
					<div>
						<strong>{source.original_filename || 'Odds sheet'}</strong>
						<span>
							{Number(source.row_count).toLocaleString()} rows ·
							{source.format_count} formats ·
							imported {new Date(source.imported_at).toLocaleDateString()}
						</span>
					</div>

					<form method="POST" action="?/deleteOdds" onsubmit={(event) => {
						if (!confirm('Delete the imported odds for this set?')) event.preventDefault();
					}}>
						<input type="hidden" name="source_id" value={source.id} />
						<input type="hidden" name="product_id" value={data.selectedProductId} />
						<button>Delete</button>
					</form>
				</div>
			{/each}
		</section>
	{/if}
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}
	.topline{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding-bottom:1.6rem;border-bottom:1px solid var(--line)}
	.topline h1{font-size:clamp(2.8rem,5.5vw,4.8rem);letter-spacing:-.06em;line-height:.95;margin:.4rem 0 .55rem}
	.topline p{margin:0;color:var(--muted)}
	.topline>a{color:var(--blue);font-size:.75rem;font-weight:850;text-decoration:none}
	.picker{padding:1.2rem 0;border-bottom:1px solid var(--line)}
	.picker label,.source-url{display:grid;gap:.35rem}
	.picker label>span,.source-url>span{font-size:.63rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.source-url em{font-style:normal;font-weight:500;text-transform:none;letter-spacing:0}
	.importer{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem 2rem;padding:1.6rem 0;border-bottom:1px solid var(--line)}
	.import-copy h2,.preview h2,.existing h2{margin:.25rem 0;font-size:1.4rem}
	.import-copy p{max-width:600px;color:var(--muted);font-size:.8rem;line-height:1.55}
	.file-box{align-self:center;border:1px dashed var(--line-strong);border-radius:.9rem;background:#faf9f8}
	.file-box input{position:absolute;opacity:0;pointer-events:none}
	.file-box label{display:grid;place-items:center;text-align:center;gap:.3rem;min-height:120px;cursor:pointer;padding:1rem}
	.file-box span{color:var(--muted);font-size:.72rem}
	.source-url{grid-column:1/-1}
	.error{margin:1rem 0;padding:.8rem 1rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem;color:#8d3028}
	.preview{padding:1.8rem 0;border-bottom:1px solid var(--line)}
	.preview-head{display:flex;justify-content:space-between;gap:1rem;align-items:end;margin-bottom:1rem}
	.format-chips{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.35rem}
	.format-chips span{border:1px solid var(--line);border-radius:999px;padding:.35rem .5rem;font-size:.64rem;font-weight:800}
	.format-verification{
		margin:0 0 1rem;
		padding:1rem;
		border:1px solid var(--line);
		border-radius:.85rem;
		background:#faf9f8;
	}
	.verification-head h3{margin:.25rem 0 .3rem;font-size:1.05rem}
	.verification-head p{max-width:760px;margin:0;color:var(--muted);font-size:.72rem;line-height:1.5}
	.format-editor{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.65rem;margin-top:.85rem}
	.format-editor label{display:grid;gap:.3rem}
	.format-editor label>span{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
	.format-editor small{color:var(--muted);font-size:.6rem;line-height:1.35}
	.header-warning{display:grid;gap:.18rem;margin-top:.8rem;padding:.75rem;border:1px solid #efc2bb;border-radius:.65rem;background:#fff8f7;color:#8d3028;font-size:.7rem}
	.verified-check{display:flex;align-items:center;gap:.5rem;margin-top:.8rem;font-size:.72rem;font-weight:750}
	.import-form>button:disabled{opacity:.45;cursor:not-allowed}
	.preview-table{max-height:520px;overflow:auto;border:1px solid var(--line);border-radius:.85rem;background:white}
	table{width:100%;border-collapse:collapse}
	th,td{padding:.6rem .7rem;border-bottom:1px solid var(--line);font-size:.72rem;text-align:left}
	th{position:sticky;top:0;background:#fafafa;z-index:1;font-size:.61rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
	td:not(:first-child){white-space:nowrap}
	.unavailable{color:#aaa}
	.more{font-size:.7rem;color:var(--muted)}
	.disclaimer{margin:1rem 0;padding:.8rem 0;color:var(--muted);font-size:.72rem;line-height:1.5;border-bottom:1px solid var(--line)}
	.import-form{display:flex;justify-content:space-between;align-items:center;gap:1rem}
	.import-form>button{border:0;border-radius:.7rem;background:var(--blue);color:white;padding:.75rem 1rem;font:inherit;font-weight:850;cursor:pointer}
	.replace{display:flex;align-items:center;gap:.45rem;font-size:.72rem}
	.existing{padding:1.8rem 0}
	.source-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 0;border-bottom:1px solid var(--line)}
	.source-row strong,.source-row span{display:block}
	.source-row span{margin-top:.18rem;color:var(--muted);font-size:.68rem}
	.source-row button{border:1px solid #e8b3aa;background:#fff8f7;color:#982d23;border-radius:.55rem;padding:.5rem .65rem;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}
	@media(max-width:800px){.importer{grid-template-columns:1fr}.source-url{grid-column:auto}.preview-head,.import-form{align-items:flex-start;flex-direction:column}.format-chips{justify-content:flex-start}}
</style>
