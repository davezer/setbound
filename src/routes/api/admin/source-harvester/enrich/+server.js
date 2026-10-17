import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	allowedArticleUrl,
	discoverChecklistInsiderUrls
} from '$lib/server/source-harvester.js';
import { parseChecklistInsiderEnrichment } from '$lib/server/checklist-insider-enrichment.js';
import { findCachedToppsMetadata, toppsMetadataToEnrichment } from '$lib/server/topps-product-metadata.js';

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

async function cachedChecklistInsiderPage(database, requestedName, requestedYear, checklistUrl) {
	try {
		const rows = await database.prepare(`
			SELECT page_url, title, entry_json
			FROM source_harvester_cache
			WHERE source = 'checklistinsider'
			  AND (? IS NULL OR year = ? OR year IS NULL)
		`).bind(requestedYear, requestedYear).all();
		let best = null;
		for (const row of rows.results || []) {
			let entry = {};
			try { entry = JSON.parse(row.entry_json || '{}'); } catch {}
			if (checklistUrl && entry.checklistUrl === checklistUrl) return entry.pageUrl || row.page_url;
			const candidateName = entry.name || entry.title || row.title || '';
			const score = candidateScore(requestedName, candidateName);
			if (!best || score > best.score) best = { score, url: entry.pageUrl || row.page_url };
		}
		return best?.score >= 65 ? best.url : null;
	} catch {
		return null;
	}
}

async function discoverChecklistInsiderPage(fetch, requestedName, requestedYear) {
	const discovery = await discoverChecklistInsiderUrls(fetch, 20, requestedYear ? String(requestedYear) : '');
	let best = null;
	for (const item of discovery.urls || []) {
		const score = candidateScore(requestedName, item.title || item.url || '');
		if (!best || score > best.score) best = { score, url: item.url };
	}
	return best?.score >= 65 ? best.url : null;
}

export async function GET({ url, fetch, platform }) {
	const requestedUrl = String(url.searchParams.get('url') || '').trim();
	const requestedName = String(url.searchParams.get('name') || '').trim();
	const requestedYearRaw = Number(url.searchParams.get('year'));
	const requestedYear = Number.isInteger(requestedYearRaw) ? requestedYearRaw : null;
	const checklistUrl = String(url.searchParams.get('checklistUrl') || '').trim();

	const database = db(platform);
	const toppsMetadata = await findCachedToppsMetadata(database, { name: requestedName, year: requestedYear, checklistUrl });
	if (toppsMetadata) return json({ ok: true, enrichment: toppsMetadataToEnrichment(toppsMetadata) });

	let pageUrl = allowedArticleUrl(requestedUrl);

	if (!pageUrl && requestedName) {
		let matchedUrl = await cachedChecklistInsiderPage(database, requestedName, requestedYear, checklistUrl);
		if (!matchedUrl) {
			try { matchedUrl = await discoverChecklistInsiderPage(fetch, requestedName, requestedYear); }
			catch {}
		}
		pageUrl = allowedArticleUrl(matchedUrl);
	}

	if (!pageUrl) {
		return json({ message: 'No matching Checklist Insider product page could be found for this product.' }, { status: 404 });
	}

	try {
		const response = await fetch(pageUrl.href, {
			headers: {
				accept: 'text/html,application/xhtml+xml',
				'accept-language': 'en-US,en;q=0.9',
				'user-agent': 'Mozilla/5.0 Setbound/1.0'
			}
		});
		if (!response.ok) return json({ message: `Checklist Insider returned HTTP ${response.status}.` }, { status: 502 });
		const html = await response.text();
		return json({ ok: true, enrichment: parseChecklistInsiderEnrichment(html, pageUrl.href, requestedName) });
	} catch (error) {
		return json({ message: error?.message || 'Could not enrich this product.' }, { status: 502 });
	}
}
