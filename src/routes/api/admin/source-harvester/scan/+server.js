import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	allowedArticleUrl,
	parseChecklistInsiderPage,
	inferYear
} from '$lib/server/source-harvester.js';

function safeJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export async function GET({ url, fetch, platform }) {
	const database = db(platform);
	const pageUrl = allowedArticleUrl(url.searchParams.get('url'));
	const force = url.searchParams.get('force') === '1';

	if (!pageUrl) {
		return json(
			{ message: 'Only Checklist Insider product pages can be scanned.' },
			{ status: 400 }
		);
	}

	try {
		if (!force) {
			const cached = await database.prepare(`
				SELECT entry_json, scanned_at
				FROM source_harvester_cache
				WHERE page_url = ?
				  AND source = 'checklistinsider'
			`).bind(pageUrl.href).first();

			if (cached?.entry_json) {
				const entry = safeJson(cached.entry_json);

				if (entry) {
					return json({
						ok: true,
						entry: {
							...entry,
							cached: true,
							cachedAt: cached.scanned_at
						},
						cached: true
					});
				}
			}
		}

		const response = await fetch(pageUrl.href, {
			headers: {
				accept: 'text/html,application/xhtml+xml',
				'accept-language': 'en-US,en;q=0.9',
				'user-agent': 'Mozilla/5.0 Setbound/1.0'
			}
		});

		if (!response.ok) {
			return json(
				{ message: `Checklist Insider returned HTTP ${response.status}.` },
				{ status: 502 }
			);
		}

		const html = await response.text();
		const parsed = parseChecklistInsiderPage(html, pageUrl.href);
		const year = Number(parsed.year || inferYear(`${parsed.name || ''} ${pageUrl.href}`) || 0);

		await database.prepare(`
			INSERT INTO source_harvester_cache (
				page_url,
				source,
				year,
				title,
				entry_json,
				scanned_at,
				updated_at
			)
			VALUES (?, 'checklistinsider', ?, ?, ?, datetime('now'), datetime('now'))
			ON CONFLICT(page_url) DO UPDATE SET
				year = excluded.year,
				title = excluded.title,
				entry_json = excluded.entry_json,
				scanned_at = datetime('now'),
				updated_at = datetime('now')
		`).bind(
			pageUrl.href,
			year || null,
			parsed.name || '',
			JSON.stringify(parsed)
		).run();

		return json({
			ok: true,
			entry: {
				...parsed,
				cached: false
			},
			cached: false
		});
	} catch (error) {
		return json(
			{ message: error?.message || 'Could not scan article.' },
			{ status: 502 }
		);
	}
}
