import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const FORMAT_FIELDS = [
  ['hobby', 'Hobby box', 10], ['breaker', 'Breaker', 20],
  ['blaster', 'Blaster / Value box', 30], ['mega', 'Mega box', 40],
  ['jumbo', 'Jumbo box', 50], ['retail', 'Retail box', 60],
  ['fat_pack', 'Fat pack', 70], ['hanger', 'Hanger', 80],
  ['collector', 'Collector / Tin', 90], ['inserts', 'Notable inserts', 100]
];
const FORMAT_MAP = new Map(FORMAT_FIELDS.map(([key,label,order])=>[key,{label,order}]));

export async function load({ platform }) {
  const database = db(platform);
  const [productRows, formatRows, affiliationRows] = await Promise.all([
    database.prepare(`
      SELECT p.id, p.slug, p.year, p.name, p.release_date, p.image_key,
             p.published, p.product_notes,
             m.name AS manufacturer_name, s.name AS sport_name,
             (SELECT COUNT(*) FROM cards c WHERE c.product_id=p.id) AS card_count,
             (SELECT COUNT(*) FROM checklists c WHERE c.product_id=p.id) AS checklist_count,
             (SELECT COUNT(*) FROM source_harvester_cache h
              WHERE h.source='topps-launch-metadata'
                AND CAST(json_extract(h.entry_json, '$.productId') AS INTEGER)=p.id) AS cached_launch_count
      FROM products p
      JOIN manufacturers m ON m.id=p.manufacturer_id
      JOIN sports s ON s.id=p.sport_id
      ORDER BY p.year DESC,p.name
    `).all(),
    database.prepare(`SELECT product_id,format_key,label,details FROM product_formats ORDER BY sort_order,id`).all(),
    database.prepare(`SELECT id,name,aliases_json FROM affiliations ORDER BY length(name) DESC`).all()
  ]);
  const byProduct = new Map();
  for (const row of formatRows.results || []) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push(row);
  }
  return {
    products: (productRows.results || []).map((p)=>({
      ...p, formats: byProduct.get(p.id) || []
    })),
    formatFields: FORMAT_FIELDS.map(([key,label])=>({key,label})),
    affiliations: (affiliationRows.results || []).map(a=>({...a,aliases:JSON.parse(a.aliases_json||'[]')}))
  };
}

export const actions = {
  saveFacts: async ({ request, platform }) => {
    const form = await request.formData();
    const productId = Number(form.get('product_id'));
    if (!Number.isInteger(productId) || productId < 1) return fail(400, { message: 'Invalid product.' });
    const date = String(form.get('release_date') || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, {message:'Invalid date.'});
    const database = db(platform);
    const product = await database.prepare('SELECT id FROM products WHERE id=?').bind(productId).first();
    if (!product) return fail(404, { message: 'Product not found.' });

    const statements = [];
    // Do not touch product_notes, artwork, checklists, or ownership records.
    statements.push(database.prepare(`UPDATE products SET release_date=?,updated_at=datetime('now') WHERE id=?`)
      .bind(date || null, productId));
    for (const [key,label,order] of FORMAT_FIELDS) {
      const value = String(form.get(`format_${key}`) || '').trim();
      if (value) {
        statements.push(database.prepare(`
          INSERT INTO product_formats (product_id,format_key,label,details,sort_order,updated_at)
          VALUES (?,?,?,?,?,datetime('now'))
          ON CONFLICT(product_id,format_key) DO UPDATE SET
          label=excluded.label, details=excluded.details,
          sort_order=excluded.sort_order, updated_at=datetime('now')
        `).bind(productId,key,label,value,order));
      } else {
        statements.push(database.prepare(`DELETE FROM product_formats WHERE product_id=? AND format_key=?`)
          .bind(productId,key));
      }
    }
    await database.batch(statements);
    return {ok:true,productId,message:'Product facts saved.'};
  }
};
