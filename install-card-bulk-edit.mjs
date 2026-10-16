import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
	if (source.includes(replacement)) return source;
	if (!source.includes(search)) throw new Error(`${label}: expected code not found.`);
	return source.replace(search, replacement);
}

function patchServer() {
	const path = 'src/routes/admin/cards/+page.server.js';
	let source = fs.readFileSync(path, 'utf8');

	const oldEnd = `\t\tthrow redirect(303, \`/admin/cards?\${params.toString()}\`);
\t}
};`;

	const newEnd = `\t\tthrow redirect(303, \`/admin/cards?\${params.toString()}\`);
\t},

\tbulkAffiliation: async ({ platform, request, url }) => {
\t\tconst database = db(platform);
\t\tconst form = await request.formData();

\t\tconst rawIds = form.getAll('card_ids');
\t\tconst cardIds = [...new Set(
\t\t\trawIds
\t\t\t\t.map((value) => Number(value))
\t\t\t\t.filter((value) => Number.isInteger(value) && value > 0)
\t\t)];

\t\tif (!cardIds.length) {
\t\t\treturn fail(400, { message: 'Select at least one card first.' });
\t\t}

\t\tconst target = normalize(form.get('bulk_affiliation'));

\t\tlet affiliationId = null;

\t\tif (target && target.toUpperCase() !== 'NIL') {
\t\t\tconst numericId = Number(target);

\t\t\tif (!Number.isInteger(numericId) || numericId <= 0) {
\t\t\t\treturn fail(400, { message: 'Invalid bulk affiliation.' });
\t\t\t}

\t\t\tconst affiliation = await database.prepare(\`
\t\t\t\tSELECT id
\t\t\t\tFROM affiliations
\t\t\t\tWHERE id = ?
\t\t\t\tLIMIT 1
\t\t\t\`).bind(numericId).first();

\t\t\tif (!affiliation) {
\t\t\t\treturn fail(400, { message: 'Bulk affiliation not found.' });
\t\t\t}

\t\t\taffiliationId = affiliation.id;
\t\t}

\t\ttry {
\t\t\tconst placeholders = cardIds.map(() => '?').join(', ');

\t\t\tawait database.prepare(\`
\t\t\t\tUPDATE cards
\t\t\t\tSET affiliation_id = ?, confidence = 1.0
\t\t\t\tWHERE id IN (\${placeholders})
\t\t\t\`).bind(affiliationId, ...cardIds).run();
\t\t} catch (error) {
\t\t\treturn fail(400, {
\t\t\t\tmessage:
\t\t\t\t\terror?.message?.includes('idx_cards_unique_identity')
\t\t\t\t\t\t? 'That bulk change would create duplicate logical cards. Review the conflicting rows first.'
\t\t\t\t\t\t: error?.message || 'Could not bulk update affiliations.'
\t\t\t});
\t\t}

\t\tconst params = new URLSearchParams(url.searchParams);
\t\tparams.set('bulkSaved', String(cardIds.length));

\t\tthrow redirect(303, \`/admin/cards?\${params.toString()}\`);
\t}
};`;

	source = replaceOnce(source, oldEnd, newEnd, 'server bulk action');
	fs.writeFileSync(path, source);
	console.log('Patched card data server.');
}

