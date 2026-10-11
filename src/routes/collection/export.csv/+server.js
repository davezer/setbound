import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function GET({ locals, platform }) {
	if (!locals.user) throw redirect(303, '/auth/login?next=/collection');

	const database = db(platform);

	const result = await database.prepare(`
		SELECT
			uc.status,
			p.year,
			m.name AS manufacturer,
			p.name AS product,
			cl.name AS checklist,
			c.card_number,
			sub.name AS subject,
			COALESCE(a.name, 'NIL') AS affiliation,
			c.rookie,
			c.autograph,
			c.memorabilia,
			c.serial_number
		FROM collection_cards uc
		JOIN cards c ON c.id = uc.card_id
		JOIN products p ON p.id = c.product_id
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN checklists cl ON cl.id = c.checklist_id
		JOIN subjects sub ON sub.id = c.subject_id
		LEFT JOIN affiliations a ON a.id = c.affiliation_id
		WHERE uc.user_id = ?
		ORDER BY uc.status, p.year DESC, p.name, cl.sort_order, c.sort_key
	`).bind(locals.user.id).all();

	const headers = [
		'status','year','manufacturer','product','checklist','card_number',
		'subject','affiliation','rookie','autograph','memorabilia','serial_number'
	];

	const lines = [
		headers.join(','),
		...(result.results || []).map((row) =>
			headers.map((key) => csv(row[key])).join(',')
		)
	];

	return new Response(lines.join('\n'), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="setbound-collection.csv"'
		}
	});
}

function csv(value) {
	const text = value == null ? '' : String(value);
	return `"${text.replace(/"/g, '""')}"`;
}
