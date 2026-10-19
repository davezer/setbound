import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cleanResearchCopy, readArtworkCache, fetchImage } from '$lib/server/research-v4.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const FORMAT_META = new Map([
	['hobby', ['Hobby Box Breakdown', 10]],
	['breaker', ['Breaker / Breaker Delight Breakdown', 20]],
	['blaster', ['Blaster / Value Box Breakdown', 30]],
	['mega', ['Mega Box Breakdown', 40]],
	['jumbo', ['Jumbo Box Breakdown', 50]],
	['retail', ['Retail Box Breakdown', 60]],
	['fat_pack', ['Fat Pack Breakdown', 70]],
	['hanger', ['Hanger Box Breakdown', 80]],
	['collector', ['Collector / Tin Breakdown', 90]],
	['inserts', ['Notable Inserts', 100]],
	['sapphire', ['Sapphire Edition Box Breakdown', 120]],
	['mania', ['Mania Box Breakdown', 110]]
]);

function cleanCollectorCopy(value) {
  return String(value || '')
    .replace(/\[\s*(?:https?:\/\/[^\]]+|(?:www\.)?[\w.-]+\.(?:com|net|org|app)[^\]]*)\s*\]/gi,'')
    .replace(/\(\s*https?:\/\/[^)]+\)/gi,'')
    .replace(/https?:\/\/[^\s)]+/gi,'')
    .replace(/【[^】]+】|\[\s*\d+\s*\]/g,'')
    .replace(/\b(?:Hobby|Hanger|Mega|Jumbo|Blaster|Retail|Value|Mania|Sapphire)?\s*(?:boxes|packs|products|items)\s+are available for purchase[^.!?]*[.!?]/gi,'')
    .replace(/\b(?:available for purchase|shop now|buy now|order today|purchase on the official)[^.!?]*[.!?]?/gi,'')
    .replace(/\s+([,.;!?])/g,'$1')
    .replace(/[ \t]{2,}/g,' ').trim();
}
function extensionForType(type) {
	if (type === 'image/jpeg') return 'jpg';
	if (type === 'image/png') return 'png';
	if (type === 'image/avif') return 'avif';
	return 'webp';
}

export async function POST({ platform, request, fetch }) {
	try {
		const database = db(platform);
		const body = await request.json();
		const productSlug = String(body.productSlug || '').trim();
		const releaseDate = String(body.releaseDate || '').trim() || null;
		const overview = cleanResearchCopy(body.overview) || null;
		const formats = Array.isArray(body.formats) ? body.formats : [];
		const imageUrl = String(body.imageUrl || '').trim();
		const applyReleaseDate = body.applyReleaseDate !== false;
		const applyOverview = body.applyOverview !== false;
		const applyFormats = body.applyFormats !== false;
		const applyImage = Boolean(body.applyImage && imageUrl);

		if (!productSlug) return json({ message: 'Missing product slug.' }, { status: 400 });
		if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
			return json({ message: 'Release date must be YYYY-MM-DD.' }, { status: 400 });
		}

		const product = await database.prepare(`SELECT id, slug, image_key, release_date, product_notes FROM products WHERE slug = ?`).bind(productSlug).first();
		if (!product) return json({ message: 'Product not found.' }, { status: 404 });

		const statements = [];
		if (applyReleaseDate || applyOverview) {
			statements.push(database.prepare(`
				UPDATE products
				SET release_date = ?, product_notes = ?, updated_at = datetime('now')
				WHERE id = ?
			`).bind(
				applyReleaseDate ? releaseDate : product.release_date || null,
				applyOverview ? overview : product.product_notes || null,
				product.id
			));
		}

		if (applyFormats) {
			for (const format of formats) {
				const key = String(format?.key || '').trim();
				const details = cleanResearchCopy(format?.details);
				if (!key || !details || !FORMAT_META.has(key)) continue;
				const [defaultLabel, sort] = FORMAT_META.get(key);
				const label = String(format?.label || '').trim() || defaultLabel;
				statements.push(database.prepare(`
					INSERT INTO product_formats (product_id, format_key, label, details, sort_order, updated_at)
					VALUES (?, ?, ?, ?, ?, datetime('now'))
					ON CONFLICT(product_id, format_key) DO UPDATE SET
						label = excluded.label,
						details = excluded.details,
						sort_order = excluded.sort_order,
						updated_at = datetime('now')
				`).bind(product.id, key, label, details, sort));
			}
		}

		if (statements.length) await database.batch(statements);

		let imageKey = product.image_key || null;
		if (applyImage) {
      const approved=await readArtworkCache(platform?.env?.SET_IMAGES,product.id);
      if (!approved.some(x => x.url === imageUrl)) return json({message:'Artwork must be selected from verified official research results. Run Find official artwork again.'},{status:400});
      const image=await fetchImage(fetch,imageUrl);
      if (!image) return json({message:'The approved product image is no longer reachable.'},{status:502});
      const key=`sets/${product.slug}-${crypto.randomUUID()}.${extensionForType(image.type)}`;
      await platform.env.SET_IMAGES.put(key,image.bytes,{httpMetadata:{contentType:image.type,cacheControl:'public, max-age=31536000, immutable'}});
      await database.prepare(`UPDATE products SET image_key = ?, updated_at = datetime('now') WHERE id = ?`).bind(key,product.id).run();
      if (product.image_key && product.image_key !== key) await platform.env.SET_IMAGES.delete(product.image_key);
      imageKey=key;
    }

		return json({ ok: true, productId: product.id, imageKey });
	} catch (error) {
		return json({ message: error?.message || 'Enrichment failed.' }, { status: 500 });
	}
}
