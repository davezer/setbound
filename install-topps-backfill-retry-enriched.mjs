import fs from 'node:fs';

function patch(path, oldText, newText, label) {
  if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);
  let source = fs.readFileSync(path, 'utf8');
  if (source.includes(newText)) {
    console.log(`${label} already installed.`);
    return;
  }
  if (!source.includes(oldText)) {
    throw new Error(`Could not find expected block for ${label} in ${path}.`);
  }
  source = source.replace(oldText, newText);
  fs.writeFileSync(path, source);
  console.log(`Patched ${label}`);
}

const serverPath = 'src/routes/admin/sets/+page.server.js';
const pagePath = 'src/routes/admin/sets/+page.svelte';

patch(
  serverPath,
  `\t\t\tp.release_date,\n\t\t\tp.published,`,
  `\t\t\tp.release_date,\n\t\t\tp.product_notes,\n\t\t\tp.published,\n\t\t\tCASE WHEN length(trim(COALESCE(p.product_notes, ''))) > 0 THEN 1 ELSE 0 END AS has_enrichment,`,
  'Manage Sets enrichment state query'
);

patch(
  pagePath,
  `\tlet backfillBusy = $state(false);\n\tlet backfillProgress = $state(null);\n\tlet backfillIssues = $state([]);`,
  `\tlet backfillBusy = $state(false);\n\tlet backfillProgress = $state(null);\n\tlet backfillIssues = $state([]);\n\tlet lastFailedProductIds = $state([]);`,
  'failed retry state'
);

patch(
  pagePath,
  `\tasync function backfillToppsVisible() {\n\t\tconst targets = visible.filter(\n\t\t\t(product) => String(product.manufacturer_name || '').toLowerCase() === 'topps'\n\t\t);`,
  `\tasync function runToppsBackfill(targets, label = 'Topps backfill') {\n\t\tif (!targets.length) {\n\t\t\tmessage = 'No Topps products need this backfill.';\n\t\t\treturn;\n\t\t}\n\n\t\tbackfillBusy = true;\n\t\tmessage = '';\n\t\tbackfillIssues = [];\n\t\tlastFailedProductIds = [];\n\t\tbackfillProgress = {\n\t\t\ttotal: targets.length,\n\t\t\tprocessed: 0,\n\t\t\tharvested: 0,\n\t\t\tcached: 0,\n\t\t\tunmatched: 0,\n\t\t\tfailed: 0\n\t\t};\n\n\t\ttry {\n\t\t\tfor (let offset = 0; offset < targets.length; offset += 8) {\n\t\t\t\tconst batch = targets.slice(offset, offset + 8);\n\t\t\t\tconst response = await fetch('/api/admin/topps-launch-backfill', {\n\t\t\t\t\tmethod: 'POST',\n\t\t\t\t\theaders: { 'content-type': 'application/json' },\n\t\t\t\t\tbody: JSON.stringify({\n\t\t\t\t\t\tmode: 'backfill',\n\t\t\t\t\t\tproductIds: batch.map((product) => product.id)\n\t\t\t\t\t})\n\t\t\t\t});\n\t\t\t\tconst result = await response.json();\n\t\t\t\tif (!response.ok) {\n\t\t\t\t\tconst detail = typeof result?.message === 'string'\n\t\t\t\t\t\t? result.message\n\t\t\t\t\t\t: JSON.stringify(result?.message || result || 'Topps metadata batch failed.');\n\t\t\t\t\tthrow new Error(detail);\n\t\t\t\t}\n\n\t\t\t\tfor (const row of result.results || []) {\n\t\t\t\t\tconst product = products.find((item) => Number(item.id) === Number(row.productId));\n\n\t\t\t\t\tif (row.status === 'harvested') {\n\t\t\t\t\t\tbackfillProgress.harvested += 1;\n\t\t\t\t\t\tif (product) product.has_topps_backfill = 1;\n\t\t\t\t\t} else if (row.status === 'cached') {\n\t\t\t\t\t\tbackfillProgress.cached += 1;\n\t\t\t\t\t\tif (product) product.has_topps_backfill = 1;\n\t\t\t\t\t} else if (row.status === 'unmatched') {\n\t\t\t\t\t\tbackfillProgress.unmatched += 1;\n\t\t\t\t\t\tbackfillIssues.push({\n\t\t\t\t\t\t\tproductId: row.productId,\n\t\t\t\t\t\t\tproduct: product?.name || \`Product \${row.productId}\`,\n\t\t\t\t\t\t\tstatus: 'Unmatched',\n\t\t\t\t\t\t\treason: row.reason || 'No safe launch match.',\n\t\t\t\t\t\t\tcandidate: row.candidate || null\n\t\t\t\t\t\t});\n\t\t\t\t\t} else if (row.status === 'failed') {\n\t\t\t\t\t\tbackfillProgress.failed += 1;\n\t\t\t\t\t\tlastFailedProductIds = [...lastFailedProductIds, Number(row.productId)];\n\t\t\t\t\t\tbackfillIssues.push({\n\t\t\t\t\t\t\tproductId: row.productId,\n\t\t\t\t\t\t\tproduct: product?.name || \`Product \${row.productId}\`,\n\t\t\t\t\t\t\tstatus: 'Failed',\n\t\t\t\t\t\t\treason: row.reason || 'Launch detail failed.',\n\t\t\t\t\t\t\tcandidate: row.candidate || null\n\t\t\t\t\t\t});\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tproducts = [...products];\n\t\t\t\tbackfillIssues = [...backfillIssues];\n\t\t\t\tbackfillProgress.processed += batch.length;\n\t\t\t\tbackfillProgress = { ...backfillProgress };\n\t\t\t}\n\n\t\t\tmessage = \`${label} complete: \${backfillProgress.harvested} harvested · \${backfillProgress.cached} already cached · \${backfillProgress.unmatched} unmatched · \${backfillProgress.failed} failed.\`;\n\t\t} catch (error) {\n\t\t\tmessage = error?.message || 'Topps enrichment backfill failed.';\n\t\t} finally {\n\t\t\tbackfillBusy = false;\n\t\t}\n\t}\n\n\tasync function backfillToppsVisible() {\n\t\tconst targets = visible.filter(\n\t\t\t(product) =>\n\t\t\t\tString(product.manufacturer_name || '').toLowerCase() === 'topps' &&\n\t\t\t\t!product.has_topps_backfill\n\t\t);`,
  'shared Topps backfill runner'
);

