import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
	if (source.includes(replacement)) {
		console.log(`${label}: already applied`);
		return;
	}
	if (!source.includes(search)) {
		throw new Error(`${label}: expected code was not found.`);
	}
	source = source.replace(search, replacement);
	console.log(`${label}: applied`);
}

replaceOnce(
	`\tlet oddsPreviewName = $state('');\n`,
	`\tlet oddsPreviewName = $state('');

\tlet enrichment = $state(null);
\tlet enrichmentProductSlug = $state('');
\tlet enrichmentTargetIndex = $state(null);
\tlet enrichmentBusy = $state(false);
\tlet enrichmentError = $state('');
\tlet enrichReleaseDate = $state(true);
\tlet enrichOverview = $state(true);
\tlet enrichFormats = $state(true);
\tlet enrichImage = $state(true);
\tlet selectedEnrichmentImage = $state('');
`,
	'Enrichment state'
);

replaceOnce(
	`\tfunction setQueueValue(index, field, value) {\n\t\tqueue[index] = { ...queue[index], [field]: value };\n\t\tqueue = [...queue];\n\t}\n`,
	`\tasync function openEnrichment(item, productSlug, queueIndex = null) {
\t\tif (!item?.pageUrl || !productSlug) {
\t\t\terrorMessage = 'This product does not have a Checklist Insider source page to enrich from.';
\t\t\treturn;
\t\t}

\t\tenrichmentBusy = true;
\t\tenrichmentError = '';
\t\tenrichment = null;
\t\tenrichmentProductSlug = productSlug;
\t\tenrichmentTargetIndex = queueIndex;
\t\tenrichReleaseDate = true;
\t\tenrichOverview = true;
\t\tenrichFormats = true;
\t\tenrichImage = true;

\t\ttry {
\t\t\tconst response = await fetch(
\t\t\t\t\`/api/admin/source-harvester/enrich?url=\${encodeURIComponent(item.pageUrl)}&name=\${encodeURIComponent(item.name || '')}\`
\t\t\t);
\t\t\tconst result = await response.json();
\t\t\tif (!response.ok) throw new Error(result.message || 'Could not enrich this product.');
\t\t\tenrichment = result.enrichment;
\t\t\tselectedEnrichmentImage = result.enrichment.images?.[0]?.url || '';
\t\t} catch (error) {
\t\t\tenrichmentError = error?.message || 'Could not enrich this product.';
\t\t} finally {
\t\t\tenrichmentBusy = false;
\t\t}
\t}

\tfunction closeEnrichment() {
\t\tenrichment = null;
\t\tenrichmentProductSlug = '';
\t\tenrichmentTargetIndex = null;
\t\tenrichmentError = '';
\t\tselectedEnrichmentImage = '';
\t}

\tasync function applyEnrichment() {
\t\tif (!enrichment || !enrichmentProductSlug) return;

\t\tenrichmentBusy = true;
\t\tenrichmentError = '';

\t\ttry {
\t\t\tconst response = await fetch('/api/admin/source-harvester/apply-enrichment', {
\t\t\t\tmethod: 'POST',
\t\t\t\theaders: { 'content-type': 'application/json' },
\t\t\t\tbody: JSON.stringify({
\t\t\t\t\tproductSlug: enrichmentProductSlug,
\t\t\t\t\treleaseDate: enrichment.releaseDate || '',
\t\t\t\t\toverview: enrichment.overview || '',
\t\t\t\t\tformats: enrichment.formats || [],
\t\t\t\t\timageUrl: selectedEnrichmentImage,
\t\t\t\t\tapplyReleaseDate: enrichReleaseDate,
\t\t\t\t\tapplyOverview: enrichOverview,
\t\t\t\t\tapplyFormats: enrichFormats,
\t\t\t\t\tapplyImage: enrichImage && Boolean(selectedEnrichmentImage)
\t\t\t\t})
\t\t\t});

\t\t\tconst result = await response.json();
\t\t\tif (!response.ok) throw new Error(result.message || 'Enrichment failed.');

\t\t\tif (enrichmentTargetIndex != null && queue[enrichmentTargetIndex]) {
\t\t\t\tqueue[enrichmentTargetIndex] = {
\t\t\t\t\t...queue[enrichmentTargetIndex],
\t\t\t\t\tenriched: true,
\t\t\t\t\tstatusText: queue[enrichmentTargetIndex].oddsImported
\t\t\t\t\t\t? 'Imported + odds + enriched'
\t\t\t\t\t\t: 'Imported + enriched'
\t\t\t\t};
\t\t\t\tqueue = [...queue];
\t\t\t}

\t\t\tmessage = 'Product metadata and artwork saved.';
\t\t\tcloseEnrichment();
\t\t} catch (error) {
\t\t\tenrichmentError = error?.message || 'Enrichment failed.';
\t\t} finally {
\t\t\tenrichmentBusy = false;
\t\t}
\t}

\tfunction setQueueValue(index, field, value) {
\t\tqueue[index] = { ...queue[index], [field]: value };
\t\tqueue = [...queue];
\t}
`,
	'Enrichment functions'
);

