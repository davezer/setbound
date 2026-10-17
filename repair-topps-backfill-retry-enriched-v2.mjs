import fs from 'node:fs';

const pagePath = 'src/routes/admin/sets/+page.svelte';
const serverPath = 'src/routes/admin/sets/+page.server.js';

for (const p of [pagePath, serverPath]) {
	if (!fs.existsSync(p)) throw new Error(`Could not find ${p}`);
}

function replaceFunction(source, name, replacement) {
	const marker = `\tasync function ${name}(`;
	const start = source.indexOf(marker);
	if (start < 0) throw new Error(`Could not find ${name}()`);
	const open = source.indexOf('{', start);
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		if (quote) {
			if (escaped) { escaped = false; continue; }
			if (ch === '\\') { escaped = true; continue; }
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(0, start) + replacement + source.slice(i + 1);
		}
	}
	throw new Error(`Could not find end of ${name}()`);
}

let page = fs.readFileSync(pagePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

// The first installer may already have applied this. Only add it if absent.
if (!server.includes('has_product_details')) {
	const oldText = "\t\t\tp.published,\n\t\t\tm.name AS manufacturer_name,";
	const newText = "\t\t\tp.published,\n\t\t\tCASE WHEN NULLIF(TRIM(COALESCE(p.product_notes, '')), '') IS NOT NULL THEN 1 ELSE 0 END AS has_product_details,\n\t\t\tm.name AS manufacturer_name,";
	if (!server.includes(oldText)) throw new Error('Could not add has_product_details to Manage Sets query.');
	server = server.replace(oldText, newText);
}

if (!page.includes('let lastFailedProductIds = $state([]);')) {
	const needle = "\tlet backfillIssues = $state([]);";
	if (!page.includes(needle)) throw new Error('Could not find backfillIssues state.');
	page = page.replace(needle, needle + "\n\tlet lastFailedProductIds = $state([]);");
}

const runToppsBackfill = Buffer.from('XHRhc3luYyBmdW5jdGlvbiBydW5Ub3Bwc0JhY2tmaWxsKHRhcmdldHMsIGxhYmVsID0gJ1RvcHBzIGJhY2tmaWxsJykgewpcdFx0aWYgKCF0YXJnZXRzLmxlbmd0aCkgewpcdFx0XHRtZXNzYWdlID0gJ05vIFRvcHBzIHByb2R1Y3RzIG5lZWQgdGhpcyBiYWNrZmlsbC4nOwpcdFx0XHRyZXR1cm47Clx0XHR9CgpcdFx0YmFja2ZpbGxCdXN5ID0gdHJ1ZTsKXHRcdG1lc3NhZ2UgPSAnJzsKXHRcdGJhY2tmaWxsSXNzdWVzID0gW107Clx0XHRsYXN0RmFpbGVkUHJvZHVjdElkcyA9IFtdOwpcdFx0YmFja2ZpbGxQcm9ncmVzcyA9IHsKXHRcdFx0dG90YWw6IHRhcmdldHMubGVuZ3RoLApcdFx0XHRwcm9jZXNzZWQ6IDAsClx0XHRcdGhhcnZlc3RlZDogMCwKXHRcdFx0Y2FjaGVkOiAwLApcdFx0XHR1bm1hdGNoZWQ6IDAsClx0XHRcdGZhaWxlZDogMApcdFx0fTsKClx0XHR0cnkgewpcdFx0XHRmb3IgKGxldCBvZmZzZXQgPSAwOyBvZmZzZXQgPCB0YXJnZXRzLmxlbmd0aDsgb2Zmc2V0ICs9IDgpIHsKXHRcdFx0XHRjb25zdCBiYXRjaCA9IHRhcmdldHMuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyA4KTsKXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCcvYXBpL2FkbWluL3RvcHBzLWxhdW5jaC1iYWNrZmlsbCcsIHsKXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLApcdFx0XHRcdFx0aGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sClx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7Clx0XHRcdFx0XHRcdG1vZGU6ICdiYWNrZmlsbCcsClx0XHRcdFx0XHRcdHByb2R1Y3RJZHM6IGJhdGNoLm1hcCgocHJvZHVjdCkgPT4gcHJvZHVjdC5pZCkKXHRcdFx0XHRcdH0pClx0XHRcdFx0fSk7Clx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpOwoKXHRcdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7Clx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSB0eXBlb2YgcmVzdWx0Py5tZXNzYWdlID09PSAnc3RyaW5nJwpcdFx0XHRcdFx0XHQ/IHJlc3VsdC5tZXNzYWdlClx0XHRcdFx0XHRcdDogSlNPTi5zdHJpbmdpZnkocmVzdWx0Py5tZXNzYWdlIHx8IHJlc3VsdCB8fCAnVG9wcHMgbWV0YWRhdGEgYmF0Y2ggZmFpbGVkLicpOwpcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGRldGFpbCk7Clx0XHRcdFx0fQoKXHRcdFx0XHRmb3IgKGNvbnN0IHJvdyBvZiByZXN1bHQucmVzdWx0cyB8fCBbXSkgewpcdFx0XHRcdFx0Y29uc3QgcHJvZHVjdCA9IHByb2R1Y3RzLmZpbmQoKGl0ZW0pID0+IE51bWJlcihpdGVtLmlkKSA9PT0gTnVtYmVyKHJvdy5wcm9kdWN0SWQpKTsKClx0XHRcdFx0XHRpZiAocm93LnN0YXR1cyA9PT0gJ2hhcnZlc3RlZCcpIHsKXHRcdFx0XHRcdFx0YmFja2ZpbGxQcm9ncmVzcy5oYXJ2ZXN0ZWQgKz0gMTsKXHRcdFx0XHRcdFx0aWYgKHByb2R1Y3QpIHByb2R1Y3QuaGFzX3RvcHBzX2JhY2tmaWxsID0gMTsKXHRcdFx0XHRcdH0gZWxzZSBpZiAocm93LnN0YXR1cyA9PT0gJ2NhY2hlZCcpIHsKXHRcdFx0XHRcdFx0YmFja2ZpbGxQcm9ncmVzcy5jYWNoZWQgKz0gMTsKXHRcdFx0XHRcdFx0aWYgKHByb2R1Y3QpIHByb2R1Y3QuaGFzX3RvcHBzX2JhY2tmaWxsID0gMTsKXHRcdFx0XHRcdH0gZWxzZSBpZiAocm93LnN0YXR1cyA9PT0gJ3VubWF0Y2hlZCcpIHsKXHRcdFx0XHRcdFx0YmFja2ZpbGxQcm9ncmVzcy51bm1hdGNoZWQgKz0gMTsKXHRcdFx0XHRcdFx0YmFja2ZpbGxJc3N1ZXMucHVzaCh7Clx0XHRcdFx0XHRcdFx0cHJvZHVjdElkOiByb3cucHJvZHVjdElkLApcdFx0XHRcdFx0XHRcdHByb2R1Y3Q6IHByb2R1Y3Q/Lm5hbWUgfHwgYFByb2R1Y3QgJHtyb3cucHJvZHVjdElkfWAsClx0XHRcdFx0XHRcdFx0c3RhdHVzOiAnVW5tYXRjaGVkJywKXHRcdFx0XHRcdFx0XHRyZWFzb246IHJvdy5yZWFzb24gfHwgJ05vIHNhZmUgbGF1bmNoIG1hdGNoLicsClx0XHRcdFx0XHRcdFx0Y2FuZGlkYXRlOiByb3cuY2FuZGlkYXRlIHx8IG51bGwKXHRcdFx0XHRcdFx0fSk7Clx0XHRcdFx0XHR9IGVsc2UgaWYgKHJvdy5zdGF0dXMgPT09ICdmYWlsZWQnKSB7Clx0XHRcdFx0XHRcdGJhY2tmaWxsUHJvZ3Jlc3MuZmFpbGVkICs9IDE7Clx0XHRcdFx0XHRcdGxhc3RGYWlsZWRQcm9kdWN0SWRzID0gWy4uLmxhc3RGYWlsZWRQcm9kdWN0SWRzLCBOdW1iZXIocm93LnByb2R1Y3RJZCldOwpcdFx0XHRcdFx0XHRiYWNrZmlsbElzc3Vlcy5wdXNoKHsKXHRcdFx0XHRcdFx0XHRwcm9kdWN0SWQ6IHJvdy5wcm9kdWN0SWQsClx0XHRcdFx0XHRcdFx0cHJvZHVjdDogcHJvZHVjdD8ubmFtZSB8fCBgUHJvZHVjdCAke3Jvdy5wcm9kdWN0SWR9YCwKXHRcdFx0XHRcdFx0XHRzdGF0dXM6ICdGYWlsZWQnLApcdFx0XHRcdFx0XHRcdHJlYXNvbjogcm93LnJlYXNvbiB8fCAnTGF1bmNoIGRldGFpbCBmYWlsZWQuJywKXHRcdFx0XHRcdFx0XHRjYW5kaWRhdGU6IHJvdy5jYW5kaWRhdGUgfHwgbnVsbApcdFx0XHRcdFx0XHR9KTsKXHRcdFx0XHRcdH0KXHRcdFx0XHR9CgpcdFx0XHRcdHByb2R1Y3RzID0gWy4uLnByb2R1Y3RzXTsKXHRcdFx0XHRiYWNrZmlsbElzc3VlcyA9IFsuLi5iYWNrZmlsbElzc3Vlc107Clx0XHRcdFx0YmFja2ZpbGxQcm9ncmVzcy5wcm9jZXNzZWQgKz0gYmF0Y2gubGVuZ3RoOwpcdFx0XHRcdGJhY2tmaWxsUHJvZ3Jlc3MgPSB7IC4uLmJhY2tmaWxsUHJvZ3Jlc3MgfTsKXHRcdFx0fQoKXHRcdFx0bWVzc2FnZSA9IGAke2xhYmVsfSBjb21wbGV0ZTogJHtiYWNrZmlsbFByb2dyZXNzLmhhcnZlc3RlZH0gaGFydmVzdGVkIMK3ICR7YmFja2ZpbGxQcm9ncmVzcy5jYWNoZWR9IGFscmVhZHkgY2FjaGVkIMK3ICR7YmFja2ZpbGxQcm9ncmVzcy51bm1hdGNoZWR9IHVubWF0Y2hlZCDCtyAke2JhY2tmaWxsUHJvZ3Jlc3MuZmFpbGVkfSBmYWlsZWQuYDsKXHRcdH0gY2F0Y2ggKGVycm9yKSB7Clx0XHRcdG1lc3NhZ2UgPSBlcnJvcj8ubWVzc2FnZSB8fCAnVG9wcHMgZW5yaWNobWVudCBiYWNrZmlsbCBmYWlsZWQuJzsKXHRcdH0gZmluYWxseSB7Clx0XHRcdGJhY2tmaWxsQnVzeSA9IGZhbHNlOwpcdFx0fQpcdH0=', 'base64').toString('utf8');

// Replace only backfillToppsVisible; insert helpers ahead of it.
const visibleReplacement = runToppsBackfill + `

	async function backfillToppsVisible() {
		const targets = visible.filter(
			(product) =>
				String(product.manufacturer_name || '').toLowerCase() === 'topps' &&
				!product.has_topps_backfill
		);

		if (!targets.length) {
			message = 'All visible Topps products with available backfill are already cached.';
			return;
		}

		if (!confirm(
			'Backfill Topps enrichment metadata for ' + targets.length +
			' visible product' + (targets.length === 1 ? '' : 's') +
			'?\\n\\nThis harvests and caches metadata only. It does not overwrite product details.'
		)) return;

		await runToppsBackfill(targets, 'Topps backfill');
	}

	async function retryFailedTopps() {
		const failedIds = new Set(lastFailedProductIds.map(Number));
		const targets = products.filter((product) => failedIds.has(Number(product.id)));
		if (!targets.length) {
			message = 'There are no failed Topps backfill products to retry.';
			return;
		}
		await runToppsBackfill(targets, 'Topps failed retry');
	}`;

page = replaceFunction(page, 'backfillToppsVisible', visibleReplacement);

if (!page.includes('enrichmentProduct.has_product_details = 1;')) {
	const oldText = "\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tproducts = [...products];";
	const newText = "\t\tif (payload.result?.imageKey) enrichmentProduct.image_key = payload.result.imageKey;\n\t\tenrichmentProduct.has_product_details = 1;\n\t\tproducts = [...products];";
	if (!page.includes(oldText)) throw new Error('Could not patch enrichmentApplied().');
	page = page.replace(oldText, newText);
}

if (!page.includes('ENRICHED ✓')) {
	const oldText = `						{/if}
					</div>

					<div class="details">`;
	const newText = `						{/if}
						{#if product.has_product_details}
							<span class="status enriched">ENRICHED ✓</span>
						{/if}
					</div>

					<div class="details">`;
	if (!page.includes(oldText)) throw new Error('Could not add Enriched badge.');
	page = page.replace(oldText, newText);
}

if (!page.includes("product.has_product_details ? 'Review enrichment'")) {
	const candidates = [
		'<button class="edit topps-enrich" type="button" onclick={() => enrichmentProduct = product}>Enrich with Topps</button>',
		'<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich with Topps</button>',
		'<button class="edit" type="button" onclick={() => enrichmentProduct = product}>Enrich details</button>'
	];
	const replacement = `<button class="edit topps-enrich" type="button" onclick={() => enrichmentProduct = product}>{product.has_product_details ? 'Review enrichment' : (product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details')}</button>`;
	let changed = false;
	for (const candidate of candidates) {
		if (page.includes(candidate)) { page = page.replace(candidate, replacement); changed = true; break; }
	}
	if (!changed) throw new Error('Could not replace enrichment button.');
}

if (!page.includes('onclick={retryFailedTopps}')) {
	const oldText = `		</button>
	</div>

	{#if backfillProgress}`;
	const newText = `		</button>
		{#if lastFailedProductIds.length}
			<button class="retry-failed" type="button" onclick={retryFailedTopps} disabled={backfillBusy}>Retry {lastFailedProductIds.length} failed only</button>
		{/if}
	</div>

	{#if backfillProgress}`;
	if (!page.includes(oldText)) throw new Error('Could not add failed-only retry button.');
	page = page.replace(oldText, newText);
}

if (!page.includes('.status.enriched')) {
	const needle = "\t.status.live{background:#edf7f1;color:#25734d}";
	if (!page.includes(needle)) throw new Error('Could not add Enriched badge style.');
	page = page.replace(needle, needle + "\n\t.status.enriched{background:#eef4ff;color:#234f8f;border:1px solid #c9d8ef}");
}

if (!page.includes('.retry-failed{')) {
	const styleTag = page.lastIndexOf('</style>');
	if (styleTag < 0) throw new Error('Could not find style block.');
	page = page.slice(0, styleTag) + "\n\t.retry-failed{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .7rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}\n" + page.slice(styleTag);
}

fs.writeFileSync(serverPath, server);
fs.writeFileSync(pagePath, page);
console.log('Topps retry + Enriched notifier installed successfully.');
console.log('Run npm run check && npm run build.');
