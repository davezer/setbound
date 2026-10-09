import { db } from '$lib/server/db';

export async function load({ platform }) {
	try {
		const database = db(platform);

		const recent = await database.prepare(`
			SELECT
				p.slug,
				p.year,
				p.name,
				p.image_key,
				m.name AS manufacturer_name,
				s.name AS sport_name,
				COUNT(DISTINCT c.id) AS card_count,
				COUNT(DISTINCT cl.id) AS checklist_count
			FROM products p
			JOIN manufacturers m ON m.id = p.manufacturer_id
			JOIN sports s ON s.id = p.sport_id
			LEFT JOIN checklists cl ON cl.product_id = p.id
			LEFT JOIN cards c ON c.product_id = p.id
			WHERE p.published = 1
			GROUP BY p.id
			ORDER BY p.created_at DESC, p.year DESC, p.name
			LIMIT 6
		`).all();

		return {
			recent: recent.results || [],
			demo: false
		};
	} catch {
		return {
			recent: [],
			demo: true
		};
	}
}
