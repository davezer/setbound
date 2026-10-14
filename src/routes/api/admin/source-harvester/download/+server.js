import { error } from '@sveltejs/kit';
import {
	allowedDownloadUrl,
	filenameFromUrl
} from '$lib/server/source-harvester.js';

export async function GET({ url, fetch }) {
	const source = allowedDownloadUrl(url.searchParams.get('url'));

	if (!source) {
		throw error(400, 'This download host is not allowed.');
	}

	const response = await fetch(source.href, {
		headers: {
			'accept': '*/*',
			'user-agent': 'Mozilla/5.0 Setbound/1.0'
		}
	});

	if (!response.ok) {
		throw error(502, `Source download failed with HTTP ${response.status}.`);
	}

	const filename = filenameFromUrl(source.href).replace(/[\r\n"]/g, '').slice(0, 180) || 'download';
	const disposition = url.searchParams.get('download') === '1'
		? `attachment; filename="${filename}"`
		: `inline; filename="${filename}"`;

	return new Response(response.body, {
		headers: {
			'content-type': response.headers.get('content-type') || 'application/octet-stream',
			'content-disposition': disposition,
			'cache-control': 'private, max-age=300'
		}
	});
}
