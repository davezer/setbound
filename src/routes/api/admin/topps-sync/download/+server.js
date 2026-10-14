import { error } from '@sveltejs/kit';

function allowedUrl(value) {
	let url;
	try { url = new URL(value); }
	catch { return null; }

	if (url.protocol !== 'https:') return null;
	if (url.hostname !== 'cdn.shopify.com') return null;
	return url;
}

function safeFilename(value) {
	try {
		const url = new URL(value);
		const raw = decodeURIComponent(url.pathname.split('/').pop() || 'topps-checklist');
		return raw.replace(/[\r\n"]/g, '').slice(0, 180) || 'topps-checklist';
	} catch {
		return 'topps-checklist';
	}
}

export async function GET({ url, fetch }) {
	const source = allowedUrl(url.searchParams.get('url'));

	if (!source) {
		throw error(400, 'Only official Topps checklist files hosted on cdn.shopify.com are allowed.');
	}

	const response = await fetch(source.href, {
		headers: { 'user-agent': 'Setbound checklist sync/1.0 (+https://setbound.app)' }
	});

	if (!response.ok) {
		throw error(502, `Topps checklist download failed with HTTP ${response.status}.`);
	}

	const contentType = response.headers.get('content-type') || 'application/octet-stream';
	const filename = safeFilename(source.href);
	const disposition = url.searchParams.get('download') === '1'
		? `attachment; filename="${filename}"`
		: `inline; filename="${filename}"`;

	return new Response(response.body, {
		headers: {
			'content-type': contentType,
			'content-disposition': disposition,
			'cache-control': 'private, max-age=300'
		}
	});
}
