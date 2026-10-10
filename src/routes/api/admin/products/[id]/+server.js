import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function DELETE({ platform, params }) {
	const database = db(platform);
	const id = Number(params.id);

	if (!Number.isInteger(id) || id <= 0) {
		return json({ message: 'Invalid product id.' }, { status: 400 });
	}

	const product = await database.prepare(`
		SELECT
			p.id,
			p.year,
			p.name,
			p.slug,
			p.primary_source_id,
			p.image_key,
			COUNT(DISTINCT c.id) AS card_count,
			COUNT(DISTINCT cl.id) AS checklist_count
		FROM products p
		LEFT JOIN cards c ON c.product_id = p.id
		LEFT JOIN checklists cl ON cl.product_id = p.id
		WHERE p.id = ?
		GROUP BY p.id
	`).bind(id).first();

	if (!product) {
		return json({ message: 'Import not found.' }, { status: 404 });
	}

	const statements = [
		database.prepare('DELETE FROM products WHERE id = ?').bind(id),
		database.prepare(`
			DELETE FROM subjects
			WHERE NOT EXISTS (
				SELECT 1 FROM cards WHERE cards.subject_id = subjects.id
			)
		`)
	];

	if (product.primary_source_id) {
		statements.push(
			database.prepare(`
				DELETE FROM sources
				WHERE id = ?
				  AND NOT EXISTS (
					SELECT 1 FROM products WHERE primary_source_id = ?
				  )
			`).bind(product.primary_source_id, product.primary_source_id)
		);
	}

	await database.batch(statements);

	if (product.image_key && platform?.env?.SET_IMAGES) {
		try {
			await platform.env.SET_IMAGES.delete(product.image_key);
		} catch {
			// Database deletion succeeded; an orphaned R2 object is harmless.
		}
	}

	return json({
		ok: true,
		deleted: {
			id: product.id,
			slug: product.slug,
			name: product.name,
			year: product.year,
			cardCount: Number(product.card_count || 0),
			checklistCount: Number(product.checklist_count || 0)
		}
	});
}
