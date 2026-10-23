import { db } from '$lib/server/db';
export async function load({ platform, locals }) {
  const signedIn = Boolean(locals.user);
  try {
    const database = db(platform);
    const [recent, sports] = await Promise.all([
      database.prepare(`
        WITH newest AS (
          SELECT id, slug, year, name, image_key, manufacturer_id, sport_id
          FROM products WHERE published = 1
          ORDER BY COALESCE(release_date, created_at) DESC, created_at DESC LIMIT 6
        )
        SELECT p.slug, p.year, p.name, p.image_key,
          m.name AS manufacturer_name, s.name AS sport_name, s.slug AS sport_slug,
          (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id) AS card_count,
          (SELECT COUNT(*) FROM checklists cl WHERE cl.product_id = p.id) AS checklist_count
        FROM newest p JOIN manufacturers m ON m.id = p.manufacturer_id JOIN sports s ON s.id = p.sport_id
      `).all(),
      database.prepare(`
        SELECT s.name, s.slug, COUNT(p.id) AS set_count
        FROM sports s JOIN products p ON p.sport_id = s.id AND p.published = 1
        GROUP BY s.id ORDER BY s.sort_order, s.name
      `).all()
    ]);
    return { recent: recent.results || [], sports: sports.results || [], signedIn };
  } catch (error) {
    console.error('Homepage query failed', error);
    return { recent: [], sports: [], signedIn };
  }
}
