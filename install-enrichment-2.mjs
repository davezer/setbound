import fs from 'node:fs';

const patchDir = './enrichment-patches';

function patchOverview() {
	const path = 'src/lib/server/checklist-insider-enrichment.js';
	let source = fs.readFileSync(path, 'utf8');
	const start = source.indexOf('function makeOverview(title, releaseDate, formats, sourceFacts) {');
	const end = source.indexOf('\nfunction canonicalImageKey', start);
	if (start < 0 || end < 0) throw new Error('Could not locate makeOverview().');
	const replacement = fs.readFileSync(`${patchDir}/overview-v2.txt`, 'utf8').trimEnd();
	source = source.slice(0, start) + replacement + source.slice(end);
	fs.writeFileSync(path, source);
	console.log('Enrichment 2.0 overview generator installed.');
}

function patchManageSets() {
	const path = 'src/routes/admin/sets/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');
	if (source.includes('ProductEnrichmentModal')) return;
	source = source.replace('<script>\n', "<script>\n\timport ProductEnrichmentModal from '$lib/components/ProductEnrichmentModal.svelte';\n");
	source = source.replace("\tlet message = $state('');", "\tlet message = $state('');\n\tlet enrichmentProduct = $state(null);");
	source = source.replace(
		'\tasync function deleteImport(product) {',
		"\tfunction enrichmentApplied(payload) {\n\t\tif (!enrichmentProduct) return;\n\t\tenrichmentProduct.release_date = payload.releaseDate || enrichmentProduct.release_date;\n\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];\n\t\tmessage = 'Product details enriched.';\n\t}\n\n\tasync function deleteImport(product) {"
	);
	source = source.replace(
		'\t\t\t\t\t<a class="edit" href={`/admin/product/${product.id}`}>Edit details</a>',
		'\t\t\t\t\t<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich details</button>\n\t\t\t\t\t<a class="edit" href={`/admin/product/${product.id}`}>Edit details</a>'
	);
	const closing = '\n</section>\n\n<style>';
	if (!source.includes(closing)) throw new Error('Could not locate Manage Sets section close.');
	source = source.replace(closing, '\n</section>\n\n{#if enrichmentProduct}\n\t<ProductEnrichmentModal product={enrichmentProduct} onclose={() => enrichmentProduct = null} onapplied={enrichmentApplied} />\n{/if}\n\n<style>');
	fs.writeFileSync(path, source);
	console.log('Manage Sets enrichment button installed.');
}

function patchProductDetails() {
	const path = 'src/routes/admin/product/[id]/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');
	if (source.includes('async function autoFillDetails()')) return;
	const oldScript = '<script>\n\tlet { data, form } = $props();\n</script>';
	const newScript = fs.readFileSync(`${patchDir}/product-script.txt`, 'utf8').trimEnd();
	if (!source.includes(oldScript)) throw new Error('Could not locate Product Details script.');
	source = source.replace(oldScript, newScript);
	source = source.replace(
		'<div class="section-title">\n\t\t\t\t<div class="eyebrow">Basics</div>\n\t\t\t\t<h2>Product info</h2>\n\t\t\t</div>',
		'<div class="section-title">\n\t\t\t\t<div class="eyebrow">Basics</div>\n\t\t\t\t<h2>Product info</h2>\n\t\t\t</div>\n\n\t\t\t<div class="autofill-row">\n\t\t\t\t<button class="auto-fill" type="button" onclick={autoFillDetails} disabled={enrichmentBusy}>{enrichmentBusy ? \'Finding details…\' : \'Auto-fill from source\'}</button>\n\t\t\t\t{#if enrichmentMessage}<span>{enrichmentMessage}</span>{/if}\n\t\t\t</div>'
	);
	source = source.replace("value={data.product.release_date || ''}", 'bind:value={releaseDate}');
	source = source.replace(
		'<textarea\n\t\t\t\t\tname="product_notes"\n\t\t\t\t\tplaceholder="Short description of the set. Keep this to a sentence or two."\n\t\t\t\t>{data.product.product_notes || \'\'}</textarea>',
		'<textarea\n\t\t\t\t\tname="product_notes"\n\t\t\t\t\tplaceholder="Short collector-facing description of the product."\n\t\t\t\t\tbind:value={overview}\n\t\t\t\t></textarea>'
	);
	source = source.replace(
		'<textarea\n\t\t\t\t\t\t\tname={`format_${format.key}`}\n\t\t\t\t\t\t\tplaceholder={`Optional — add ${format.label.toLowerCase()} details…`}\n\t\t\t\t\t\t>{format.details}</textarea>',
		'<textarea\n\t\t\t\t\t\t\tname={`format_${format.key}`}\n\t\t\t\t\t\t\tplaceholder={`Optional — add ${format.label.toLowerCase()} details…`}\n\t\t\t\t\t\t\tvalue={formatValues[format.key] || \'\'}\n\t\t\t\t\t\t\toninput={(event) => formatValues[format.key] = event.currentTarget.value}\n\t\t\t\t\t\t></textarea>'
	);
	source = source.replace(
		'\t.save-row{display:flex;align-items:center;gap:1rem}',
		'\t.autofill-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.autofill-row span{font-size:.72rem;color:var(--muted)}.auto-fill{width:max-content;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.6rem .75rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.auto-fill:disabled{opacity:.55;cursor:not-allowed}\n\t.save-row{display:flex;align-items:center;gap:1rem}'
	);
	fs.writeFileSync(path, source);
	console.log('Product Details auto-fill installed.');
}

patchOverview();
patchManageSets();
patchProductDetails();
console.log('Setbound Enrichment 2.0 installed.');
