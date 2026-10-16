import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	discoverTopps,
	discoverChecklistInsiderUrls,
	inferYear,
	inferSport,
	inferManufacturer
} from '$lib/server/source-harvester.js';

function safeJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export async function GET({ url, fetch, platform }) {
	const source = String(url.searchParams.get('source') || '').toLowerCase();

	if (source === 'topps') {
		const result = await discoverTopps(fetch);
		return json({ ok: true, source: 'Topps', ...result });
	}

	if (source === 'checklistinsider') {
		const database = db(platform);
		const year = Number(url.searchParams.get('year') || 0);
		const result = await discoverChecklistInsiderUrls(fetch, 20, year ? String(year) : '');

		const filtered = year
			? result.urls.filter((item) => {
					const value = `${item.title} ${item.url}`;
					return inferYear(value) === year || value.includes(String(year));
				})
			: result.urls;

		const cachedRows = year
			? await database.prepare(`
					SELECT page_url, entry_json, scanned_at
					FROM source_harvester_cache
					WHERE source = 'checklistinsider'
					  AND year = ?
				`).bind(year).all()
			: await database.prepare(`
					SELECT page_url, entry_json, scanned_at
					FROM source_harvester_cache
					WHERE source = 'checklistinsider'
				`).all();

		const cached = new Map(
			(cachedRows.results || []).map((row) => [
				row.page_url,
				{
					entry: safeJson(row.entry_json),
					scannedAt: row.scanned_at
				}
			])
		);

		let cachedCount = 0;
		let uncachedCount = 0;

		const entries = filtered.map((item) => {
			const hit = cached.get(item.url);

			if (hit?.entry) {
				cachedCount += 1;
				return {
					...hit.entry,
					pageUrl: hit.entry.pageUrl || item.url,
					name: hit.entry.name || item.title || '',
					year: hit.entry.year || inferYear(`${item.title} ${item.url}`),
					sport: hit.entry.sport || inferSport(item.title),
					manufacturer: hit.entry.manufacturer || inferManufacturer(item.title),
					date: hit.entry.date || item.date || '',
					cached: true,
					cachedAt: hit.scannedAt
				};
			}

			uncachedCount += 1;

			return {
				pageUrl: item.url,
				name: item.title || '',
				year: inferYear(`${item.title} ${item.url}`),
				sport: inferSport(item.title),
				manufacturer: inferManufacturer(item.title),
				date: item.date || '',
				cached: false
			};
		});

		return json({
			ok: true,
			source: 'Checklist Insider',
			mode: result.mode,
			note: `${result.note} ${cachedCount} cached · ${uncachedCount} new pages need scanning.`,
			cache: {
				cached: cachedCount,
				uncached: uncachedCount
			},
			entries
		});
	}

	return json({ message: 'Unknown source.' }, { status: 400 });
}