replaceOnce(
	`\t\t\t\t\t<div>{#if existing}<span class="badge existing-badge">In Setbound</span>{:else}<span class="badge">New</span>{/if}</div>`,
	`\t\t\t\t\t<div class="catalog-status">
\t\t\t\t\t\t{#if existing}
\t\t\t\t\t\t\t<span class="badge existing-badge">In Setbound</span>
\t\t\t\t\t\t\t{#if item.source === 'Checklist Insider' && item.pageUrl}
\t\t\t\t\t\t\t\t<button class="mini-enrich" type="button" onclick={() => openEnrichment(item, existing.slug)}>Enrich</button>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t{:else}
\t\t\t\t\t\t\t<span class="badge">New</span>
\t\t\t\t\t\t{/if}
\t\t\t\t\t</div>`,
	'Catalog enrich action'
);

replaceOnce(
	`\t\t\t\t\t\t\t{#if row.importedSlug}<a class="secondary" href={\`/sets/\${row.importedSlug}\`}>View set →</a>{/if}`,
	`\t\t\t\t\t\t\t{#if row.importedSlug && row.pageUrl}
\t\t\t\t\t\t\t\t<button class="secondary" type="button" onclick={() => openEnrichment(row, row.importedSlug, index)}>
\t\t\t\t\t\t\t\t\t{row.enriched ? 'Enriched ✓' : 'Enrich draft →'}
\t\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t{#if row.importedSlug}<a class="secondary" href={\`/sets/\${row.importedSlug}\`}>View set →</a>{/if}`,
	'Queue enrich action'
);

