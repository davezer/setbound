import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ locals, platform }) {
	if (!locals.user) throw redirect(303, '/auth/login?next=/collection');

	const database = db(platform);

	const [setsResult, wantedResult] = await Promise.all([
		database.prepare(`
			SELECT
				p.id,
				p.slug,
				p.year,
				p.name,
				p.image_key,
				m.name AS manufacturer_name,
				s.name AS sport_name,
				COUNT(DISTINCT c.id) AS total_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'owned' THEN c.id END) AS owned_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'wanted' THEN c.id END) AS wanted_cards,
				MAX(uc.updated_at) AS collection_updated_at
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
			ORDER BY collection_updated_at DESC, p.year DESC, p.name
		`).bind(locals.user.id).all(),

		database.prepare(`
			SELECT
				c.id,
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
			ORDER BY p.year DESC, p.name, cl.sort_order, c.sort_key
			LIMIT 1000
		`).bind(locals.user.id).all()
	]);

	const sets = (setsResult.results || []).map((set) => ({
		...set,
		total_cards: Number(set.total_cards || 0),
		owned_cards: Number(set.owned_cards || 0),
		wanted_cards: Number(set.wanted_cards || 0)
	}));

	const totals = sets.reduce(
		(acc, set) => {
			acc.owned += set.owned_cards;
			acc.wanted += set.wanted_cards;
			acc.sets += 1;
			return acc;
		},
		{ owned: 0, wanted: 0, sets: 0 }
	);

	return {
		sets,
		wanted: wantedResult.results || [],
		totals
	};
}
