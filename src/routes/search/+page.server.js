import { db } from '$lib/server/db';

export async function load({ platform, url }) {
  const q=(url.searchParams.get('q')||'').trim();
  if(!q) return {q,sets:[],subjects:[],affiliations:[],cards:[]};

  try{
    const database=db(platform);
    const like=`%${q}%`;
    const [sets,subjects,affiliations,cards]=await Promise.all([
      database.prepare(`
        SELECT p.slug,p.year,p.name,p.image_key,m.name manufacturer_name,s.name sport_name,COUNT(c.id) card_count
        FROM products p
        JOIN manufacturers m ON m.id=p.manufacturer_id
        JOIN sports s ON s.id=p.sport_id
        LEFT JOIN cards c ON c.product_id=p.id
        WHERE p.published=1 AND (p.name LIKE ? OR m.name LIKE ? OR s.name LIKE ? OR CAST(p.year AS TEXT) LIKE ?)
        GROUP BY p.id ORDER BY p.year DESC,p.name LIMIT 12
      `).bind(like,like,like,like).all(),

      database.prepare(`
        SELECT sub.id,sub.name,COUNT(c.id) card_count,COUNT(DISTINCT c.product_id) set_count
        FROM subjects sub
        JOIN cards c ON c.subject_id=sub.id
        JOIN products p ON p.id=c.product_id AND p.published=1
        WHERE sub.name LIKE ?
        GROUP BY sub.id ORDER BY card_count DESC,sub.name LIMIT 15
      `).bind(like).all(),

      database.prepare(`
        SELECT a.id,a.name,COUNT(c.id) card_count,COUNT(DISTINCT c.product_id) set_count
        FROM affiliations a
        JOIN cards c ON c.affiliation_id=a.id
        JOIN products p ON p.id=c.product_id AND p.published=1
        WHERE a.name LIKE ?
        GROUP BY a.id ORDER BY card_count DESC,a.name LIMIT 15
      `).bind(like).all(),

      database.prepare(`
        SELECT c.id,c.card_number,sub.name subject_name,COALESCE(a.name,'NIL') affiliation_name,
          p.year,p.name product_name,p.slug,m.name manufacturer_name,cl.name checklist_name
        FROM cards c
        JOIN subjects sub ON sub.id=c.subject_id
        JOIN products p ON p.id=c.product_id
        JOIN manufacturers m ON m.id=p.manufacturer_id
        JOIN checklists cl ON cl.id=c.checklist_id
        LEFT JOIN affiliations a ON a.id=c.affiliation_id
        WHERE p.published=1 AND (
          sub.name LIKE ? OR a.name LIKE ? OR p.name LIKE ? OR c.card_number LIKE ? OR cl.name LIKE ?
        )
        ORDER BY p.year DESC,sub.name LIMIT 100
      `).bind(like,like,like,like,like).all()
    ]);

    return {
      q,
      sets:sets.results||[],
      subjects:subjects.results||[],
      affiliations:affiliations.results||[],
      cards:cards.results||[]
    };
  }catch{
    return {q,sets:[],subjects:[],affiliations:[],cards:[]};
  }
}
