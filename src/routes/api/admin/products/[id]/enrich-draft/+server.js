import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { discoverChecklistInsiderUrls, allowedArticleUrl } from '$lib/server/source-harvester.js';
import { parseChecklistInsiderEnrichment } from '$lib/server/checklist-insider-enrichment.js';

function normalize(value = '') {
	return String(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/^\s*\d{4}(?:-\d{2})?\s+/, '')
		.replace(/\b(checklist|guide|details|cards?|trading cards?)\b/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function candidateScore(productName, candidateName) {
	const a = normalize(productName);
	const b = normalize(candidateName);
	if (!a || !b) return 0;
	if (a === b) return 100;
	if (a.includes(b) || b.includes(a)) return 90;
	const aTokens = new Set(a.split(' ').filter(Boolean));
	const bTokens = new Set(b.split(' ').filter(Boolean));
	let shared = 0;
	for (const token of aTokens) if (bTokens.has(token)) shared += 1;
	const union = new Set([...aTokens, ...bTokens]).size || 1;
	return Math.round((shared / union) * 80);
}

async function cachedSourcePage(database, product, sourceUrl) {
	try {
		const rows = await database.prepare(`
			SELECT page_url, entry_json
			FROM source_harvester_cache
			WHERE source = 'checklistinsider'
			  AND (year = ? OR year IS NULL)
		`).bind(Number(product.year)).all();
		let best = null;
		for (const row of rows.results || []) {
			let entry;
			try { entry = JSON.parse(row.entry_json || '{}'); } catch { continue; }
			if (sourceUrl && entry.checklistUrl === sourceUrl) return entry.pageUrl || row.page_url;
			const score = candidateScore(product.name, entry.name || entry.title || '');
			if (!best || score > best.score) best = { score, url: entry.pageUrl || row.page_url };
		}
		return best?.score >= 65 ? best.url : null;
	} catch {
		return null;
	}
}

async function discoverSourcePage(fetch, product) {
	const discovery = await discoverChecklistInsiderUrls(fetch, 20, String(product.year));
	let best = null;
	for (const item of discovery.urls || []) {
		const score = candidateScore(product.name, item.title || item.url || '');
		if (!best || score > best.score) best = { score, url: item.url };
	}
	return best?.score >= 65 ? best.url : null;
}

export async function GET({ platform, params, fetch }) {
	const database = db(platform);
	const productId = Number(params.id);
	if (!Number.isInteger(productId) || productId <= 0) return json({ message: 'Invalid product.' }, { status: 400 });

	const product = await database.prepare(`
		SELECT p.id, p.slug, p.year, p.name, p.release_date, p.product_notes, s.source_url
		FROM products p
		LEFT JOIN sources s ON s.id = p.primary_source_id
		WHERE p.id = ?
	`).bind(productId).first();
	if (!product) return json({ message: 'Product not found.' }, { status: 404 });

	let pageUrl = await cachedSourcePage(database, product, product.source_url || '');
	if (!pageUrl) {
		try { pageUrl = await discoverSourcePage(fetch, product); }
		catch (error) { return json({ message: error?.message || 'Could not locate a product details page.' }, { status: 502 }); }
	}

	const allowed = allowedArticleUrl(pageUrl);
	if (!allowed) return json({ message: 'No enrichment source page could be matched to this product.' }, { status: 404 });

	try {
		const response = await fetch(allowed.href, {
			headers: {
				accept: 'text/html,application/xhtml+xml',
				'accept-language': 'en-US,en;q=0.9',
				'user-agent': 'Mozilla/5.0 Setbound/1.0'
			}
		});
		if (!response.ok) return json({ message: `Product details source returned HTTP ${response.status}.` }, { status: 502 });
		const html = await response.text();
		const enrichment = parseChecklistInsiderEnrichment(html, allowed.href, product.name);
		return json({ ok: true, enrichment });
	} catch (error) {
		return json({ message: error?.message || 'Could not build enrichment draft.' }, { status: 502 });
	}
}
