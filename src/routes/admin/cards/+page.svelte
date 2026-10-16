<script>
	let { data, form } = $props();

	let editing = $state(null);
	let selected = $state([]);

	const allVisibleSelected = $derived(
		data.cards.length > 0 && data.cards.every((card) => selected.includes(card.id))
	);

	function toggleCard(id) {
		selected = selected.includes(id)
			? selected.filter((cardId) => cardId !== id)
			: [...selected, id];
	}

	function toggleVisible() {
		if (allVisibleSelected) {
			const visible = new Set(data.cards.map((card) => card.id));
			selected = selected.filter((id) => !visible.has(id));
		} else {
			selected = [...new Set([...selected, ...data.cards.map((card) => card.id)])];
		}
	}

	function edit(card) {
		editing = { ...card };
	}

	function close() {
		editing = null;
	}
</script>

<svelte:head><title>Card data — setbound admin</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Admin · Data cleanup</div>
			<h1>Card data</h1>
			<p>Fix a single card without re-importing the product.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<form class="filters" method="GET">
		<label class="search">
			<span>Find card</span>
			<input name="q" value={data.q} placeholder="Player, card #, team, checklist, set…" />
		</label>

		<label>
			<span>Set</span>
			<select name="product">
				<option value="">All sets</option>
				{#each data.products as product}
					<option value={product.id} selected={data.productId === product.id}>
						{product.year} {product.manufacturer_name} {product.name}
					</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Affiliation</span>
			<select name="affiliation">
				<option value="all" selected={data.affiliationFilter === 'all'}>All</option>
				<option value="nil" selected={data.affiliationFilter === 'nil'}>NIL / missing</option>
				{#each data.affiliations as affiliation}
					<option value={affiliation.id} selected={String(affiliation.id) === data.affiliationFilter}>
						{affiliation.name}
					</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Tag</span>
			<select name="flag">
				<option value="all" selected={data.flagFilter === 'all'}>All</option>
				<option value="rookie" selected={data.flagFilter === 'rookie'}>Rookie</option>
				<option value="autograph" selected={data.flagFilter === 'autograph'}>Autograph</option>
				<option value="memorabilia" selected={data.flagFilter === 'memorabilia'}>Memorabilia</option>
			</select>
		</label>

		<button>Filter</button>
	</form>

	<div class="count-row">
		<div class="count">{data.cards.length} rows shown</div>

		{#if selected.length}
			<form class="bulk" method="POST" action="?/bulkAffiliation">
				{#each selected as id}
					<input type="hidden" name="card_ids" value={id} />
				{/each}

				<strong>{selected.length} selected</strong>

				<label>
					<span>Set affiliation</span>
					<select name="bulk_affiliation">
						<option value="NIL">NIL / no affiliation</option>
						{#each data.affiliations as affiliation}
							<option value={affiliation.id}>{affiliation.name}</option>
						{/each}
					</select>
				</label>

				<button>Apply to selected</button>
			</form>
		{/if}
	</div>

	<div class="table">
		<div class="thead">
			<label class="select-all" title="Select all visible rows">
				<input type="checkbox" checked={allVisibleSelected} onchange={toggleVisible} />
			</label>
			<span>#</span><span>Subject</span><span>Affiliation</span><span>Tags</span><span>Set / checklist</span><span></span>
		</div>

		{#each data.cards as card}
			<div class="row" class:selected={selected.includes(card.id)}>
				<label class="row-check" aria-label={`Select ${card.card_number} ${card.subject_name}`}>
					<input
						type="checkbox"
						checked={selected.includes(card.id)}
						onchange={() => toggleCard(card.id)}
					/>
				</label>
				<strong class="number">{card.card_number}</strong>
				<div>
					<strong>{card.subject_name}</strong>
					{#if card.confidence != null}<small>{Math.round(Number(card.confidence) * 100)}% confidence</small>{/if}
				</div>
				<div>
					<span>{card.affiliation_name}</span>
					{#if card.affiliation_league}<small>{card.affiliation_league}</small>{/if}
				</div>
				<div class="tags">
					{#if card.rookie}<span>RC</span>{/if}
					{#if card.autograph}<span>AU</span>{/if}
					{#if card.memorabilia}<span>MEM</span>{/if}
					{#if card.serial_number}<span>/{card.serial_number}</span>{/if}
				</div>
				<div>
					<strong>{card.year} {card.product_name}</strong>
					<small>{card.checklist_name}</small>
				</div>
				<button class="edit" onclick={() => edit(card)}>Edit</button>
			</div>
		{/each}
	</div>
</section>

{#if editing}
	<div class="backdrop" role="presentation" onclick={close}>
		<div class="modal" role="dialog" aria-modal="true" aria-label="Edit card" onclick={(event) => event.stopPropagation()}>
			<div class="modal-head">
				<div>
					<div class="eyebrow">Manual correction</div>
					<h2>{editing.card_number} · {editing.subject_name}</h2>
				</div>
				<button class="x" onclick={close}>×</button>
			</div>

			<div class="source">
				<strong>{editing.year} {editing.manufacturer_name} {editing.product_name}</strong>
				<span>{editing.checklist_name}</span>
				{#if editing.raw_source}<code>{editing.raw_source}</code>{/if}
			</div>

			<form method="POST" action="?/update">
				<input type="hidden" name="card_id" value={editing.id} />

				<div class="grid">
					<label>
						<span>Subject</span>
						<input name="subject_name" value={editing.subject_name} required />
					</label>

					<label>
						<span>Team / affiliation</span>
						<input
							name="affiliation_name"
							value={editing.affiliation_name === 'NIL' ? '' : editing.affiliation_name}
							list="affiliations"
							placeholder="Blank = NIL"
						/>
						<datalist id="affiliations">
							{#each data.affiliations as affiliation}<option value={affiliation.name}></option>{/each}
						</datalist>
					</label>

					<label>
						<span>Serial / print run</span>
						<input name="serial_number" value={editing.serial_number || ''} inputmode="numeric" placeholder="e.g. 99" />
					</label>

					<label>
						<span>Variation</span>
						<input name="variation" value={editing.variation || ''} />
					</label>
				</div>

				<fieldset>
					<legend>Tags</legend>
					<label class="check"><input type="checkbox" name="rookie" value="1" checked={Boolean(editing.rookie)} /> Rookie / RC</label>
					<label class="check"><input type="checkbox" name="autograph" value="1" checked={Boolean(editing.autograph)} /> Autograph / AU</label>
					<label class="check"><input type="checkbox" name="memorabilia" value="1" checked={Boolean(editing.memorabilia)} /> Memorabilia / relic</label>
				</fieldset>

				<label class="notes">
					<span>Admin notes</span>
					<textarea name="notes" rows="3">{editing.notes || ''}</textarea>
				</label>

				<div class="modal-actions">
					<button type="button" class="cancel" onclick={close}>Cancel</button>
					<button class="save">Save correction</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page{padding-top:3.5rem;padding-bottom:6rem}.hero{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start}.hero h1{font-size:clamp(3rem,6vw,5rem);letter-spacing:-.06em;margin:.35rem 0}.hero p{margin:0;color:var(--muted)}.hero>a{color:var(--blue);font-size:.75rem;font-weight:850;text-decoration:none}
	.filters{display:grid;grid-template-columns:minmax(260px,1fr) 270px 200px 150px auto;gap:.65rem;align-items:end;margin-top:2rem;padding:1rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.filters label{display:grid;gap:.3rem}.filters label>span,.modal label>span{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.filters input,.filters select,.modal input,.modal textarea{width:100%;box-sizing:border-box;border:1px solid var(--line-strong);border-radius:.65rem;background:#fff;padding:.65rem .7rem;font:inherit}.filters button,.save{border:0;border-radius:.65rem;background:var(--ink);color:white;padding:.69rem .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.count{padding:.8rem 0;color:var(--muted);font-size:.7rem}.count-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:58px}.bulk{display:flex;align-items:end;gap:.55rem;padding:.45rem 0}.bulk strong{align-self:center;font-size:.72rem;white-space:nowrap}.bulk label{display:grid;gap:.2rem}.bulk label>span{font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.bulk select{min-width:220px;border:1px solid var(--line-strong);border-radius:.55rem;background:#fff;padding:.5rem .6rem;font:inherit;font-size:.7rem}.bulk button{border:0;border-radius:.55rem;background:var(--ink);color:#fff;padding:.55rem .7rem;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}
	.table{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:#fff}.thead,.row{display:grid;grid-template-columns:32px 100px 1.1fr 1fr .7fr 1.3fr 70px;gap:1rem;align-items:center}.thead{padding:.7rem .9rem;background:#fafafa;border-bottom:1px solid var(--line);font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.row{padding:.8rem .9rem;border-bottom:1px solid var(--line)}.row.selected{background:#fafbf7}.row-check,.select-all{display:grid;place-items:center}.row-check input,.select-all input{width:16px;height:16px;cursor:pointer}.row small,.source span{display:block;color:var(--muted);font-size:.66rem;margin-top:.15rem}.number{color:var(--blue)}.tags{display:flex;gap:.25rem;flex-wrap:wrap}.tags span{padding:.2rem .3rem;border-radius:.3rem;background:#f2f1ef;font-size:.58rem;font-weight:900}.edit{border:1px solid var(--line-strong);background:white;border-radius:.55rem;padding:.45rem .55rem;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}.error{margin-top:1rem;padding:.7rem;border:1px solid #efc2bb;background:#fff8f7;color:#8d3028;border-radius:.65rem}
	.backdrop{position:fixed;inset:0;z-index:100;background:rgba(20,18,16,.45);display:grid;place-items:center;padding:1rem}.modal{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:1rem;padding:1.2rem;box-shadow:0 30px 90px rgba(0,0,0,.2)}.modal-head{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1rem}.modal h2{margin:.25rem 0 0}.x{border:1px solid var(--line);background:white;width:36px;height:36px;border-radius:50%;font-size:1.1rem;cursor:pointer}.source{padding:.9rem 0}.source code{display:block;margin-top:.5rem;padding:.55rem;background:#f6f5f3;border-radius:.5rem;white-space:pre-wrap;font-size:.68rem}.modal form{display:grid;gap:1rem}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.grid label,.notes{display:grid;gap:.3rem}fieldset{display:flex;gap:1rem;flex-wrap:wrap;border:1px solid var(--line);border-radius:.65rem;padding:.75rem}legend{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.check{display:flex!important;gap:.4rem;align-items:center;font-size:.72rem}.check input{width:auto!important}.modal-actions{display:flex;justify-content:flex-end;gap:.5rem;border-top:1px solid var(--line);padding-top:1rem}.cancel{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.65rem .8rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	@media(max-width:1050px){.filters{grid-template-columns:1fr 1fr}.count-row{align-items:flex-start;flex-direction:column;padding-bottom:.6rem}.bulk{width:100%;flex-wrap:wrap}.thead{display:none}.row{grid-template-columns:32px 80px 1fr 1fr 70px}.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:3/5}}@media(max-width:650px){.filters,.grid{grid-template-columns:1fr}.bulk{display:grid;grid-template-columns:1fr}.bulk select{width:100%;min-width:0}.row{grid-template-columns:28px 65px 1fr 60px}.row>div:nth-of-type(2),.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:3}.edit{grid-column:4;grid-row:1}}
</style>
