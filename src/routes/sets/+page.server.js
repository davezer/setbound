import { db } from '$lib/server/db';

export async function load({ platform, url }) {
	const q = url.searchParams.get('q')?.trim() || '';
	const requestedSport = url.searchParams.get('sport')?.trim() || 'All sports';
	const requestedYear = url.searchParams.get('year')?.trim() || 'All years';
	const requestedBrand = url.searchParams.get('brand')?.trim() || 'All brands';

	try {
		const database = db(platform);

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
			GROUP BY p.id
			ORDER BY p.year DESC, p.name
		`).all();

		return {
			sets: result.results || [],
			q,
			requestedSport,
			requestedYear,
			requestedBrand
		};
	} catch {
		return {
			sets: [],
			q,
			requestedSport,
			requestedYear,
			requestedBrand
		};
	}
}
