import { db, stats } from '$lib/server/db';

export async function load({ platform }) {
  try {
    const database = db(platform);
    const [summary, recent] = await Promise.all([
      stats(database),
      database.prepare(`SELECT p.slug,p.year,p.name,m.name manufacturer_name,
        COUNT(DISTINCT c.id) card_count, COUNT(DISTINCT cl.id) checklist_count
        FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id
        LEFT JOIN checklists cl ON cl.product_id=p.id LEFT JOIN cards c ON c.product_id=p.id
        WHERE p.published=1 GROUP BY p.id ORDER BY p.year DESC,p.created_at DESC LIMIT 6`).all()
    ]);
    return { summary, recent: recent.results || [], demo: false };
  } catch {
    return {
      summary: { products: 1, cards: 300, subjects: 300 },
      recent: [{ slug:'2026-topps-allen-ginter', year:2026, name:'Allen & Ginter', manufacturer_name:'Topps', card_count:300, checklist_count:8 }],
      demo: true
    };
  }
}
