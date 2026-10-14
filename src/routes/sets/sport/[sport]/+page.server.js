import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params, url }) {
	const database = db(platform);

	const sport = await database.prepare(`
		SELECT
			s.id,
			s.name,
			s.slug
		FROM sports s
		WHERE s.slug = ?
		LIMIT 1
	`).bind(params.sport).first();

	if (!sport) throw error(404, 'Sport not found');

	const result = await database.prepare(`
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
		  AND p.sport_id = ?
		GROUP BY p.id
		ORDER BY p.year DESC, p.name
	`).bind(sport.id).all();

	return {
		sport,
		sets: result.results || [],
		q: url.searchParams.get('q')?.trim() || '',
		requestedYear: url.searchParams.get('year')?.trim() || 'All years',
		requestedBrand: url.searchParams.get('brand')?.trim() || 'All brands'
	};
}
