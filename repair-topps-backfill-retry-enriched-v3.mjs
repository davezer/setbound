import fs from 'node:fs';

const pagePath = 'src/routes/admin/sets/+page.svelte';
const serverPath = 'src/routes/admin/sets/+page.server.js';

for (const p of [pagePath, serverPath]) {
  if (!fs.existsSync(p)) throw new Error(`Could not find ${p}`);
}

let page = fs.readFileSync(pagePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

function replaceFunction(source, name, replacement) {
  const marker = `\tasync function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${name}()`);
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error(`Could not find opening brace for ${name}()`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(0, start) + replacement + source.slice(i + 1);
    }
  }
  throw new Error(`Could not find closing brace for ${name}()`);
}

// Server: add has_product_details if it is not already present.
if (!server.includes('AS has_product_details')) {
  const published = /(^\s*p\.published,\s*$)/m;
  if (!published.test(server)) throw new Error('Could not find p.published in Manage Sets query.');
  server = server.replace(published, `$1\n\t\t\tCASE WHEN NULLIF(TRIM(COALESCE(p.product_notes, '')), '') IS NOT NULL THEN 1 ELSE 0 END AS has_product_details,`);
}

// Client state for failed-only retries.
if (!page.includes('let lastFailedProductIds = $state([]);')) {
  const needle = '\tlet backfillIssues = $state([]);';
  if (!page.includes(needle)) throw new Error('Could not find backfillIssues state.');
  page = page.replace(needle, needle + '\n\tlet lastFailedProductIds = $state([]);');
}

const runToppsBackfill = String.raw`\tasync function runToppsBackfill(targets, label = 'Topps backfill') {
\t\tif (!targets.length) {
\t\t\tmessage = 'No Topps products need this backfill.';
\t\t\treturn;
\t\t}

\t\tbackfillBusy = true;
\t\tmessage = '';
\t\tbackfillIssues = [];
\t\tlastFailedProductIds = [];
\t\tbackfillProgress = {
\t\t\ttotal: targets.length,
\t\t\tprocessed: 0,
\t\t\tharvested: 0,
\t\t\tcached: 0,
\t\t\tunmatched: 0,
\t\t\tfailed: 0
\t\t};

\t\ttry {
\t\t\tfor (let offset = 0; offset < targets.length; offset += 8) {
\t\t\t\tconst batch = targets.slice(offset, offset + 8);
\t\t\t\tconst response = await fetch('/api/admin/topps-launch-backfill', {
\t\t\t\t\tmethod: 'POST',
\t\t\t\t\theaders: { 'content-type': 'application/json' },
\t\t\t\t\tbody: JSON.stringify({ mode: 'backfill', productIds: batch.map((product) => product.id) })
\t\t\t\t});
\t\t\t\tconst result = await response.json();
\t\t\t\tif (!response.ok) throw new Error(readableApiError(result.message || result.error || result, 'Topps metadata batch failed.'));

\t\t\t\tfor (const row of result.results || []) {
\t\t\t\t\tconst product = products.find((item) => Number(item.id) === Number(row.productId));
\t\t\t\t\tif (row.status === 'harvested') {
\t\t\t\t\t\tbackfillProgress.harvested += 1;
\t\t\t\t\t\tif (product) product.has_topps_backfill = 1;
\t\t\t\t\t} else if (row.status === 'cached') {
\t\t\t\t\t\tbackfillProgress.cached += 1;
\t\t\t\t\t\tif (product) product.has_topps_backfill = 1;
\t\t\t\t\t} else if (row.status === 'unmatched') {
\t\t\t\t\t\tbackfillProgress.unmatched += 1;
\t\t\t\t\t\tbackfillIssues.push({ productId: row.productId, product: product?.name || 'Product ' + row.productId, status: 'Unmatched', reason: row.reason || 'No safe launch match.', candidate: row.candidate || null });
\t\t\t\t\t} else if (row.status === 'failed') {
\t\t\t\t\t\tbackfillProgress.failed += 1;
\t\t\t\t\t\tlastFailedProductIds = [...lastFailedProductIds, Number(row.productId)];
\t\t\t\t\t\tbackfillIssues.push({ productId: row.productId, product: product?.name || 'Product ' + row.productId, status: 'Failed', reason: row.reason || 'Launch detail failed.', candidate: row.candidate || null });
\t\t\t\t\t}
\t\t\t\t}

\t\t\t\tproducts = [...products];
\t\t\t\tbackfillIssues = [...backfillIssues];
\t\t\t\tbackfillProgress.processed += batch.length;
\t\t\t\tbackfillProgress = { ...backfillProgress };
\t\t\t}

\t\t\tmessage = label + ' complete: ' + backfillProgress.harvested + ' harvested · ' + backfillProgress.cached + ' already cached · ' + backfillProgress.unmatched + ' unmatched · ' + backfillProgress.failed + ' failed.';
\t\t} catch (error) {
\t\t\tmessage = error?.message || 'Topps enrichment backfill failed.';
\t\t} finally {
\t\t\tbackfillBusy = false;
\t\t}
\t}

\tasync function backfillToppsVisible() {
\t\tconst targets = visible.filter((product) => String(product.manufacturer_name || '').toLowerCase() === 'topps' && !product.has_topps_backfill);
\t\tif (!targets.length) {
\t\t\tmessage = 'All visible Topps products with available backfill are already cached.';
\t\t\treturn;
\t\t}
\t\tif (!confirm('Backfill Topps enrichment metadata for ' + targets.length + ' visible product' + (targets.length === 1 ? '' : 's') + '?\\n\\nThis harvests and caches metadata only. It does not overwrite product details.')) return;
\t\tawait runToppsBackfill(targets, 'Topps backfill');
\t}

\tasync function retryFailedTopps() {
\t\tconst failedIds = new Set(lastFailedProductIds.map(Number));
\t\tconst targets = products.filter((product) => failedIds.has(Number(product.id)));
\t\tif (!targets.length) {
\t\t\tmessage = 'There are no failed Topps backfill products to retry.';
\t\t\treturn;
\t\t}
\t\tawait runToppsBackfill(targets, 'Topps failed retry');
\t}`;

