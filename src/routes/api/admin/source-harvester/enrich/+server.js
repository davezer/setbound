import { json } from '@sveltejs/kit';
import { allowedArticleUrl } from '$lib/server/source-harvester.js';
import { parseChecklistInsiderEnrichment } from '$lib/server/checklist-insider-enrichment.js';

export async function GET({ url, fetch }) {
	const pageUrl = allowedArticleUrl(url.searchParams.get('url'));
	const requestedName = String(url.searchParams.get('name') || '').trim();
	if (!pageUrl) return json({ message: 'Only Checklist Insider product pages can be enriched.' }, { status: 400 });
	try {
		const response = await fetch(pageUrl.href, { headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 Setbound/1.0' } });
		if (!response.ok) return json({ message: `Checklist Insider returned HTTP ${response.status}.` }, { status: 502 });
		const html = await response.text();
		return json({ ok: true, enrichment: parseChecklistInsiderEnrichment(html, pageUrl.href, requestedName) });
	} catch (error) {
		return json({ message: error?.message || 'Could not enrich this product.' }, { status: 502 });
	}
}
