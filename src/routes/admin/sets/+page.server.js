import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export async function load({ platform }) {
	const database = db(platform);

	const result = await database.prepare(`
		SELECT
			p.id,
			p.slug,
			p.year,
			p.name,
			p.image_key,
			m.name AS manufacturer_name,
			s.name AS sport_name
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		ORDER BY p.year DESC, p.name
	`).all();

	return { products: result.results || [] };
}

export const actions = {
	upload: async ({ request, platform }) => {
		const database = db(platform);
		const form = await request.formData();
		const productId = Number(form.get('product_id'));
		const file = form.get('image');

		if (!Number.isInteger(productId) || productId <= 0) {
			return fail(400, { message: 'Choose a valid set.' });
		}

		if (!(file instanceof File) || !file.size) {
			return fail(400, { message: 'Choose an image first.' });
		}

		if (!ALLOWED_TYPES.has(file.type)) {
			return fail(400, { message: 'Use a JPG, PNG, WEBP, or AVIF image.' });
		}

		if (file.size > MAX_IMAGE_BYTES) {
			return fail(400, { message: 'Set images must be 5 MB or smaller.' });
		}

		const product = await database
			.prepare('SELECT id, slug, image_key FROM products WHERE id = ?')
			.bind(productId)
			.first();

		if (!product) return fail(404, { message: 'Set not found.' });

		const extension =
			file.type === 'image/jpeg' ? 'jpg' :
			file.type === 'image/png' ? 'png' :
			file.type === 'image/avif' ? 'avif' : 'webp';

		const key = `sets/${product.slug}-${crypto.randomUUID()}.${extension}`;

		await platform.env.SET_IMAGES.put(key, await file.arrayBuffer(), {
			httpMetadata: {
				contentType: file.type,
				cacheControl: 'public, max-age=31536000, immutable'
			}
		});

		await database
			.prepare(`UPDATE products SET image_key = ?, updated_at = datetime('now') WHERE id = ?`)
			.bind(key, productId)
			.run();

		if (product.image_key && product.image_key !== key) {
			await platform.env.SET_IMAGES.delete(product.image_key);
		}

		throw redirect(303, '/admin/sets?saved=1');
	},

	clear: async ({ request, platform }) => {
		const database = db(platform);
		const form = await request.formData();
		const productId = Number(form.get('product_id'));

		const product = await database
			.prepare('SELECT id, image_key FROM products WHERE id = ?')
			.bind(productId)
			.first();

		if (!product) return fail(404, { message: 'Set not found.' });

		if (product.image_key) {
			await platform.env.SET_IMAGES.delete(product.image_key);
		}

		await database
			.prepare(`UPDATE products SET image_key = NULL, updated_at = datetime('now') WHERE id = ?`)
			.bind(productId)
			.run();

		throw redirect(303, '/admin/sets?cleared=1');
	}
};
