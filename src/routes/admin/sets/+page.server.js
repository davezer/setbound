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
			p.release_date,
			p.product_notes,
			p.published,
			CASE WHEN NULLIF(TRIM(COALESCE(p.product_notes, '')), '') IS NOT NULL THEN 1 ELSE 0 END AS has_product_details,
			CASE WHEN length(trim(COALESCE(p.product_notes, ''))) > 0 OR EXISTS (
				SELECT 1 FROM product_formats pf
				WHERE pf.product_id = p.id
				  AND length(trim(COALESCE(pf.details, ''))) > 0
				  AND substr(pf.details, 1, 12) <> 'Listed as a '
			) THEN 1 ELSE 0 END AS has_enrichment,
			m.name AS manufacturer_name,
			s.name AS sport_name,
			CASE WHEN EXISTS (
				SELECT 1
				FROM source_harvester_cache shc
				WHERE shc.source = 'topps-launch-metadata'
				  AND CAST(json_extract(shc.entry_json, '$.productId') AS INTEGER) = p.id
			) THEN 1 ELSE 0 END AS has_topps_backfill,
			COUNT(DISTINCT c.id) AS card_count,
			COUNT(DISTINCT cl.id) AS checklist_count,
            COUNT(DISTINCT CASE WHEN cd.parallels_json IS NOT NULL AND TRIM(cd.parallels_json) NOT IN ('', '[]', 'null') THEN cl.id END) AS parallel_section_count
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		LEFT JOIN cards c ON c.product_id = p.id
		LEFT JOIN checklists cl ON cl.product_id = p.id
        LEFT JOIN checklist_details cd ON cd.checklist_id = cl.id
		GROUP BY p.id
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

		if (!Number.isInteger(productId) || productId <= 0) return fail(400, { message: 'Choose a valid set.' });
		if (!(file instanceof File) || !file.size) return fail(400, { message: 'Choose an image first.' });
		if (!ALLOWED_TYPES.has(file.type)) return fail(400, { message: 'Use a JPG, PNG, WEBP, or AVIF image.' });
		if (file.size > MAX_IMAGE_BYTES) return fail(400, { message: 'Set images must be 5 MB or smaller.' });

		const product = await database.prepare(
			'SELECT id, slug, image_key FROM products WHERE id = ?'
		).bind(productId).first();

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

		await database.prepare(`
			UPDATE products
			SET image_key = ?, updated_at = datetime('now')
			WHERE id = ?
		`).bind(key, productId).run();

		if (product.image_key && product.image_key !== key) {
			await platform.env.SET_IMAGES.delete(product.image_key);
		}

		throw redirect(303, '/admin/sets?saved=1');
	},


	// SETBOUND_MANAGE_BULK_V1
	bulkOnline: async ({ request, platform }) => {
		const form = await request.formData();
		let ids;
		try { ids=JSON.parse(String(form.get('product_ids')||'[]')); }
		catch { return fail(400,{message:'Invalid selection.'}); }
		if(!Array.isArray(ids)||ids.length<1||ids.length>1000||!ids.every(id=>Number.isSafeInteger(id)&&id>0)||new Set(ids).size!==ids.length) return fail(400,{message:'Select 1 to 1000 unique drafts.'});
		const database=db(platform),statements=[];
		for(let i=0;i<ids.length;i+=75){const chunk=ids.slice(i,i+75);statements.push(database.prepare("UPDATE products SET published=1,updated_at=datetime('now') WHERE published=0 AND id IN ("+chunk.map(()=>'?').join(',')+')').bind(...chunk));}
		const result=await database.batch(statements);
		return {ok:true,publishedCount:result.reduce((n,r)=>n+Number(r.meta?.changes||0),0)};
	},

	// SETBOUND_BULK_OFFLINE_V1: change publication status without deleting any data.
	bulkOffline: async ({ request, platform }) => {
		const form = await request.formData();
		let ids;
		try { ids = JSON.parse(String(form.get('product_ids') || '[]')); }
		catch { return fail(400, { message: 'Invalid selection.' }); }
		if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 ||
			!ids.every(id => Number.isSafeInteger(id) && id > 0) ||
			new Set(ids).size !== ids.length) {
			return fail(400, { message: 'Select between 1 and 1000 unique valid sets.' });
		}
		const database = db(platform);
		const statements = [];
		for (let offset = 0; offset < ids.length; offset += 75) {
			const chunk = ids.slice(offset, offset + 75);
			const marks = chunk.map(() => '?').join(',');
			statements.push(database.prepare(
				`UPDATE products SET published = 0, updated_at = datetime('now') WHERE published = 1 AND id IN (${marks})`
			).bind(...chunk));
		}
		const results = await database.batch(statements);
		return { ok: true, offlineCount: results.reduce((sum, row) => sum + Number(row.meta?.changes || 0), 0) };
	},

	visibility: async ({ request, platform }) => {
		const database = db(platform);
		const form = await request.formData();
		const productId = Number(form.get('product_id'));
		const nextPublished = String(form.get('published') || '0') === '1' ? 1 : 0;

		if (!Number.isInteger(productId) || productId <= 0) {
			return fail(400, { message: 'Choose a valid set.' });
		}

		const product = await database.prepare(
			'SELECT id FROM products WHERE id = ?'
		).bind(productId).first();

		if (!product) return fail(404, { message: 'Set not found.' });

		await database.prepare(`
			UPDATE products
			SET published = ?, updated_at = datetime('now')
			WHERE id = ?
		`).bind(nextPublished, productId).run();

		return { ok: true, productId, published: nextPublished };
	},

	clear: async ({ request, platform }) => {
		const database = db(platform);
		const form = await request.formData();
		const productId = Number(form.get('product_id'));
		const product = await database.prepare(
			'SELECT id, image_key FROM products WHERE id = ?'
		).bind(productId).first();

		if (!product) return fail(404, { message: 'Set not found.' });
		if (product.image_key) await platform.env.SET_IMAGES.delete(product.image_key);

		await database.prepare(`
			UPDATE products
			SET image_key = NULL, updated_at = datetime('now')
			WHERE id = ?
		`).bind(productId).run();

		throw redirect(303, '/admin/sets?cleared=1');
	}
};