// Replace old body after confirmation with call to shared runner.
const oldBlockStart = `\n\t\tbackfillBusy = true;\n\t\tmessage = '';\n\t\tbackfillIssues = [];\n\t\tbackfillProgress = {`;
const source = fs.readFileSync(pagePath, 'utf8');
const funcStart = source.indexOf('\tasync function backfillToppsVisible()');
const toggleStart = source.indexOf('\n\tasync function toggleVisibility', funcStart);
if (funcStart < 0 || toggleStart < 0) throw new Error('Could not locate backfillToppsVisible function boundaries.');
let func = source.slice(funcStart, toggleStart);
if (!func.includes('await runToppsBackfill(targets')) {
  const confirmLineEnd = func.indexOf(")) return;", func.indexOf('if (!confirm('));
  if (confirmLineEnd < 0) throw new Error('Could not locate backfill confirmation.');
  const keep = func.slice(0, confirmLineEnd + ")) return;".length);
  const replacementFunc = `${keep}\n\n\t\tawait runToppsBackfill(targets, 'Topps backfill');\n\t}\n\n\tasync function retryFailedTopps() {\n\t\tconst failed = new Set(lastFailedProductIds);\n\t\tconst targets = products.filter((product) => failed.has(Number(product.id)));\n\t\tif (!targets.length) {\n\t\t\tmessage = 'No failed Topps backfill results to retry.';\n\t\t\treturn;\n\t\t}\n\t\tawait runToppsBackfill(targets, 'Topps failed-only retry');\n\t}\n`;
  const whole = source.slice(0, funcStart) + replacementFunc + source.slice(toggleStart);
  fs.writeFileSync(pagePath, whole);
  console.log('Patched backfill function and failed-only retry.');
}

let page = fs.readFileSync(pagePath, 'utf8');

