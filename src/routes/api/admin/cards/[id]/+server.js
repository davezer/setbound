import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function DELETE({ platform, params }) {
	const database = db(platform);
	const id = Number(params.id);

	if (!Number.isInteger(id) || id <= 0) {
		return json({ message: 'Invalid card id.' }, { status: 400 });
	}

	const card = await database.prepare(`
		SELECT c.id, c.product_id, c.checklist_id, c.card_number, sub.name AS subject_name
		FROM cards c
		JOIN subjects sub ON sub.id = c.subject_id
		WHERE c.id = ?
	`).bind(id).first();

	if (!card) {
		return json({ message: 'Card row not found.' }, { status: 404 });
	}

	await database.prepare('DELETE FROM cards WHERE id = ?').bind(id).run();

	return json({
		ok: true,
		deleted: {
			id: card.id,
			cardNumber: card.card_number,
			subject: card.subject_name
		}
	});
}
