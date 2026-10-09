import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function DELETE({ platform, params }) {
	const database = db(platform);
	const id = Number(params.id);

	if (!Number.isInteger(id) || id <= 0) {
		return json({ message: 'Invalid checklist id.' }, { status: 400 });
	}

	const checklist = await database.prepare(`
		SELECT
			cl.id,
			cl.name,
			cl.product_id,
			COUNT(c.id) AS card_count
		FROM checklists cl
		LEFT JOIN cards c ON c.checklist_id = cl.id
		WHERE cl.id = ?
		GROUP BY cl.id
	`).bind(id).first();

	if (!checklist) {
		return json({ message: 'Checklist not found.' }, { status: 404 });
	}

	await database.batch([
		database.prepare('DELETE FROM cards WHERE checklist_id = ?').bind(id),
		database.prepare('DELETE FROM checklist_details WHERE checklist_id = ?').bind(id),
		database.prepare('DELETE FROM checklists WHERE id = ?').bind(id)
	]);

	return json({
		ok: true,
		deleted: {
			id: checklist.id,
			name: checklist.name,
			cardCount: Number(checklist.card_count || 0)
		}
	});
}
