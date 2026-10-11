import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const FORMAT_FIELDS = [
	{ key: 'hobby', label: 'Hobby Box Breakdown', sort: 10 },
	{ key: 'breaker', label: 'Breaker / Breaker Delight Breakdown', sort: 20 },
	{ key: 'blaster', label: 'Blaster / Value Box Breakdown', sort: 30 },
	{ key: 'mega', label: 'Mega Box Breakdown', sort: 40 },
	{ key: 'jumbo', label: 'Jumbo Box Breakdown', sort: 50 },
	{ key: 'retail', label: 'Retail Box Breakdown', sort: 60 },
	{ key: 'fat_pack', label: 'Fat Pack Breakdown', sort: 70 },
	{ key: 'hanger', label: 'Hanger Box Breakdown', sort: 80 },
	{ key: 'collector', label: 'Collector / Tin Breakdown', sort: 90 },
	{ key: 'inserts', label: 'Notable Inserts', sort: 100 }
];

export async function load({ platform, params }) {
	const database = db(platform);

	const product = await database.prepare(`
		SELECT p.*, m.name AS manufacturer_name, s.name AS sport_name
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		WHERE p.id = ?
	`).bind(Number(params.id)).first();

	if (!product) throw error(404, 'Set not found');

	const formatResult = await database.prepare(`
		SELECT format_key, label, details, sort_order
		FROM product_formats
		WHERE product_id = ?
		ORDER BY sort_order, id
	`).bind(product.id).all();

	const saved = new Map((formatResult.results || []).map((row) => [row.format_key, row]));

	return {
		product,
		formats: FORMAT_FIELDS.map((field) => ({
			...field,
			details: saved.get(field.key)?.details || ''
		}))
	};
}

export const actions = {
	default: async ({ platform, params, request }) => {
		const database = db(platform);
		const productId = Number(params.id);
		const form = await request.formData();

		const releaseDate = String(form.get('release_date') || '').trim() || null;
		const notes = String(form.get('product_notes') || '').trim() || null;

		// Native <input type="date"> submits YYYY-MM-DD.
		if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
			return fail(400, { message: 'Release date must be YYYY-MM-DD.' });
		}

		const statements = [
			database.prepare(`
				UPDATE products
				SET release_date = ?, product_notes = ?, updated_at = datetime('now')
				WHERE id = ?
			`).bind(releaseDate, notes, productId)
		];

		for (const field of FORMAT_FIELDS) {
			const details = String(form.get(`format_${field.key}`) || '').trim();

			if (details) {
				statements.push(
					database.prepare(`
						INSERT INTO product_formats (
							product_id, format_key, label, details, sort_order, updated_at
						)
						VALUES (?, ?, ?, ?, ?, datetime('now'))
						ON CONFLICT(product_id, format_key) DO UPDATE SET
							label = excluded.label,
							details = excluded.details,
							sort_order = excluded.sort_order,
							updated_at = datetime('now')
					`).bind(productId, field.key, field.label, details, field.sort)
				);
			} else {
				statements.push(
					database.prepare(`
						DELETE FROM product_formats
						WHERE product_id = ? AND format_key = ?
					`).bind(productId, field.key)
				);
			}
		}

		await database.batch(statements);

		throw redirect(303, `/admin/product/${productId}?saved=1`);
	}
};
