import { db } from '$lib/server/db';
import { SITE_URL } from '$lib/seo.js';

function xmlEscape(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod = null) {
	return [
		'<url>',
		`<loc>${xmlEscape(loc)}</loc>`,
		lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
		'</url>'
	].filter(Boolean).join('');
}

export async function GET({ platform }) {
	const database = db(platform);

	const [products, subjects, affiliations] = await Promise.all([
		database.prepare(`
			SELECT p.slug, COALESCE(src.imported_at, '') AS imported_at
			FROM products p
			LEFT JOIN sources src ON src.id = p.primary_source_id
			WHERE p.published = 1
			ORDER BY p.year DESC, p.name
		`).all(),

		database.prepare(`
			SELECT sub.id, COUNT(c.id) AS card_count
			FROM subjects sub
			JOIN cards c ON c.subject_id = sub.id
			JOIN products p ON p.id = c.product_id AND p.published = 1
			GROUP BY sub.id
			HAVING COUNT(c.id) >= 2
		`).all(),

		database.prepare(`
			SELECT a.id, COUNT(c.id) AS card_count
			FROM affiliations a
			JOIN cards c ON c.affiliation_id = a.id
			JOIN products p ON p.id = c.product_id AND p.published = 1
			GROUP BY a.id
			HAVING COUNT(c.id) >= 2
		`).all()
	]);

	const entries = [
		urlEntry(`${SITE_URL}/`),
		urlEntry(`${SITE_URL}/sets`),
		...(products.results || []).map((product) => {
			const lastmod = product.imported_at ? String(product.imported_at).slice(0, 10) : null;
			return urlEntry(`${SITE_URL}/sets/${product.slug}`, lastmod);
		}),
		...(subjects.results || []).map((subject) => urlEntry(`${SITE_URL}/subjects/${subject.id}`)),
		...(affiliations.results || []).map((affiliation) => urlEntry(`${SITE_URL}/teams/${affiliation.id}`))
	];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;

	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
}
