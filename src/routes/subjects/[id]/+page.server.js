import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params, locals }) {
	const database = db(platform);
	const subjectId = Number(params.id);

	if (!Number.isInteger(subjectId) || subjectId <= 0) throw error(404, 'Subject not found');

	const subject = await database.prepare(`
		SELECT id, name, subject_type
		FROM subjects
		WHERE id = ?
	`).bind(subjectId).first();

	if (!subject) throw error(404, 'Subject not found');

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
			c.variation,
			p.slug,
			p.year,
			p.name AS product_name,
			p.image_key,
			m.name AS manufacturer_name,
			s.name AS sport_name,
			cl.name AS checklist_name,
			a.id AS affiliation_id,
			COALESCE(a.name, 'NIL') AS affiliation_name
			${collectionSelect}
		FROM cards c
		JOIN products p ON p.id = c.product_id
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		JOIN checklists cl ON cl.id = c.checklist_id
		LEFT JOIN affiliations a ON a.id = c.affiliation_id
		${collectionJoin}
		WHERE c.subject_id = ?
		  AND p.published = 1
		ORDER BY p.year DESC, p.name, cl.sort_order, c.sort_key
		LIMIT 5000
	`).bind(subjectId).all();

	const cards = result.results || [];

	return {
		subject,
		cards,
		stats: {
			cards: cards.length,
			sets: new Set(cards.map((card) => card.slug)).size,
			teams: new Set(cards.map((card) => card.affiliation_name)).size,
			owned: cards.filter((card) => card.collection_status === 'owned').length,
			wanted: cards.filter((card) => card.collection_status === 'wanted').length
		}
	};
}
