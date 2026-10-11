import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params }) {
	const database = db(platform);
	const handle = String(params.handle || '').trim().toLowerCase();

	const collector = await database.prepare(`
		SELECT id, display_name, public_handle, profile_bio
		FROM users
		WHERE public_handle = ?
		  AND collection_public = 1
	`).bind(handle).first();

	if (!collector) throw error(404, 'Public collection not found');

	const [setsResult, wantedResult] = await Promise.all([
		database.prepare(`
			SELECT
				p.slug,
				p.year,
				p.name,
				p.image_key,
				m.name AS manufacturer_name,
				s.name AS sport_name,
				COUNT(DISTINCT c.id) AS total_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'owned' THEN c.id END) AS owned_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'wanted' THEN c.id END) AS wanted_cards
			FROM products p
			JOIN manufacturers m ON m.id = p.manufacturer_id
			JOIN sports s ON s.id = p.sport_id
			JOIN cards c ON c.product_id = p.id
			LEFT JOIN collection_cards uc
				ON uc.card_id = c.id
				AND uc.user_id = ?
			WHERE p.published = 1
			GROUP BY p.id
			HAVING
				COUNT(DISTINCT CASE WHEN uc.status = 'owned' THEN c.id END) > 0
				OR COUNT(DISTINCT CASE WHEN uc.status = 'wanted' THEN c.id END) > 0
			ORDER BY p.year DESC, p.name
		`).bind(collector.id).all(),

		database.prepare(`
			SELECT
				c.card_number,
				sub.name AS subject_name,
				COALESCE(a.name, 'NIL') AS affiliation_name,
				cl.name AS checklist_name,
				p.slug,
				p.year,
				p.name AS product_name,
				m.name AS manufacturer_name
			FROM collection_cards uc
			JOIN cards c ON c.id = uc.card_id
			JOIN subjects sub ON sub.id = c.subject_id
			LEFT JOIN affiliations a ON a.id = c.affiliation_id
			JOIN checklists cl ON cl.id = c.checklist_id
			JOIN products p ON p.id = c.product_id
			JOIN manufacturers m ON m.id = p.manufacturer_id
			WHERE uc.user_id = ?
			  AND uc.status = 'wanted'
			  AND p.published = 1
			ORDER BY p.year DESC, p.name, cl.sort_order, c.sort_key
			LIMIT 500
		`).bind(collector.id).all()
	]);

	const sets = (setsResult.results || []).map((set) => ({
		...set,
		total_cards: Number(set.total_cards || 0),
		owned_cards: Number(set.owned_cards || 0),
		wanted_cards: Number(set.wanted_cards || 0)
	}));

	return {
		collector,
		sets,
		wanted: wantedResult.results || [],
		totals: {
			owned: sets.reduce((sum, set) => sum + set.owned_cards, 0),
			wanted: sets.reduce((sum, set) => sum + set.wanted_cards, 0),
			sets: sets.length
		}
	};
}
