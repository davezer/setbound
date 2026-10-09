import { db } from '$lib/server/db';
export async function load({ platform, url }) {
  const q = url.searchParams.get('q')?.trim() || '';
  try {
    const database = db(platform);
    let stmt = database.prepare(`SELECT p.slug,p.year,p.name,m.name manufacturer_name,
      COUNT(DISTINCT c.id) card_count,COUNT(DISTINCT cl.id) checklist_count
      FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id
      LEFT JOIN cards c ON c.product_id=p.id LEFT JOIN checklists cl ON cl.product_id=p.id
      WHERE p.published=1 ${q ? 'AND (p.name LIKE ? OR m.name LIKE ? OR CAST(p.year AS TEXT) LIKE ?)' : ''}
      GROUP BY p.id ORDER BY p.year DESC,p.name`);
    if (q) stmt = stmt.bind(`%${q}%`,`%${q}%`,`%${q}%`);
    const result = await stmt.all();
    return { sets: result.results || [], q };
  } catch { return { sets: [], q }; }
}
