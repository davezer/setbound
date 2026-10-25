import { db } from '$lib/server/db';

const MAX_PRODUCTS = 10;
const MAX_CARDS = 30000;

export async function load({ platform, url, locals }) {
  const database = db(platform);
  const selected = [...new Set(url.searchParams.getAll('set').flatMap(value => value.split(',')).map(x => x.trim()).filter(Boolean))].slice(0, MAX_PRODUCTS);
  const catalog = await database.prepare(`
    SELECT p.id, p.slug, p.year, p.name, m.name AS manufacturer_name,
      s.name AS sport_name, COUNT(DISTINCT c.id) AS card_count
    FROM products p
    JOIN manufacturers m ON m.id = p.manufacturer_id
    JOIN sports s ON s.id = p.sport_id
    LEFT JOIN cards c ON c.product_id = p.id
    WHERE p.published = 1
    GROUP BY p.id
    ORDER BY p.year DESC, p.name
    LIMIT 3500
  `).all();

  let products = [];
  let cards = [];
  let truncated = false;
  if (selected.length) {
    const placeholders = selected.map(() => '?').join(',');
    const result = await database.prepare(`
      SELECT id, slug, year, name FROM products
      WHERE published = 1 AND slug IN (${placeholders})
    `).bind(...selected).all();
    const lookup = new Map((result.results || []).map(row => [row.slug, row]));
    products = selected.map(slug => lookup.get(slug)).filter(Boolean);
    if (products.length) {
      const ids = products.map(p => p.id);
      const marks = ids.map(() => '?').join(',');
      const rows = await database.prepare(`
        SELECT c.id, c.product_id, c.card_number, c.rookie, c.autograph,
          c.memorabilia, c.serial_number, sub.name AS subject_name,
          cl.name AS checklist_name,
          COALESCE(NULLIF(TRIM(c.affiliation_label), ''), a.name, 'Unassigned') AS team_name
        FROM cards c
        JOIN subjects sub ON sub.id = c.subject_id
        JOIN checklists cl ON cl.id = c.checklist_id
        LEFT JOIN affiliations a ON a.id = c.affiliation_id
        WHERE c.product_id IN (${marks})
        ORDER BY c.product_id, cl.sort_order, c.sort_key, c.card_number
        LIMIT ${MAX_CARDS + 1}
      `).bind(...ids).all();
      cards = rows.results || [];
      truncated = cards.length > MAX_CARDS;
      if (truncated) cards = cards.slice(0, MAX_CARDS);
    }
  }
  return {
    catalog: catalog.results || [], products, cards, truncated,
    maxProducts: MAX_PRODUCTS, canExport: Boolean(locals.isAdmin || locals.user?.is_admin || locals.user?.is_breaker), initialView: url.searchParams.get('view') || 'break'
  };
}
