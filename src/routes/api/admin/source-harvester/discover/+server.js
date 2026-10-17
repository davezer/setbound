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
		const database = db(platform);

		// Load the saved Topps catalog first. If Topps is flaky later, these
		// discoveries stay available from D1.
		const cachedRows = await database.prepare(`
			SELECT page_url, entry_json, scanned_at
			FROM source_harvester_cache
			WHERE source = 'topps'
			ORDER BY year DESC, title
		`).all();

		const cachedEntries = (cachedRows.results || [])
			.map((row) => ({
				entry: safeJson(row.entry_json),
				scannedAt: row.scanned_at
			}))
			.filter((row) => row.entry?.checklistUrl);

		const cachedMap = new Map(
			cachedEntries.map((row) => [row.entry.checklistUrl, row.entry])
		);

		const result = await discoverTopps(fetch);
		const liveEntries = Array.isArray(result.entries) ? result.entries : [];

		if (liveEntries.length) {
			const statements = liveEntries
				.filter((entry) => entry?.checklistUrl)
				.map((entry) =>
					database.prepare(`
						INSERT INTO source_harvester_cache (
							page_url, source, year, title, entry_json, scanned_at, updated_at
						)
						VALUES (?, 'topps', ?, ?, ?, datetime('now'), datetime('now'))
						ON CONFLICT(page_url) DO UPDATE SET
							source = excluded.source,
							year = excluded.year,
							title = excluded.title,
							entry_json = excluded.entry_json,
							scanned_at = datetime('now'),
							updated_at = datetime('now')
					`).bind(
						entry.checklistUrl,
						entry.year || null,
						entry.name || '',
						JSON.stringify(entry)
					)
				);

			for (let index = 0; index < statements.length; index += 100) {
				await database.batch(statements.slice(index, index + 100));
			}

			const merged = new Map(cachedMap);
			for (const entry of liveEntries) {
				if (entry?.checklistUrl) merged.set(entry.checklistUrl, entry);
			}

			const entries = [...merged.values()].sort((a, b) =>
				Number(b.year || 0) - Number(a.year || 0) ||
				String(a.name || '').localeCompare(String(b.name || ''))
			);

			return json({
				ok: true,
				source: 'Topps',
				...result,
				entries,
				cache: {
					live: liveEntries.length,
					cached: cachedEntries.length,
					total: entries.length
				},
				note: `${result.note} Saved ${liveEntries.length} entries to the Topps cache · ${entries.length} protected total.`
			});
		}

		if (cachedEntries.length) {
			const entries = [...cachedMap.values()].sort((a, b) =>
				Number(b.year || 0) - Number(a.year || 0) ||
				String(a.name || '').localeCompare(String(b.name || ''))
			);

			return json({
				ok: true,
				source: 'Topps',
				entries,
				sourceUrl: result.sourceUrl || null,
				cache: { live: 0, cached: entries.length, total: entries.length },
				note: `Topps archive was unavailable, so Setbound loaded ${entries.length} protected entries from D1 cache. ${result.note || ''}`.trim()
			});
		}

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
