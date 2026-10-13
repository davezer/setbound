import { text } from '@sveltejs/kit';
import { SITE_URL } from '$lib/seo.js';

export function GET() {
	return text(
		[
			'User-agent: *',
			'Allow: /',
			'Disallow: /admin/',
			'Disallow: /account/',
			'Disallow: /auth/',
			'Disallow: /collection/',
			'Disallow: /api/',
			'',
			`Sitemap: ${SITE_URL}/sitemap.xml`,
			''
		].join('\n'),
		{
			headers: {
				'cache-control': 'public, max-age=3600'
			}
		}
	);
}
