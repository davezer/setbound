import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params, locals }) {
	const database = db(platform);
	const affiliationId = Number(params.id);

	if (!Number.isInteger(affiliationId) || affiliationId <= 0) throw error(404, 'Affiliation not found');

	const affiliation = await database.prepare(`
		SELECT
			a.id,
			a.name,
			a.league,
			a.type,
			s.name AS sport_name
		FROM affiliations a
		LEFT JOIN sports s ON s.id = a.sport_id
		WHERE a.id = ?
	`).bind(affiliationId).first();

	if (!affiliation) throw error(404, 'Affiliation not found');

	const collectionSelect = locals.user
		? ', uc.status AS collection_status'
		: ', NULL AS collection_status';

	const collectionJoin = locals.user
		? `LEFT JOIN collection_cards uc ON uc.card_id = c.id AND uc.user_id = ${Number(locals.user.id)}`
		: '';

	const result = await database.prepare(`
		SELECT
			c.id,
			c.card_number,
			c.rookie,
			c.autograph,
			c.memorabilia,
			c.serial_number,
			sub.id AS subject_id,
			sub.name AS subject_name,
			p.slug,
			p.year,
			p.name AS product_name,
			m.name AS manufacturer_name,
			cl.name AS checklist_name
			${collectionSelect}
		FROM cards c
		JOIN subjects sub ON sub.id = c.subject_id
		JOIN products p ON p.id = c.product_id
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN checklists cl ON cl.id = c.checklist_id
		${collectionJoin}
		WHERE c.affiliation_id = ?
		  AND p.published = 1
		ORDER BY p.year DESC, p.name, sub.name, cl.sort_order, c.sort_key
		LIMIT 5000
	`).bind(affiliationId).all();

	const cards = result.results || [];

	return {
		affiliation,
		cards,
		stats: {
			cards: cards.length,
			sets: new Set(cards.map((card) => card.slug)).size,
			subjects: new Set(cards.map((card) => card.subject_id)).size,
			owned: cards.filter((card) => card.collection_status === 'owned').length
		}
	};
}