const oldApplied = `\tfunction enrichmentApplied(payload) {\n\t\tif (!enrichmentProduct) return;\n\t\tenrichmentProduct.release_date = payload.releaseDate || enrichmentProduct.release_date;\n\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];\n\t\tmessage = 'Product details enriched.';\n\t}`;
const newApplied = `\tfunction enrichmentApplied(payload) {\n\t\tif (!enrichmentProduct) return;\n\t\tenrichmentProduct.release_date = payload.releaseDate || enrichmentProduct.release_date;\n\t\tif (String(payload.overview || '').trim()) {\n\t\t\tenrichmentProduct.product_notes = payload.overview;\n\t\t\tenrichmentProduct.has_enrichment = 1;\n\t\t}\n\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];\n\t\tmessage = 'Product details enriched.';\n\t}`;
if (page.includes(oldApplied)) page = page.replace(oldApplied, newApplied);

const oldTitleBadges = `{#if product.published}\n\t\t\t\t\t\t\t<span class="status live">Live</span>\n\t\t\t\t\t\t{:else}\n\t\t\t\t\t\t\t<span class="status draft">Draft</span>\n\t\t\t\t\t\t{/if}`;
const newTitleBadges = `{#if product.published}\n\t\t\t\t\t\t\t<span class="status live">Live</span>\n\t\t\t\t\t\t{:else}\n\t\t\t\t\t\t\t<span class="status draft">Draft</span>\n\t\t\t\t\t\t{/if}\n\t\t\t\t\t\t{#if product.has_enrichment}\n\t\t\t\t\t\t\t<span class="status enriched">Enriched ✓</span>\n\t\t\t\t\t\t{/if}`;
if (page.includes(oldTitleBadges) && !page.includes('status enriched')) {
  page = page.replace(oldTitleBadges, newTitleBadges);
}

const oldBackfillButton = `<button class="backfill" type="button" onclick={backfillToppsVisible} disabled={backfillBusy}>\n\t\t\t{backfillBusy ? 'Backfilling Topps…' : 'Backfill Topps metadata'}\n\t\t</button>`;
const newBackfillButton = `<div class="backfill-actions">\n\t\t\t{#if lastFailedProductIds.length}\n\t\t\t\t<button class="retry-failed" type="button" onclick={retryFailedTopps} disabled={backfillBusy}>\n\t\t\t\t\tRetry {lastFailedProductIds.length} failed only\n\t\t\t\t</button>\n\t\t\t{/if}\n\t\t\t<button class="backfill" type="button" onclick={backfillToppsVisible} disabled={backfillBusy}>\n\t\t\t\t{backfillBusy ? 'Backfilling Topps…' : 'Backfill missing Topps metadata'}\n\t\t\t</button>\n\t\t</div>`;
if (page.includes(oldBackfillButton)) page = page.replace(oldBackfillButton, newBackfillButton);

const oldEnrichButton = `<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich details</button>`;
const newEnrichButton = `<button class="edit" type="button" onclick={() => enrichmentProduct = product}>\n\t\t\t\t\t\t{product.has_enrichment ? 'Review enrichment' : product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details'}\n\t\t\t\t\t</button>`;
if (page.includes(oldEnrichButton)) page = page.replace(oldEnrichButton, newEnrichButton);

if (!page.includes('.status.enriched')) {
  page = page.replace(
    `.status.draft{background:#f2f0ed;color:#766f67}`,
    `.status.draft{background:#f2f0ed;color:#766f67}\n\t.status.enriched{background:#eef5ff;color:#174f91;border:1px solid #c8d9ee}`
  );
}
if (!page.includes('.backfill-actions{')) {
  page = page.replace(
    `.backfill-panel{`,
    `.backfill-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;justify-content:flex-end}\n\t.retry-failed{border:1px solid var(--line-strong);border-radius:.6rem;background:#fff;padding:.6rem .75rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}\n\t.retry-failed:disabled{opacity:.55;cursor:not-allowed}\n\t.backfill-panel{`
  );
}

fs.writeFileSync(pagePath, page);
console.log('Installed enriched badge, smarter buttons, and retry-failed UI.');
