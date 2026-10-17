import fs from 'node:fs';

const pagePath = 'src/routes/admin/sets/+page.svelte';
const serverPath = 'src/routes/admin/sets/+page.server.js';
for (const p of [pagePath, serverPath]) if (!fs.existsSync(p)) throw new Error(`Could not find ${p}`);

function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`\tasync function ${name}(`);
  if (start < 0) throw new Error(`Could not find ${name}()`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(0, start) + replacement + source.slice(i + 1);
    }
  }
  throw new Error(`Could not find end of ${name}()`);
}

let page = fs.readFileSync(pagePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

if (!server.includes('has_product_details')) {
  const a = "\t\t\tp.published,\n\t\t\tm.name AS manufacturer_name,";
  const b = "\t\t\tp.published,\n\t\t\tCASE WHEN NULLIF(TRIM(COALESCE(p.product_notes, '')), '') IS NOT NULL THEN 1 ELSE 0 END AS has_product_details,\n\t\t\tm.name AS manufacturer_name,";
  if (!server.includes(a)) throw new Error('Could not patch has_product_details.');
  server = server.replace(a,b);
}

if (!page.includes('let lastFailedProductIds = $state([]);')) {
  const a = "\tlet backfillIssues = $state([]);";
  if (!page.includes(a)) throw new Error('Could not find backfillIssues state.');
  page = page.replace(a, a + "\n\tlet lastFailedProductIds = $state([]);");
}

const runFn = Buffer.from('XHRhc3luYyBmdW5jdGlvbiBydW5Ub3Bwc0JhY2tmaWxsKHRhcmdldHMsIGxhYmVsID0gJ1RvcHBzIGJhY2tmaWxsJykgewpcdFx0aWYgKCF0YXJnZXRzLmxlbmd0aCkgewpcdFx0XHRtZXNzYWdlID0gJ05vIFRvcHBzIHByb2R1Y3RzIG5lZWQgdGhpcyBiYWNrZmlsbC4nOwpcdFx0XHRyZXR1cm47Clx0XHR9CgpcdFx0YmFja2ZpbGxCdXN5ID0gdHJ1ZTsKXHRcdG1lc3NhZ2UgPSAnJzsKXHRcdGJhY2tmaWxsSXNzdWVzID0gW107Clx0XHRsYXN0RmFpbGVkUHJvZHVjdElkcyA9IFtdOwpcdFx0YmFja2ZpbGxQcm9ncmVzcyA9IHsgdG90YWw6IHRhcmdldHMubGVuZ3RoLCBwcm9jZXNzZWQ6IDAsIGhhcnZlc3RlZDogMCwgY2FjaGVkOiAwLCB1bm1hdGNoZWQ6IDAsIGZhaWxlZDogMCB9OwoKXHRcdHRyeSB7Clx0XHRcdGZvciAobGV0IG9mZnNldCA9IDA7IG9mZnNldCA8IHRhcmdldHMubGVuZ3RoOyBvZmZzZXQgKz0gOCkgewpcdFx0XHRcdGNvbnN0IGJhdGNoID0gdGFyZ2V0cy5zbGljZShvZmZzZXQsIG9mZnNldCArIDgpOwpcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJy9hcGkvYWRtaW4vdG9wcHMtbGF1bmNoLWJhY2tmaWxsJywgewpcdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsClx0XHRcdFx0XHRoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSwKXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZTogJ2JhY2tmaWxsJywgcHJvZHVjdElkczogYmF0Y2gubWFwKChwcm9kdWN0KSA9PiBwcm9kdWN0LmlkKSB9KQpcdFx0XHRcdH0pOwpcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTsKXHRcdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7Clx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSB0eXBlb2YgcmVzdWx0Py5tZXNzYWdlID09PSAnc3RyaW5nJyA/IHJlc3VsdC5tZXNzYWdlIDogSlNPTi5zdHJpbmdpZnkocmVzdWx0Py5tZXNzYWdlIHx8IHJlc3VsdCB8fCAnVG9wcHMgbWV0YWRhdGEgYmF0Y2ggZmFpbGVkLicpOwpcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGRldGFpbCk7Clx0XHRcdFx0fQoKXHRcdFx0XHRmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucmVzdWx0cyB8fCBbXSkgewpcdFx0XHRcdFx0Y29uc3QgcHJvZHVjdCA9IHByb2R1Y3RzLmZpbmQoKGl0ZW0pID0+IE51bWJlcihpdGVtLmlkKSA9PT0gTnVtYmVyKHJvdy5wcm9kdWN0SWQpKTsKXHRcdFx0XHRcdGlmIChyb3cuc3RhdHVzID09PSAnaGFydmVzdGVkJykgewpcdFx0XHRcdFx0XHRiYWNrZmlsbFByb2dyZXNzLmhhcnZlc3RlZCArPSAxOwpcdFx0XHRcdFx0XHRpZiAocHJvZHVjdCkgcHJvZHVjdC5oYXNfdG9wcHNfYmFja2ZpbGwgPSAxOwpcdFx0XHRcdFx0fSBlbHNlIGlmIChyb3cuc3RhdHVzID09PSAnY2FjaGVkJykgewpcdFx0XHRcdFx0XHRiYWNrZmlsbFByb2dyZXNzLmNhY2hlZCArPSAxOwpcdFx0XHRcdFx0XHRpZiAocHJvZHVjdCkgcHJvZHVjdC5oYXNfdG9wcHNfYmFja2ZpbGwgPSAxOwpcdFx0XHRcdFx0fSBlbHNlIGlmIChyb3cuc3RhdHVzID09PSAndW5tYXRjaGVkJykgewpcdFx0XHRcdFx0XHRiYWNrZmlsbFByb2dyZXNzLnVubWF0Y2hlZCArPSAxOwpcdFx0XHRcdFx0XHRiYWNrZmlsbElzc3Vlcy5wdXNoKHsgcHJvZHVjdElkOiByb3cucHJvZHVjdElkLCBwcm9kdWN0OiBwcm9kdWN0Py5uYW1lIHx8IGBQcm9kdWN0ICR7cm93LnByb2R1Y3RJZH1gLCBzdGF0dXM6ICdVbm1hdGNoZWQnLCByZWFzb246IHJvdy5yZWFzb24gfHwgJ05vIHNhZmUgbGF1bmNoIG1hdGNoLicsIGNhbmRpZGF0ZTogcm93LmNhbmRpZGF0ZSB8fCBudWxsIH0pOwpcdFx0XHRcdFx0fSBlbHNlIGlmIChyb3cuc3RhdHVzID09PSAnZmFpbGVkJykgewpcdFx0XHRcdFx0XHRiYWNrZmlsbFByb2dyZXNzLmZhaWxlZCArPSAxOwpcdFx0XHRcdFx0XHRsYXN0RmFpbGVkUHJvZHVjdElkcyA9IFsuLi5sYXN0RmFpbGVkUHJvZHVjdElkcywgTnVtYmVyKHJvdy5wcm9kdWN0SWQpXTsKXHRcdFx0XHRcdFx0YmFja2ZpbGxJc3N1ZXMucHVzaCh7IHByb2R1Y3RJZDogcm93LnByb2R1Y3RJZCwgcHJvZHVjdDogcHJvZHVjdD8ubmFtZSB8fCBgUHJvZHVjdCAke3Jvdy5wcm9kdWN0SWR9YCwgc3RhdHVzOiAnRmFpbGVkJywgcmVhc29uOiByb3cucmVhc29uIHx8ICdMYXVuY2ggZGV0YWlsIGZhaWxlZC4nLCBjYW5kaWRhdGU6IHJvdy5jYW5kaWRhdGUgfHwgbnVsbCB9KTsKXHRcdFx0XHRcdH0KXHRcdFx0XHR9Clx0XHRcdFx0cHJvZHVjdHMgPSBbLi4ucHJvZHVjdHNdOwpcdFx0XHRcdGJhY2tmaWxsSXNzdWVzID0gWy4uLmJhY2tmaWxsSXNzdWVzXTsKXHRcdFx0XHRiYWNrZmlsbFByb2dyZXNzLnByb2Nlc3NlZCArPSBiYXRjaC5sZW5ndGg7Clx0XHRcdFx0YmFja2ZpbGxQcm9ncmVzcyA9IHsgLi4uYmFja2ZpbGxQcm9ncmVzcyB9OwpcdFx0XHR9CgpcdFx0XHRtZXNzYWdlID0gYCR7bGFiZWx9IGNvbXBsZXRlOiAke2JhY2tmaWxsUHJvZ3Jlc3MuaGFydmVzdGVkfSBoYXJ2ZXN0ZWQgwrcgJHtiYWNrZmlsbFByb2dyZXNzLmNhY2hlZH0gYWxyZWFkeSBjYWNoZWQgwrcgJHtiYWNrZmlsbFByb2dyZXNzLnVubWF0Y2hlZH0gdW5tYXRjaGVkIMK3ICR7YmFja2ZpbGxQcm9ncmVzcy5mYWlsZWR9IGZhaWxlZC5gOwpcdFx0fSBjYXRjaCAoZXJyb3IpIHsKXHRcdFx0bWVzc2FnZSA9IGVycm9yPy5tZXNzYWdlIHx8ICdUb3BwcyBlbnJpY2htZW50IGJhY2tmaWxsIGZhaWxlZC4nOwpcdFx0fSBmaW5hbGx5IHsKXHRcdFx0YmFja2ZpbGxCdXN5ID0gZmFsc2U7Clx0XHR9Clx0fQ==', 'base64').toString('utf8');
page = replaceFunction(page, 'backfillToppsVisible', runFn + `

	async function backfillToppsVisible() {
		const targets = visible.filter((product) => String(product.manufacturer_name || '').toLowerCase() === 'topps' && !product.has_topps_backfill);
		if (!targets.length) { message = 'All visible Topps products with available backfill are already cached.'; return; }
		if (!confirm('Backfill Topps enrichment metadata for ' + targets.length + ' visible product' + (targets.length === 1 ? '' : 's') + '?\n\nThis harvests and caches metadata only. It does not overwrite product details.')) return;
		await runToppsBackfill(targets, 'Topps backfill');
	}

	async function retryFailedTopps() {
		const failedIds = new Set(lastFailedProductIds.map(Number));
		const targets = products.filter((product) => failedIds.has(Number(product.id)));
		if (!targets.length) { message = 'There are no failed Topps backfill products to retry.'; return; }
		await runToppsBackfill(targets, 'Topps failed retry');
	}`);

if (!page.includes('enrichmentProduct.has_product_details = 1;')) {
  const a = "\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];";
  const b = "\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tenrichmentProduct.has_product_details = 1;\n\t\tproducts = [...products];";
  if (!page.includes(a)) throw new Error('Could not patch enrichmentApplied().');
  page = page.replace(a,b);
}

if (!page.includes('ENRICHED ✓')) {
  const a = `						{/if}
					</div>

					<div class="details">`;
  const b = `						{/if}
						{#if product.has_product_details}
							<span class="status enriched">ENRICHED ✓</span>
						{/if}
					</div>

					<div class="details">`;
  if (!page.includes(a)) throw new Error('Could not find status badge area.');
  page = page.replace(a,b);
}

if (!page.includes("product.has_product_details ? 'Review enrichment'")) {
  const variants = [
    '<button class="edit topps-enrich" type="button" onclick={() => enrichmentProduct = product}>Enrich with Topps</button>',
    '<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich with Topps</button>',
    '<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich details</button>'
  ];
  const replacement = '<button class="edit topps-enrich" type="button" onclick={() => enrichmentProduct = product}>{product.has_product_details ? 'Review enrichment' : (product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details')}</button>';
  let found = false;
  for (const v of variants) if (page.includes(v)) { page = page.replace(v,replacement); found = true; break; }
  if (!found) throw new Error('Could not find enrichment button.');
}

if (!page.includes('onclick={retryFailedTopps}')) {
  const a = "\t\t</button>\n\t</div>\n\n\t{#if backfillProgress}";
  const b = "\t\t</button>\n\t\t{#if lastFailedProductIds.length}\n\t\t\t<button class=\"retry-failed\" type=\"button\" onclick={retryFailedTopps} disabled={backfillBusy}>Retry {lastFailedProductIds.length} failed only</button>\n\t\t{/if}\n\t</div>\n\n\t{#if backfillProgress}";
  if (!page.includes(a)) throw new Error('Could not find retry button insertion point.');
  page = page.replace(a,b);
}

if (!page.includes('.status.enriched')) {
  const a = "\t.status.live{background:#edf7f1;color:#25734d}";
  if (!page.includes(a)) throw new Error('Could not find status style.');
  page = page.replace(a, a + "\n\t.status.enriched{background:#eef4ff;color:#234f8f;border:1px solid #c9d8ef}");
}

fs.writeFileSync(serverPath, server);
fs.writeFileSync(pagePath, page);
console.log('Repair installed. Run npm run check && npm run build.');