replaceOnce(
	`\t{#if oddsPreviewUrl}\n`,
	`\t{#if enrichmentBusy && !enrichment}
\t\t<div class="enrich-backdrop">
\t\t\t<div class="enrich-loading">Harvesting product metadata and artwork…</div>
\t\t</div>
\t{/if}

\t{#if enrichment || enrichmentError}
\t\t<div class="enrich-backdrop" role="presentation" onclick={closeEnrichment}>
\t\t\t<div class="enrich-modal" role="dialog" aria-modal="true" onclick={(event) => event.stopPropagation()}>
\t\t\t\t<div class="enrich-head">
\t\t\t\t\t<div>
\t\t\t\t\t\t<div class="eyebrow">Product enrichment</div>
\t\t\t\t\t\t<h2>{enrichment?.title || 'Checklist Insider metadata'}</h2>
\t\t\t\t\t\t<p>Review everything before it is written to Setbound.</p>
\t\t\t\t\t</div>
\t\t\t\t\t<button class="close" type="button" onclick={closeEnrichment}>×</button>
\t\t\t\t</div>

\t\t\t\t{#if enrichmentError}<div class="enrich-error">{enrichmentError}</div>{/if}

\t\t\t\t{#if enrichment}
\t\t\t\t\t<div class="enrich-body">
\t\t\t\t\t\t<section class="enrich-section">
\t\t\t\t\t\t\t<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichReleaseDate} /><span>Release date</span></label>
\t\t\t\t\t\t\t<input class="input" type="date" bind:value={enrichment.releaseDate} disabled={!enrichReleaseDate} />
\t\t\t\t\t\t</section>

\t\t\t\t\t\t<section class="enrich-section">
\t\t\t\t\t\t\t<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichOverview} /><span>Setbound overview</span></label>
\t\t\t\t\t\t\t<textarea class="input overview-edit" rows="6" bind:value={enrichment.overview} disabled={!enrichOverview}></textarea>
\t\t\t\t\t\t\t<p class="enrich-help">This is an original Setbound draft assembled from factual product details, not copied article prose.</p>
\t\t\t\t\t\t</section>

\t\t\t\t\t\t<section class="enrich-section">
\t\t\t\t\t\t\t<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichFormats} /><span>Product configuration / box break</span></label>
\t\t\t\t\t\t\t{#if enrichment.formats?.length}
\t\t\t\t\t\t\t\t<div class="enrich-formats">
\t\t\t\t\t\t\t\t\t{#each enrichment.formats as format}
\t\t\t\t\t\t\t\t\t\t<label>
\t\t\t\t\t\t\t\t\t\t\t<span>{format.label}</span>
\t\t\t\t\t\t\t\t\t\t\t<textarea class="input" rows="4" bind:value={format.details} disabled={!enrichFormats}></textarea>
\t\t\t\t\t\t\t\t\t\t</label>
\t\t\t\t\t\t\t\t\t{/each}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t{:else}
\t\t\t\t\t\t\t\t<p class="enrich-help">No structured box configuration was detected on this page.</p>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t</section>

\t\t\t\t\t\t<section class="enrich-section">
\t\t\t\t\t\t\t<label class="enrich-toggle"><input type="checkbox" bind:checked={enrichImage} /><span>Product artwork</span></label>
\t\t\t\t\t\t\t{#if enrichment.images?.length}
\t\t\t\t\t\t\t\t<div class="image-candidates">
\t\t\t\t\t\t\t\t\t{#each enrichment.images as image}
\t\t\t\t\t\t\t\t\t\t<label class:selected={selectedEnrichmentImage === image.url}>
\t\t\t\t\t\t\t\t\t\t\t<input type="radio" name="enrich_image" value={image.url} bind:group={selectedEnrichmentImage} disabled={!enrichImage} />
\t\t\t\t\t\t\t\t\t\t\t<img src={image.url} alt={image.alt || 'Product image candidate'} loading="lazy" />
\t\t\t\t\t\t\t\t\t\t\t<span>{image.alt || 'Checklist Insider image'}</span>
\t\t\t\t\t\t\t\t\t\t</label>
\t\t\t\t\t\t\t\t\t{/each}
\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t{:else}
\t\t\t\t\t\t\t\t<p class="enrich-help">No safe Checklist Insider product-image candidates were detected.</p>
\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t</section>

\t\t\t\t\t\t{#if enrichment.sourceFacts?.length}
\t\t\t\t\t\t\t<details class="source-facts">
\t\t\t\t\t\t\t\t<summary>Source facts used for review</summary>
\t\t\t\t\t\t\t\t{#each enrichment.sourceFacts as fact}<p>{fact}</p>{/each}
\t\t\t\t\t\t\t</details>
\t\t\t\t\t\t{/if}
\t\t\t\t\t</div>

\t\t\t\t\t<div class="enrich-footer">
\t\t\t\t\t\t<a href={enrichment.sourceUrl} target="_blank" rel="noreferrer">Open source page ↗</a>
\t\t\t\t\t\t<div>
\t\t\t\t\t\t\t<button class="ghost" type="button" onclick={closeEnrichment}>Cancel</button>
\t\t\t\t\t\t\t<button class="primary" type="button" onclick={applyEnrichment} disabled={enrichmentBusy}>{enrichmentBusy ? 'Saving…' : 'Apply enrichment'}</button>
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t{/if}
\t\t\t</div>
\t\t</div>
\t{/if}

\t{#if oddsPreviewUrl}
`,
	'Enrichment modal'
);

