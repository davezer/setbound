<script>
	let { data } = $props();

	let query = $state('');
	let deleting = $state(null);
	let deletingImport = $state(false);
	let message = $state('');

	const visible = $derived(data.cards.filter((card) => {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		return `${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.checklist_name}`
			.toLowerCase()
			.includes(q);
	}));

	function chooseSet(event) {
		const slug = event.currentTarget.value;
		location.href = slug ? `/admin/cleanup?set=${encodeURIComponent(slug)}` : '/admin/cleanup';
	}

	async function deleteCard(card) {
		const label = `${card.card_number} ${card.subject_name}`;
		if (!confirm(`Delete ${label}?\n\nThis permanently removes this row from the checklist.`)) return;

		deleting = card.id;
		message = '';

		try {
			const response = await fetch(`/api/admin/cards/${card.id}`, { method: 'DELETE' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Delete failed.');
			location.reload();
		} catch (error) {
			message = error?.message || 'Delete failed.';
			deleting = null;
		}
	}

	async function deleteEntireImport() {
		if (!data.product) return;

		const label = `${data.product.year} ${data.product.name}`;
		if (!confirm(
			`DELETE ENTIRE IMPORT?\n\n${label}\n\n` +
			`This permanently removes the product, every checklist, every card row, checklist details, source record, and uploaded artwork for this set.\n\n` +
			`This cannot be undone.`
		)) return;

		deletingImport = true;
		message = '';

		try {
			const response = await fetch(`/api/admin/products/${data.product.id}`, { method: 'DELETE' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not delete import.');
			location.href = '/admin/cleanup';
		} catch (error) {
			message = error?.message || 'Could not delete import.';
			deletingImport = false;
		}
	}
</script>

<svelte:head><title>Clean imported rows — setbound</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Clean imported rows</h1>
			<p>Fix individual rows or remove an entire import.</p>
		</div>
		<a class="back" href="/admin">← Admin</a>
	</div>

	<div class="controls">
		<label>
			<span>Set</span>
			<select class="input" value={data.selectedSlug} onchange={chooseSet}>
				<option value="">Choose a set…</option>
				{#each data.products as product}
					<option value={product.slug}>
						{product.year} {product.manufacturer_name} {product.name} · {product.card_count} cards
					</option>
				{/each}
			</select>
		</label>

		{#if data.product}
			<label>
				<span>Find row</span>
				<input class="input" bind:value={query} placeholder="Card #, subject, team, checklist…" />
			</label>
		{/if}
	</div>

	{#if message}<div class="error">{message}</div>{/if}

	{#if data.product}
		<section class="danger-zone">
			<div>
				<div class="eyebrow danger-label">Danger zone</div>
				<h2>Delete entire import</h2>
				<p>
					Remove <strong>{data.product.year} {data.product.name}</strong> and everything imported with it.
					You can import the product again afterward.
				</p>
			</div>

			<button class="delete-import" disabled={deletingImport} onclick={deleteEntireImport}>
				{deletingImport ? 'Deleting import…' : 'Delete entire import'}
			</button>
		</section>

		<div class="result-head">
			<div>
				<strong>{data.product.year} {data.product.name}</strong>
				<span>{visible.length.toLocaleString()} of {data.cards.length.toLocaleString()} rows</span>
			</div>
			<a href={`/sets/${data.product.slug}`} target="_blank" rel="noreferrer">View public set ↗</a>
		</div>

		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>#</th><th>Subject</th><th>Affiliation</th><th>Checklist</th><th>Tags</th><th></th></tr>
				</thead>
				<tbody>
					{#each visible as card}
						<tr>
							<td class="number">{card.card_number}</td>
							<td><strong>{card.subject_name}</strong></td>
							<td class:muted={card.affiliation_name === 'NIL'}>{card.affiliation_name}</td>
							<td>{card.checklist_name}</td>
							<td class="tags">
								{card.rookie ? 'RC ' : ''}
								{card.autograph ? 'AU ' : ''}
								{card.memorabilia ? 'MEM ' : ''}
								{card.serial_number ? `/${card.serial_number}` : ''}
							</td>
							<td class="actions">
								<button disabled={deleting === card.id} onclick={() => deleteCard(card)}>
									{deleting === card.id ? 'Deleting…' : 'Delete'}
								</button>
							</td>
						</tr>
					{/each}
					{#if visible.length === 0}
						<tr><td colspan="6" class="empty">No rows match “{query}”.</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-state">Choose an imported set to inspect its rows.</div>
	{/if}
</section>

<style>
	.page{padding-top:3rem;padding-bottom:5rem}
	.topline{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem;margin-bottom:2rem}
	.topline h1{font-size:clamp(2.2rem,5vw,4rem);letter-spacing:-.055em;margin:.35rem 0 .45rem}
	.topline p{margin:0;color:var(--muted)}
	.back{font-size:.78rem;font-weight:800;text-decoration:none;color:var(--blue);margin-top:.5rem}
	.controls{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;padding:1rem 0 1.2rem;border-bottom:1px solid var(--line)}
	.controls label{display:grid;gap:.35rem}
	.controls label span{font-size:.67rem;text-transform:uppercase;letter-spacing:.1em;font-weight:900;color:var(--muted)}
	.danger-zone{display:flex;align-items:center;justify-content:space-between;gap:2rem;margin:1.4rem 0 .2rem;padding:1.15rem 1.2rem;border:1px solid #e6b2ab;border-radius:.9rem;background:#fff9f8}
	.danger-label{color:#a13b32}
	.danger-zone h2{margin:.3rem 0 .35rem;font-size:1.2rem;letter-spacing:-.03em}
	.danger-zone p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.5}
	.delete-import{flex:0 0 auto;border:1px solid #c75d53;background:#a53b32;color:white;border-radius:.6rem;padding:.65rem .85rem;font:inherit;font-size:.75rem;font-weight:850;cursor:pointer}
	.delete-import:hover{background:#8d3028}
	.delete-import:disabled{opacity:.55;cursor:not-allowed}
	.result-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.2rem 0}
	.result-head div{display:flex;gap:.7rem;align-items:baseline}
	.result-head span{color:var(--muted);font-size:.76rem}
	.result-head a{color:var(--blue);font-size:.76rem;font-weight:800;text-decoration:none}
	.table-wrap{border:1px solid var(--line);border-radius:.9rem;overflow:auto;background:#fff}
	table{width:100%;border-collapse:collapse;min-width:900px}
	th,td{padding:.8rem .9rem;border-bottom:1px solid var(--line);text-align:left}
	th{font-size:.66rem;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);background:#fafafa}
	td{font-size:.82rem}
	.number{font-weight:850}
	.muted{color:var(--muted)}
	.tags{font-size:.72rem;font-weight:850}
	.actions{text-align:right}
	.actions button{border:1px solid #e5b7b1;background:#fff8f7;color:#8c3028;border-radius:.55rem;padding:.45rem .65rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.actions button:hover{border-color:#b95c52}
	.actions button:disabled{opacity:.5;cursor:not-allowed}
	.empty,.empty-state{text-align:center;color:var(--muted);padding:3rem 1rem}
	.empty-state{border:1px dashed var(--line-strong);border-radius:.9rem;margin-top:1.4rem}
	.error{margin-top:1rem;padding:.8rem 1rem;background:#fff4ea;border:1px solid #f4c89f;border-radius:.7rem}
	@media(max-width:760px){.topline{display:block}.controls{grid-template-columns:1fr}.back{display:inline-block;margin-top:1rem}.danger-zone{align-items:flex-start;flex-direction:column}}
</style>
