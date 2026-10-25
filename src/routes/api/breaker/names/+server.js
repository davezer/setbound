import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

function normalized(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export async function POST({ request, platform, locals }) {
  if (!locals.user) return json({ message: 'Sign in with an approved Breaker account.' }, { status: 401 });
  const database = db(platform);
  const account = await database.prepare('SELECT is_admin, is_breaker FROM users WHERE id=?').bind(locals.user.id).first();
  if (!account || !(account.is_admin || account.is_breaker)) {
    return json({ message: 'Breaker access is required.' }, { status: 403 });
  }
  const input = await request.json().catch(() => ({}));
  if (!Array.isArray(input.slugs) || !input.slugs.length || input.slugs.length > 10 ||
      input.slugs.some(s => typeof s !== 'string' || s.length > 180 || !/^[a-z0-9-]+$/.test(s))) {
    return json({ message: 'Choose 1–10 valid products.' }, { status: 400 });
  }
  const slugs = [...new Set(input.slugs)];
  const marks = slugs.map(() => '?').join(',');
  const products = await database.prepare(`SELECT slug FROM products WHERE published=1 AND slug IN (${marks})`).bind(...slugs).all();
  if ((products.results || []).length !== slugs.length) return json({ message: 'One or more products are unavailable.' }, { status: 404 });
  const result = await database.prepare(`
    SELECT DISTINCT s.name AS name
    FROM cards c JOIN products p ON p.id=c.product_id
    JOIN subjects s ON s.id=c.subject_id
    WHERE p.published=1 AND p.slug IN (${marks}) AND TRIM(s.name) != ''
    LIMIT 10001
  `).bind(...slugs).all();
  const rows = result.results || [];
  if (rows.length > 10000) return json({ message: 'Too many unique subjects for a complete export. Reduce selected products.' }, { status: 413 });
  const deduped = new Map();
  for (const row of rows) {
    const name = String(row.name || '').replace(/\s+/g, ' ').trim();
    const key = normalized(name);
    if (key && !deduped.has(key)) deduped.set(key, name);
  }
  const names = [...deduped.values()].sort((a,b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return json({ names, count: names.length, productCount: slugs.length }, { headers: { 'cache-control': 'no-store' } });
}
