<script>
	import ProductEnrichmentModal from '$lib/components/ProductEnrichmentModal.svelte';
	let { data, form } = $props();

	let products = $state([...data.products]);
	let sportFilter = $state('All sports');
	let yearFilter = $state('All years');
	let manufacturerFilter = $state('All manufacturers');
	let statusFilter = $state('All');
	let enrichmentFilter = $state('All enrichment');
	let query = $state('');
	let deleting = $state(null);
	let toggling = $state(null);
	let message = $state('');
	let enrichmentProduct = $state(null);

	let backfillBusy = $state(false);
	let backfillProgress = $state(null);
	let backfillIssues = $state([]);

	const toppsReadyCount = $derived(
		products.filter((product) => Boolean(product.has_topps_backfill)).length
	);

	const sports = $derived(['All sports', ...[...new Set(products.map((p) => p.sport_name).filter(Boolean))].sort()]);
	const years = $derived(['All years', ...[...new Set(products.map((p) => String(p.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a))]);
	const manufacturers = $derived(['All manufacturers', ...[...new Set(products.map((p) => p.manufacturer_name).filter(Boolean))].sort()]);

	const visible = $derived(
		products.filter((product) => {
			const q = query.trim().toLowerCase();

			return (
				(sportFilter === 'All sports' || product.sport_name === sportFilter) &&
				(yearFilter === 'All years' || String(product.year) === yearFilter) &&
				(manufacturerFilter === 'All manufacturers' || product.manufacturer_name === manufacturerFilter) &&
				(
					statusFilter === 'All' ||
					(statusFilter === 'Live' && Boolean(product.published)) ||
					(statusFilter === 'Draft' && !product.published)
				) &&
				(
					enrichmentFilter === 'All enrichment' ||
					(enrichmentFilter === 'Topps backfill ready' && Boolean(product.has_topps_backfill)) ||
					(enrichmentFilter === 'Needs Topps backfill' &&
						String(product.manufacturer_name || '').toLowerCase() === 'topps' &&
						!product.has_topps_backfill)
				) &&
				(
					!q ||
					`${product.name} ${product.manufacturer_name} ${product.sport_name} ${product.year}`
						.toLowerCase()
						.includes(q)
				)
			);
		})
	);

	function imageUrl(product) {
		if (!product.image_key) return '';
		return `/media/set/${product.slug}?v=${encodeURIComponent(product.image_key)}`;
	}

	function resetFilters() {
		sportFilter = 'All sports';
		yearFilter = 'All years';
		manufacturerFilter = 'All manufacturers';
		statusFilter = 'All';
		enrichmentFilter = 'All enrichment';
		query = '';
	}


	function readableApiError(value, fallback) {
		if (!value) return fallback;
		if (typeof value === 'string') return value;
		try {
			if (typeof value.message === 'string') return value.message;
			if (typeof value.error === 'string') return value.error;
			if (value.error && typeof value.error.message === 'string') return value.error.message;
			return JSON.stringify(value);
		} catch {
			return fallback;
		}
	}

	async function backfillToppsVisible() {
		const targets = visible.filter(
			(product) => String(product.manufacturer_name || '').toLowerCase() === 'topps'
		);

		if (!targets.length) {
			message = 'No visible Topps products to backfill.';
			return;
		}

		if (!confirm(`Backfill Topps enrichment metadata for ${targets.length} visible product${targets.length === 1 ? '' : 's'}?\n\nThis harvests and caches metadata only. It does not overwrite product details.`)) return;

		backfillBusy = true;
		message = '';
		backfillIssues = [];
		backfillProgress = {
			total: targets.length,
			processed: 0,
			harvested: 0,
			cached: 0,
			unmatched: 0,
			failed: 0
		};

		try {
			const indexResponse = await fetch('/api/admin/topps-launch-backfill', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mode: 'index' })
			});
			const indexResult = await indexResponse.json();
			if (!indexResponse.ok) throw new Error(readableApiError(indexResult.message || indexResult.error || indexResult, 'Could not load Topps launch history.'));

			for (let offset = 0; offset < targets.length; offset += 8) {
				const batch = targets.slice(offset, offset + 8);
				const response = await fetch('/api/admin/topps-launch-backfill', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						mode: 'backfill',
						productIds: batch.map((product) => product.id)
					})
				});
				const result = await response.json();
				if (!response.ok) throw new Error(readableApiError(result.message || result.error || result, 'Topps metadata batch failed.'));

				for (const row of result.results || []) {
					const product = products.find((item) => Number(item.id) === Number(row.productId));

					if (row.status === 'harvested') {
						backfillProgress.harvested += 1;
						if (product) product.has_topps_backfill = 1;
					} else if (row.status === 'cached') {
						backfillProgress.cached += 1;
						if (product) product.has_topps_backfill = 1;
					} else if (row.status === 'unmatched') {
						backfillProgress.unmatched += 1;
						backfillIssues.push({
							product: product?.name || `Product ${row.productId}`,
							status: 'Unmatched',
							reason: row.reason || 'No safe launch match.',
							candidate: row.candidate || null
						});
					} else if (row.status === 'failed') {
						backfillProgress.failed += 1;
						backfillIssues.push({
							product: product?.name || `Product ${row.productId}`,
							status: 'Failed',
							reason: row.reason || 'Launch detail failed.',
							candidate: row.candidate || null
						});
					}
				}

				products = [...products];
				backfillIssues = [...backfillIssues];

				backfillProgress.processed += batch.length;
				backfillProgress = { ...backfillProgress };
			}

			message = `Topps backfill complete: ${backfillProgress.harvested} harvested · ${backfillProgress.cached} already cached · ${backfillProgress.unmatched} unmatched · ${backfillProgress.failed} failed.`;
		} catch (error) {
			message = error?.message || 'Topps enrichment backfill failed.';
		} finally {
			backfillBusy = false;
		}
	}

	async function toggleVisibility(product) {
		const nextPublished = product.published ? 0 : 1;
		toggling = product.id;
		message = '';

		try {
			const body = new FormData();
			body.set('product_id', String(product.id));
			body.set('published', String(nextPublished));

			const response = await fetch('?/visibility', {
				method: 'POST',
				body
			});

			if (!response.ok) {
				throw new Error('Could not update set visibility.');
			}

			product.published = nextPublished;
			products = [...products];
		} catch (error) {
			message = error?.message || 'Could not update set visibility.';
		} finally {
			toggling = null;
		}
	}

	function enrichmentApplied(payload) {
		if (!enrichmentProduct) return;
		enrichmentProduct.release_date = payload.releaseDate || enrichmentProduct.release_date;
		if (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;
		products = [...products];
		message = 'Product details enriched.';
	}

	async function deleteImport(product) {
		const label = `${product.year} ${product.name}`;

		if (!confirm(
			`DELETE ENTIRE IMPORT?\n\n${label}\n\n` +
			`This permanently removes the product, all ${Number(product.card_count || 0).toLocaleString()} cards, ` +
			`${Number(product.checklist_count || 0).toLocaleString()} checklists, source record, metadata, and uploaded artwork.\n\n` +
			`This cannot be undone.`
		)) return;

		deleting = product.id;
		message = '';

		try {
			const response = await fetch(`/api/admin/products/${product.id}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Could not delete import.');
			}

			products = products.filter((item) => item.id !== product.id);
		} catch (error) {
			message = error?.message || 'Could not delete import.';
		} finally {
			deleting = null;
		}
	}
</script>

<svelte:head><title>Manage sets — setbound</title></svelte:head>

<section class="shell page">
	<div class="top">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Manage sets</h1>
			<p>Artwork and collector-facing set details.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}
	{#if message}<div class="error">{message}</div>{/if}

	<div class="filters">
		<label class="search">
			<span>Find product</span>
			<input class="input" bind:value={query} placeholder="Chrome, Artifacts, Bowman…" />
		</label>

		<label>
			<span>Sport</span>
			<select class="input" bind:value={sportFilter}>
				{#each sports as sport}<option>{sport}</option>{/each}
			</select>
		</label>

		<label>
			<span>Year</span>
			<select class="input" bind:value={yearFilter}>
				{#each years as year}<option>{year}</option>{/each}
			</select>
		</label>

		<label>
			<span>Manufacturer</span>
			<select class="input" bind:value={manufacturerFilter}>
				{#each manufacturers as manufacturer}<option>{manufacturer}</option>{/each}
			</select>
		</label>

		<label>
			<span>Status</span>
			<select class="input" bind:value={statusFilter}>
				<option>All</option>
				<option>Live</option>
				<option>Draft</option>
			</select>
		</label>

		<label>
			<span>Enrichment</span>
			<select class="input" bind:value={enrichmentFilter}>
				<option>All enrichment</option>
				<option>Topps backfill ready</option>
				<option>Needs Topps backfill</option>
			</select>
		</label>

		<button class="reset" onclick={resetFilters}>Clear</button>
	</div>

	<div class="filter-summary backfill-summary">
		<div>
			<strong>{visible.length.toLocaleString()}</strong> <span>of {products.length.toLocaleString()} sets</span>
			<span class="topps-ready-summary">· {toppsReadyCount.toLocaleString()} Topps backfill ready</span>
		</div>
		<button class="backfill" type="button" onclick={backfillToppsVisible} disabled={backfillBusy}>
			{backfillBusy ? 'Backfilling Topps…' : 'Backfill Topps metadata'}
		</button>
	</div>

	{#if backfillProgress}
		<div class="backfill-panel">
			<div><strong>{backfillProgress.processed}</strong> / {backfillProgress.total} checked</div>
			<div>{backfillProgress.harvested} harvested · {backfillProgress.cached} cached · {backfillProgress.unmatched} unmatched · {backfillProgress.failed} failed</div>
		</div>
	{/if}

	{#if backfillIssues.length}
		<details class="backfill-issues">
			<summary>Review {backfillIssues.length} unmatched / failed result{backfillIssues.length === 1 ? '' : 's'}</summary>
			<div class="issue-list">
				{#each backfillIssues.slice(0, 40) as issue}
					<div class="issue-row">
						<strong>{issue.product}</strong>
						<span>{issue.status}: {issue.reason}</span>
						{#if issue.candidate}
							<small>Best launch: {issue.candidate.product} · score {issue.candidate.score}{issue.candidate.coverage ? ` · ${issue.candidate.coverage}% coverage` : ''}</small>
						{/if}
					</div>
				{/each}
				{#if backfillIssues.length > 40}<small>Showing first 40 results.</small>{/if}
			</div>
		</details>
	{/if}

	<div class="list">
		{#each visible as product (product.id)}
			<article class="row">
				<div class="preview">
					{#if product.image_key}
						<img src={imageUrl(product)} alt="" />
					{:else}
						<span>{product.year}</span>
					{/if}
				</div>

				<div class="info">
					<div class="meta">{product.sport_name} · {product.manufacturer_name} · {product.year}</div>
					<div class="title-line">
						<strong>{product.name}</strong>
						{#if product.published}
							<span class="status live">Live</span>
						{:else}
							<span class="status draft">Draft</span>
						{/if}
						{#if product.has_topps_backfill}
							<span class="status topps-ready" title="Cached first-party Topps launch metadata is ready for enrichment">Topps ready</span>
						{/if}
					</div>

					<div class="details">
						<span>{product.release_date ? `Release: ${product.release_date}` : 'No release date yet'}</span>
						<span>{Number(product.card_count || 0).toLocaleString()} cards</span>
						<span>{Number(product.checklist_count || 0).toLocaleString()} checklists</span>
					</div>
				</div>

				<div class="actions">
					<button
						class:offline={product.published}
						class:golive={!product.published}
						class="visibility"
						disabled={toggling === product.id}
						onclick={() => toggleVisibility(product)}
					>
						{toggling === product.id
							? 'Saving…'
							: product.published
								? 'Take offline'
								: 'Go live'}
					</button>

					<button class:topps-enrich={product.has_topps_backfill} class="edit" type="button" onclick={() => enrichmentProduct = product}>
						{product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details'}
					</button>
					<a class="edit" href={`/admin/product/${product.id}`}>Edit details</a>

					<form method="POST" action="?/upload" enctype="multipart/form-data">
						<input type="hidden" name="product_id" value={product.id} />
						<label class="upload">
							<input
								type="file"
								name="image"
								accept="image/jpeg,image/png,image/webp,image/avif"
								required
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							/>
							{product.image_key ? 'Replace image' : 'Add image'}
						</label>
					</form>

					{#if product.image_key}
						<form method="POST" action="?/clear">
							<input type="hidden" name="product_id" value={product.id} />
							<button class="clear">Remove image</button>
						</form>
					{/if}

					<button
						class="delete"
						disabled={deleting === product.id}
						onclick={() => deleteImport(product)}
					>
						{deleting === product.id ? 'Deleting…' : 'Delete import'}
					</button>
				</div>
			</article>
		{/each}

		{#if visible.length === 0}
			<div class="empty">No sets match those filters.</div>
		{/if}
	</div>
</section>

{#if enrichmentProduct}
	<ProductEnrichmentModal product={enrichmentProduct} onclose={() => enrichmentProduct = null} onapplied={enrichmentApplied} />
{/if}

<style>
	.page{padding-top:3rem;padding-bottom:5rem}
	.top{display:flex;justify-content:space-between;gap:2rem;margin-bottom:2rem}
	.top h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.35rem 0 .5rem}
	.top p{margin:0;color:var(--muted)}
	.top>a{color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}
	.filters{display:grid;grid-template-columns:minmax(240px,1.35fr) repeat(5,minmax(120px,.6fr)) auto;gap:.6rem;align-items:end;padding:1rem 0 1.1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
	.filters label{display:grid;gap:.35rem}
	.filters label span{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.reset{height:44px;border:1px solid var(--line-strong);border-radius:.65rem;background:white;padding:0 .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.filter-summary{display:flex;gap:.35rem;align-items:baseline;padding:.8rem 0;color:var(--muted);font-size:.72rem}
	.filter-summary strong{color:var(--ink)}
	.backfill-summary{justify-content:space-between}
	.backfill{border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:.65rem;padding:.58rem .8rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.backfill:disabled{opacity:.55;cursor:not-allowed}
	.backfill-panel{display:flex;justify-content:space-between;gap:1rem;margin:0 0 .8rem;padding:.7rem .85rem;border:1px solid var(--line);border-radius:.65rem;background:#faf9f7;color:var(--muted);font-size:.7rem}
	.backfill-panel strong{color:var(--ink)}
	.list{border-top:1px solid var(--line)}
	.row{display:grid;grid-template-columns:130px minmax(300px,1fr) auto;align-items:center;gap:1.2rem;padding:1rem 0;border-bottom:1px solid var(--line)}
	.preview{width:130px;aspect-ratio:16/9;border:1px solid var(--line);border-radius:.65rem;background:#f4f3f1;overflow:hidden;display:grid;place-items:center}
	.preview img{width:100%;height:100%;object-fit:cover}
	.preview span{color:var(--muted);font-size:.7rem;font-weight:900}
	.info{display:grid;gap:.25rem;min-width:0}
	.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
	.title-line{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
	.title-line strong{font-size:.92rem}
	.details{display:flex;gap:.7rem;flex-wrap:wrap;color:var(--muted);font-size:.7rem}
	.status{display:inline-flex;padding:.18rem .4rem;border-radius:999px;font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
	.status.live{background:#edf7f1;color:#25734d}
	.status.draft{background:#f2f0ed;color:#766f67}
	.status.topps-ready{background:#eef6ef;color:#21613f;border:1px solid #cfe4d5}
	.topps-ready-summary{color:#25734d;font-weight:800}
	.edit.topps-enrich{background:#182a20;color:#fff;border-color:#182a20}
	.backfill-issues{margin:.7rem 0 1rem;border:1px solid var(--line);border-radius:.7rem;background:#fff}
	.backfill-issues summary{padding:.75rem .9rem;font-size:.72rem;font-weight:850;cursor:pointer}
	.issue-list{border-top:1px solid var(--line);padding:.25rem .9rem .75rem}
	.issue-row{display:grid;gap:.2rem;padding:.65rem 0;border-bottom:1px solid var(--line);font-size:.7rem}
	.issue-row:last-child{border-bottom:0}
	.issue-row small{color:var(--muted)}
	.actions{display:flex;align-items:center;justify-content:flex-end;gap:.4rem;flex-wrap:wrap;max-width:520px}
	.upload,.clear,.edit,.visibility,.delete{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer;text-decoration:none;color:inherit;white-space:nowrap}
	.visibility.golive{background:#182a20;color:#fff;border-color:#182a20}
	.visibility.offline{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.visibility:disabled,.delete:disabled{opacity:.55;cursor:not-allowed}
	.upload input{display:none}
	.clear{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.edit{color:var(--blue)}
	.delete{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.error{margin-bottom:1rem;padding:.8rem 1rem;background:#fff8f6;border:1px solid #efc4bc;border-radius:.7rem}
	.empty{text-align:center;color:var(--muted);padding:4rem 1rem}
	@media(max-width:1100px){
		.filters{grid-template-columns:repeat(3,1fr)}
		.filters .search{grid-column:span 2}
		.row{grid-template-columns:100px 1fr}
		.preview{width:100px}
		.actions{grid-column:1/-1;justify-content:flex-start;max-width:none}
	}
	@media(max-width:700px){
		.top{display:block}
		.top>a{display:inline-block;margin-top:1rem}
		.filters{grid-template-columns:1fr}
		.filters .search{grid-column:auto}
		.row{grid-template-columns:80px 1fr}
		.preview{width:80px}
	}
</style>