replaceOnce(
	`\t.odds-head-actions{display:flex;align-items:center;gap:.55rem}`,
	`\t.catalog-status{display:grid;justify-items:start;gap:.35rem}.mini-enrich{border:0;background:transparent;padding:0;color:var(--blue);font:inherit;font-size:.58rem;font-weight:900;cursor:pointer}.mini-enrich:hover{text-decoration:underline}
\t.enrich-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:1rem;background:rgba(20,18,16,.52);backdrop-filter:blur(2px)}.enrich-loading{padding:1rem 1.2rem;border-radius:.8rem;background:#fff;font-size:.75rem;font-weight:850;box-shadow:0 20px 70px rgba(0,0,0,.2)}.enrich-modal{width:min(1040px,96vw);max-height:92vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:1rem;box-shadow:0 24px 90px rgba(0,0,0,.24)}.enrich-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1rem 1.15rem;border-bottom:1px solid var(--line)}.enrich-head h2{font-family:var(--display);font-size:2rem;font-weight:500;letter-spacing:-.04em;margin:.25rem 0}.enrich-head p{margin:0;color:var(--muted);font-size:.7rem}.enrich-body{overflow:auto;padding:0 1.15rem}.enrich-section{padding:1rem 0;border-bottom:1px solid var(--line)}.enrich-toggle{display:flex;align-items:center;gap:.45rem;margin-bottom:.6rem;font-size:.7rem;font-weight:900}.overview-edit{width:100%;resize:vertical;line-height:1.5}.enrich-help{margin:.4rem 0 0;color:var(--muted);font-size:.62rem;line-height:1.45}.enrich-formats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.enrich-formats label{display:grid;gap:.3rem}.enrich-formats label>span{font-size:.58rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.enrich-formats textarea{resize:vertical;line-height:1.45}.image-candidates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.image-candidates label{position:relative;display:grid;grid-template-rows:150px auto;overflow:hidden;border:1px solid var(--line);border-radius:.7rem;background:#faf9f7;cursor:pointer}.image-candidates label.selected{outline:2px solid var(--blue);outline-offset:1px}.image-candidates input{position:absolute;top:.55rem;left:.55rem;z-index:2}.image-candidates img{width:100%;height:100%;object-fit:contain;background:#fff}.image-candidates label>span{padding:.5rem;font-size:.58rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.source-facts{padding:1rem 0}.source-facts summary{cursor:pointer;font-size:.66rem;font-weight:900}.source-facts p{font-size:.65rem;line-height:1.5;color:var(--muted)}.enrich-footer{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 1.15rem;border-top:1px solid var(--line);background:#faf9f7}.enrich-footer>a{color:var(--blue);font-size:.65rem;font-weight:850;text-decoration:none}.enrich-footer>div{display:flex;gap:.5rem}.enrich-error{margin:1rem 1.15rem;padding:.7rem;border:1px solid #efc8bc;border-radius:.6rem;background:#fff2ee;color:#8f3726;font-size:.7rem}
\t.odds-head-actions{display:flex;align-items:center;gap:.55rem}`,
	'Enrichment styles'
);

source = source.replace(
	`@media(max-width:850px){`,
	`@media(max-width:850px){.enrich-formats,.image-candidates{grid-template-columns:1fr}.enrich-footer{align-items:flex-start;flex-direction:column}.enrich-footer>div{width:100%;flex-wrap:wrap}`
);

fs.writeFileSync(path, source);
console.log('Product enrichment workflow installed.');