page = replaceFunction(page, 'backfillToppsVisible', runToppsBackfill);

// Update enriched state immediately after Apply.
if (!page.includes('enrichmentProduct.has_product_details = 1;')) {
  const needle = '\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];';
  if (!page.includes(needle)) throw new Error('Could not patch enrichmentApplied().');
  page = page.replace(needle, '\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tenrichmentProduct.has_product_details = 1;\n\t\tproducts = [...products];');
}

// Enriched badge.
if (!page.includes('class="status enriched"')) {
  const needle = `\t\t\t\t\t\t{#if product.has_topps_backfill}\n\t\t\t\t\t\t\t<span class="status topps-ready" title="Cached first-party Topps launch metadata is ready for enrichment">Topps ready</span>\n\t\t\t\t\t\t{/if}`;
  if (!page.includes(needle)) throw new Error('Could not find Topps Ready badge block.');
  page = page.replace(needle, needle + `\n\t\t\t\t\t\t{#if product.has_product_details}\n\t\t\t\t\t\t\t<span class="status enriched">Enriched ✓</span>\n\t\t\t\t\t\t{/if}`);
}

// Button copy.
const oldButton = `{product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details'}`;
const newButton = `{product.has_product_details ? 'Review enrichment' : (product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details')}`;
if (!page.includes(newButton)) {
  if (!page.includes(oldButton)) throw new Error('Could not find enrichment button label.');
  page = page.replace(oldButton, newButton);
}

// Retry failed-only button.
if (!page.includes('onclick={retryFailedTopps}')) {
  const needle = `\t\t<button class="backfill" type="button" onclick={backfillToppsVisible} disabled={backfillBusy}>\n\t\t\t{backfillBusy ? 'Backfilling Topps…' : 'Backfill Topps metadata'}\n\t\t</button>`;
  if (!page.includes(needle)) throw new Error('Could not find Backfill Topps button.');
  page = page.replace(needle, needle + `\n\t\t{#if lastFailedProductIds.length}\n\t\t\t<button class="retry-failed" type="button" onclick={retryFailedTopps} disabled={backfillBusy}>Retry {lastFailedProductIds.length} failed only</button>\n\t\t{/if}`);
}

// Styles.
if (!page.includes('.status.enriched{')) {
  const needle = '\t.status.topps-ready{background:#eef6ef;color:#21613f;border:1px solid #cfe4d5}';
  if (!page.includes(needle)) throw new Error('Could not find Topps Ready style.');
  page = page.replace(needle, needle + '\n\t.status.enriched{background:#eef4ff;color:#234f8f;border:1px solid #c9d8ef}');
}
if (!page.includes('.retry-failed{')) {
  const needle = '\t.backfill:disabled{opacity:.55;cursor:not-allowed}';
  if (!page.includes(needle)) throw new Error('Could not find backfill disabled style.');
  page = page.replace(needle, needle + '\n\t.retry-failed{border:1px solid var(--line-strong);background:#fff;border-radius:.65rem;padding:.58rem .8rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}');
}

fs.writeFileSync(serverPath, server);
fs.writeFileSync(pagePath, page);
console.log('Repair v3 installed successfully.');
console.log('Run npm run check && npm run build.');
