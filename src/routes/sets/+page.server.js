import { db } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';

export async function load({ platform, url }) {
	const requestedSport = url.searchParams.get('sport')?.trim();

	// Preserve old /sets?sport=Baseball-style links and send them to
	// the new crawlable category page when possible.
	if (requestedSport && requestedSport !== 'All sports') {
		const database = db(platform);
		const sport = await database.prepare(`
			SELECT slug
			FROM sports
			WHERE lower(name) = lower(?)
			   OR lower(slug) = lower(?)
			LIMIT 1
		`).bind(requestedSport, requestedSport).first();

		if (sport?.slug) {
			throw redirect(308, `/sets/sport/${sport.slug}`);
		}
	}

	const database = db(platform);

	const [categoriesResult, previewResult, latestResult] = await Promise.all([
		database.prepare(`
			SELECT
				s.id,
				s.name,
				s.slug,
				COUNT(DISTINCT p.id) AS set_count,
				MIN(p.year) AS first_year,
				MAX(p.year) AS latest_year,
				COUNT(DISTINCT c.id) AS card_count
			FROM sports s
			JOIN products p
				ON p.sport_id = s.id
			   AND p.published = 1
			LEFT JOIN cards c
				ON c.product_id = p.id
			GROUP BY s.id
			ORDER BY set_count DESC, s.name
		`).all(),

		database.prepare(`
			SELECT
				p.id,
				p.slug,
				p.year,
				p.name,
				p.image_key,
				s.slug AS sport_slug,
				s.name AS sport_name,
				m.name AS manufacturer_name
			FROM products p
			JOIN sports s ON s.id = p.sport_id
			JOIN manufacturers m ON m.id = p.manufacturer_id
			WHERE p.published = 1
			  AND p.image_key IS NOT NULL
			ORDER BY p.year DESC, p.id DESC
		`).all(),

		database.prepare(`
			SELECT
				p.slug,
				p.year,
				p.name,
				p.image_key,
				m.name AS manufacturer_name,
				s.name AS sport_name,
				s.slug AS sport_slug,
				COUNT(DISTINCT c.id) AS card_count,
				COUNT(DISTINCT cl.id) AS checklist_count
			FROM products p
			JOIN manufacturers m ON m.id = p.manufacturer_id
			JOIN sports s ON s.id = p.sport_id
			LEFT JOIN cards c ON c.product_id = p.id
			LEFT JOIN checklists cl ON cl.product_id = p.id
			WHERE p.published = 1
			GROUP BY p.id
			ORDER BY p.year DESC, p.id DESC
			LIMIT 6
		`).all()
	]);

	const previewsBySport = new Map();

	for (const product of previewResult.results || []) {
		if (!previewsBySport.has(product.sport_slug)) {
			previewsBySport.set(product.sport_slug, []);
		}

		const bucket = previewsBySport.get(product.sport_slug);

		if (bucket.length < 3) {
			bucket.push(product);
		}
	}

	const categories = (categoriesResult.results || []).map((category) => ({
		...category,
		set_count: Number(category.set_count || 0),
		card_count: Number(category.card_count || 0),
		first_year: Number(category.first_year || 0),
		latest_year: Number(category.latest_year || 0),
		previews: previewsBySport.get(category.slug) || []
	}));

	return {
		categories,
		latest: latestResult.results || []
	};
}
