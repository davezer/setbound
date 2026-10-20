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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'],
  ['image/webp', 'webp'], ['image/avif', 'avif']
]);

function safePublicUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') ||
      host.endsWith('.invalid') || host.endsWith('.example') ||
      /(^|\.)(?:localhost|metadata|internal)$/.test(host) ||
      /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':') ||
      /^(?:0x[0-9a-f]+|\d+)$/i.test(host)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

async function fetchExternalImage(fetchFn, rawUrl) {
  let url = safePublicUrl(rawUrl);
  if (!url) throw new Error('Enter a public HTTPS image URL (no local addresses or custom ports).');

  for (let hop = 0; hop < 5; hop++) {
    const response = await fetchFn(url.href, {
      redirect: 'manual',
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg', 'user-agent': 'Setbound/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      const next = location ? safePublicUrl(new URL(location, url).href) : null;
      if (!next) throw new Error('Image redirects to a URL that is not allowed.');
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Image website returned HTTP ${response.status}. Try a direct image URL.`);
    }
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      await response.body?.cancel();
      throw new Error('URL did not return a JPG, PNG, WEBP, or AVIF image. Use a direct image link.');
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new Error('Image exceeds 8 MB.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The image server returned an empty response.');
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) throw new Error('Image exceeds 8 MB.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (total < 100) throw new Error('Image file is empty or invalid.');
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const fourcc = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
    const isWebp = fourcc(0, 4) === 'RIFF' && fourcc(8, 4) === 'WEBP';
    const isAvif = fourcc(4, 4) === 'ftyp' && /avif|avis/.test(fourcc(8, 12));
    if (!(type === 'image/jpeg' && isJpg || type === 'image/png' && isPng ||
      type === 'image/webp' && isWebp || type === 'image/avif' && isAvif)) {
      throw new Error('Image contents did not match the reported file type.');
    }
    return { bytes, type, ext: IMAGE_TYPES.get(type) };
  }
  throw new Error('Image redirected too many times.');
}

export async function load({ platform, params, url }) {
  const database = db(platform);
  const product = await database.prepare(`
    SELECT p.*, m.name AS manufacturer_name, s.name AS sport_name
    FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id
    JOIN sports s ON s.id = p.sport_id WHERE p.id = ?
  `).bind(Number(params.id)).first();
  if (!product) throw error(404, 'Set not found');
  const formatResult = await database.prepare(`
    SELECT format_key, label, details, sort_order FROM product_formats
    WHERE product_id = ? ORDER BY sort_order, id
  `).bind(product.id).all();
  const saved = new Map((formatResult.results || []).map(row => [row.format_key, row]));
  return { product, imageSaved: url.searchParams.has('image-saved'), formats: FORMAT_FIELDS.map(field => ({ ...field, details: saved.get(field.key)?.details || '' })) };
}

export const actions = {
   saveMetadata: async ({ platform, params, request }) => {
    const database = db(platform);
    const productId = Number(params.id);
    const form = await request.formData();
    const releaseDate = String(form.get('release_date') || '').trim() || null;
    const notes = String(form.get('product_notes') || '').trim() || null;
    if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return fail(400, { message: 'Release date must be YYYY-MM-DD.' });
    const statements = [database.prepare(`
      UPDATE products SET release_date = ?, product_notes = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(releaseDate, notes, productId)];
    for (const field of FORMAT_FIELDS) {
      const details = String(form.get(`format_${field.key}`) || '').trim();
      if (details) statements.push(database.prepare(`
        INSERT INTO product_formats (product_id, format_key, label, details, sort_order, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(product_id, format_key) DO UPDATE SET label=excluded.label,
          details=excluded.details, sort_order=excluded.sort_order, updated_at=datetime('now')
      `).bind(productId, field.key, field.label, details, field.sort));
      else statements.push(database.prepare(`DELETE FROM product_formats WHERE product_id = ? AND format_key = ?`).bind(productId, field.key));
    }
    await database.batch(statements);
    throw redirect(303, `/admin/product/${productId}?saved=1`);
  },

  imageUrl: async ({ platform, params, request, fetch }) => {
    const productId = Number(params.id);
    if (!Number.isSafeInteger(productId) || productId < 1) return fail(400, { imageError: 'Invalid product ID.' });
    const form = await request.formData();
    const raw = String(form.get('image_url') || '').trim();
    if (raw.length > 2048 || !safePublicUrl(raw)) return fail(400, { imageError: 'Use a direct public HTTPS image URL (up to 2048 characters).' });
    const database = db(platform);
    const product = await database.prepare('SELECT id, slug, image_key FROM products WHERE id = ?').bind(productId).first();
    if (!product) return fail(404, { imageError: 'Product not found.' });
    const bucket = platform?.env?.SET_IMAGES;
    if (!bucket) return fail(503, { imageError: 'R2 SET_IMAGES binding is not configured.' });
    let image;
    try { image = await fetchExternalImage(fetch, raw); }
    catch (e) { return fail(400, { imageError: e?.message || 'Could not fetch image.' }); }
    const key = `sets/${product.slug}-${crypto.randomUUID()}.${image.ext}`;
    try {
      await bucket.put(key, image.bytes, {
        httpMetadata: { contentType: image.type, cacheControl: 'public, max-age=31536000, immutable' }
      });
      try {
        await database.prepare(`UPDATE products SET image_key = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(key, productId).run();
      } catch (e) {
        await bucket.delete(key).catch(() => {});
        throw e;
      }
      if (product.image_key && product.image_key !== key) await bucket.delete(product.image_key).catch(() => {});
    } catch (e) { return fail(500, { imageError: e?.message || 'Could not save image.' }); }
    throw redirect(303, `/admin/product/${productId}?image-saved=1`);
  }
};
