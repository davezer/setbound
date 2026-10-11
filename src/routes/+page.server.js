import { db } from '$lib/server/db';

export async function load({ platform }) {
	try {
		const database = db(platform);

		const [recent, sports, years] = await Promise.all([
			database.prepare(`
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
				ORDER BY COALESCE(p.release_date, p.created_at) DESC, p.created_at DESC
				LIMIT 6
			`).all(),

			database.prepare(`
				SELECT
					s.name,
					s.slug,
					COUNT(DISTINCT p.id) AS set_count,
					COUNT(DISTINCT c.id) AS card_count
				FROM sports s
				JOIN products p ON p.sport_id = s.id AND p.published = 1
				LEFT JOIN cards c ON c.product_id = p.id
				GROUP BY s.id
				ORDER BY s.sort_order, s.name
			`).all(),

			database.prepare(`
				SELECT p.year, COUNT(*) AS set_count
				FROM products p
				WHERE p.published = 1
				GROUP BY p.year
				ORDER BY p.year DESC
				LIMIT 8
			`).all()
		]);

		return {
			recent: recent.results || [],
			sports: sports.results || [],
			years: years.results || []
		};
	} catch {
		return { recent: [], sports: [], years: [] };
	}
}
