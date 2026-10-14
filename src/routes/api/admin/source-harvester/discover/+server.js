import { json } from '@sveltejs/kit';
import {
	discoverTopps,
	discoverChecklistInsiderUrls,
	inferYear,
	inferSport,
	inferManufacturer
} from '$lib/server/source-harvester.js';

export async function GET({ url, fetch }) {
	const source = String(url.searchParams.get('source') || '').toLowerCase();

	if (source === 'topps') {
		const result = await discoverTopps(fetch);
		return json({ ok: true, source: 'Topps', ...result });
	}

	if (source === 'checklistinsider') {
		const year = Number(url.searchParams.get('year') || 0);
		const result = await discoverChecklistInsiderUrls(fetch, 20, year ? String(year) : '');

		const filtered = year
			? result.urls.filter((item) => {
					const value = `${item.title} ${item.url}`;
					return inferYear(value) === year || value.includes(String(year));
				})
			: result.urls;

		return json({
			ok: true,
			source: 'Checklist Insider',
			mode: result.mode,
			note: result.note,
			entries: filtered.map((item) => ({
				pageUrl: item.url,
				name: item.title || '',
				year: inferYear(`${item.title} ${item.url}`),
				sport: inferSport(item.title),
				manufacturer: inferManufacturer(item.title),
				date: item.date || ''
			}))
		});
	}

	return json({ message: 'Unknown source.' }, { status: 400 });
}