function patchPage() {
	const path = 'src/routes/admin/cards/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');

	source = replaceOnce(
		source,
		`\tlet editing = $state(null);

\tfunction edit(card) {`,
		`\tlet editing = $state(null);
\tlet selected = $state([]);

\tconst allVisibleSelected = $derived(
\t\tdata.cards.length > 0 && data.cards.every((card) => selected.includes(card.id))
\t);

\tfunction toggleCard(id) {
\t\tselected = selected.includes(id)
\t\t\t? selected.filter((cardId) => cardId !== id)
\t\t\t: [...selected, id];
\t}

\tfunction toggleVisible() {
\t\tif (allVisibleSelected) {
\t\t\tconst visible = new Set(data.cards.map((card) => card.id));
\t\t\tselected = selected.filter((id) => !visible.has(id));
\t\t} else {
\t\t\tselected = [...new Set([...selected, ...data.cards.map((card) => card.id)])];
\t\t}
\t}

\tfunction edit(card) {`,
		'selection state'
	);

	source = replaceOnce(
		source,
		`\t<div class="count">{data.cards.length} rows shown</div>

\t<div class="table">`,
		`\t<div class="count-row">
\t\t<div class="count">{data.cards.length} rows shown</div>

\t\t{#if selected.length}
\t\t\t<form class="bulk" method="POST" action="?/bulkAffiliation">
\t\t\t\t{#each selected as id}
\t\t\t\t\t<input type="hidden" name="card_ids" value={id} />
\t\t\t\t{/each}

\t\t\t\t<strong>{selected.length} selected</strong>

\t\t\t\t<label>
\t\t\t\t\t<span>Set affiliation</span>
\t\t\t\t\t<select name="bulk_affiliation">
\t\t\t\t\t\t<option value="NIL">NIL / no affiliation</option>
\t\t\t\t\t\t{#each data.affiliations as affiliation}
\t\t\t\t\t\t\t<option value={affiliation.id}>{affiliation.name}</option>
\t\t\t\t\t\t{/each}
\t\t\t\t\t</select>
\t\t\t\t</label>

\t\t\t\t<button>Apply to selected</button>
\t\t\t</form>
\t\t{/if}
\t</div>

\t<div class="table">`,
		'bulk bar'
	);

	source = replaceOnce(
		source,
		`\t\t<div class="thead">
\t\t\t<span>#</span><span>Subject</span><span>Affiliation</span><span>Tags</span><span>Set / checklist</span><span></span>
\t\t</div>`,
		`\t\t<div class="thead">
\t\t\t<label class="select-all" title="Select all visible rows">
\t\t\t\t<input type="checkbox" checked={allVisibleSelected} onchange={toggleVisible} />
\t\t\t</label>
\t\t\t<span>#</span><span>Subject</span><span>Affiliation</span><span>Tags</span><span>Set / checklist</span><span></span>
\t\t</div>`,
		'table select all'
	);

	source = replaceOnce(
		source,
		`\t\t{#each data.cards as card}
\t\t\t<div class="row">
\t\t\t\t<strong class="number">{card.card_number}</strong>`,
		`\t\t{#each data.cards as card}
\t\t\t<div class="row" class:selected={selected.includes(card.id)}>
\t\t\t\t<label class="row-check" aria-label={\`Select \${card.card_number} \${card.subject_name}\`}>
\t\t\t\t\t<input
\t\t\t\t\t\ttype="checkbox"
\t\t\t\t\t\tchecked={selected.includes(card.id)}
\t\t\t\t\t\tonchange={() => toggleCard(card.id)}
\t\t\t\t\t/>
\t\t\t\t</label>
\t\t\t\t<strong class="number">{card.card_number}</strong>`,
		'row checkboxes'
	);

	source = replaceOnce(
		source,
		`.filters button,.save{border:0;border-radius:.65rem;background:var(--ink);color:white;padding:.69rem .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.count{padding:.8rem 0;color:var(--muted);font-size:.7rem}
\t.table{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:#fff}.thead,.row{display:grid;grid-template-columns:100px 1.1fr 1fr .7fr 1.3fr 70px;gap:1rem;align-items:center}.thead{padding:.7rem .9rem;background:#fafafa;border-bottom:1px solid var(--line);font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.row{padding:.8rem .9rem;border-bottom:1px solid var(--line)}`,
		`.filters button,.save{border:0;border-radius:.65rem;background:var(--ink);color:white;padding:.69rem .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.count{padding:.8rem 0;color:var(--muted);font-size:.7rem}.count-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:58px}.bulk{display:flex;align-items:end;gap:.55rem;padding:.45rem 0}.bulk strong{align-self:center;font-size:.72rem;white-space:nowrap}.bulk label{display:grid;gap:.2rem}.bulk label>span{font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.bulk select{min-width:220px;border:1px solid var(--line-strong);border-radius:.55rem;background:#fff;padding:.5rem .6rem;font:inherit;font-size:.7rem}.bulk button{border:0;border-radius:.55rem;background:var(--ink);color:#fff;padding:.55rem .7rem;font:inherit;font-size:.68rem;font-weight:850;cursor:pointer}
\t.table{border:1px solid var(--line);border-radius:.9rem;overflow:hidden;background:#fff}.thead,.row{display:grid;grid-template-columns:32px 100px 1.1fr 1fr .7fr 1.3fr 70px;gap:1rem;align-items:center}.thead{padding:.7rem .9rem;background:#fafafa;border-bottom:1px solid var(--line);font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.row{padding:.8rem .9rem;border-bottom:1px solid var(--line)}.row.selected{background:#fafbf7}.row-check,.select-all{display:grid;place-items:center}.row-check input,.select-all input{width:16px;height:16px;cursor:pointer}`,
		'bulk styles'
	);

	source = replaceOnce(
		source,
		`@media(max-width:1050px){.filters{grid-template-columns:1fr 1fr}.thead{display:none}.row{grid-template-columns:80px 1fr 1fr 70px}.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:2/4}}@media(max-width:650px){.filters,.grid{grid-template-columns:1fr}.row{grid-template-columns:65px 1fr 60px}.row>div:nth-of-type(2),.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:2}.edit{grid-column:3;grid-row:1}}`,
		`@media(max-width:1050px){.filters{grid-template-columns:1fr 1fr}.count-row{align-items:flex-start;flex-direction:column;padding-bottom:.6rem}.bulk{width:100%;flex-wrap:wrap}.thead{display:none}.row{grid-template-columns:32px 80px 1fr 1fr 70px}.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:3/5}}@media(max-width:650px){.filters,.grid{grid-template-columns:1fr}.bulk{display:grid;grid-template-columns:1fr}.bulk select{width:100%;min-width:0}.row{grid-template-columns:28px 65px 1fr 60px}.row>div:nth-of-type(2),.row>div:nth-of-type(3),.row>div:nth-of-type(4){grid-column:3}.edit{grid-column:4;grid-row:1}}`,
		'responsive bulk styles'
	);

	fs.writeFileSync(path, source);
	console.log('Patched card data page.');
}

patchServer();
patchPage();

console.log('Card bulk edit installed.');
