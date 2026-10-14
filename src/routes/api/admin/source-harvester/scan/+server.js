import { json } from '@sveltejs/kit';
import {
	allowedArticleUrl,
	parseChecklistInsiderPage
} from '$lib/server/source-harvester.js';

export async function GET({ url, fetch }) {
	const pageUrl = allowedArticleUrl(url.searchParams.get('url'));

	if (!pageUrl) {
		return json({ message: 'Only Checklist Insider product pages can be scanned.' }, { status: 400 });
	}

	try {
		const response = await fetch(pageUrl.href, {
			headers: {
				'accept': 'text/html,application/xhtml+xml',
				'accept-language': 'en-US,en;q=0.9',
				'user-agent': 'Mozilla/5.0 Setbound/1.0'
			}
		});

		if (!response.ok) {
			return json({ message: `Checklist Insider returned HTTP ${response.status}.` }, { status: 502 });
		}

		const html = await response.text();
		const parsed = parseChecklistInsiderPage(html, pageUrl.href);

		return json({ ok: true, entry: parsed });
	} catch (error) {
		return json({ message: error?.message || 'Could not scan article.' }, { status: 502 });
	}
}
