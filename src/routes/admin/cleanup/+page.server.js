import { db } from '$lib/server/db';

export async function load({ platform, url }) {
	const database = db(platform);
	const slug = url.searchParams.get('set') || '';

	const productsResult = await database.prepare(`
		SELECT p.id, p.slug, p.year, p.name, m.name AS manufacturer_name, COUNT(c.id) AS card_count
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		LEFT JOIN cards c ON c.product_id = p.id
		GROUP BY p.id
		ORDER BY p.year DESC, p.name ASC
	`).all();

	const products = productsResult.results || [];
	let product = null;
	let cards = [];
	let checklists = [];

	if (slug) {
		product = await database.prepare(`
			SELECT p.id, p.slug, p.year, p.name, m.name AS manufacturer_name
			FROM products p
			JOIN manufacturers m ON m.id = p.manufacturer_id
			WHERE p.slug = ?
		`).bind(slug).first();

		if (product) {
			const [cardResult, checklistResult] = await Promise.all([
				database.prepare(`
					SELECT
						c.id,
						c.card_number,
						c.rookie,
						c.autograph,
						c.memorabilia,
						c.serial_number,
						c.confidence,
						sub.name AS subject_name,
						COALESCE(a.name, 'NIL') AS affiliation_name,
						cl.id AS checklist_id,
						cl.name AS checklist_name
					FROM cards c
					JOIN subjects sub ON sub.id = c.subject_id
					JOIN checklists cl ON cl.id = c.checklist_id
					LEFT JOIN affiliations a ON a.id = c.affiliation_id
					WHERE c.product_id = ?
					ORDER BY cl.sort_order, c.sort_key, c.card_number, c.id
					LIMIT 10000
				`).bind(product.id).all(),

				database.prepare(`
					SELECT cl.id, cl.name, cl.sort_order, COUNT(c.id) AS card_count
					FROM checklists cl
					LEFT JOIN cards c ON c.checklist_id = cl.id
					WHERE cl.product_id = ?
					GROUP BY cl.id
					ORDER BY cl.sort_order, cl.name
				`).bind(product.id).all()
			]);

			cards = cardResult.results || [];
			checklists = checklistResult.results || [];
		}
	}

	return { products, product, cards, checklists, selectedSlug: slug };
}
