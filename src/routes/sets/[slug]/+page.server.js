import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params, locals, url }) {
  const database = db(platform);

  const product = await database.prepare(`
    SELECT p.*,m.name manufacturer_name,s.name sport_name,
      src.original_filename,src.source_url,src.imported_at
    FROM products p
    JOIN manufacturers m ON m.id=p.manufacturer_id
    JOIN sports s ON s.id=p.sport_id
    LEFT JOIN sources src ON src.id=p.primary_source_id
    WHERE p.slug=? AND p.published=1
  `).bind(params.slug).first();

  if (!product) throw error(404,'Set not found');

  const collectionJoin = locals.user
    ? `LEFT JOIN collection_cards uc ON uc.card_id = c.id AND uc.user_id = ${Number(locals.user.id)}`
    : '';

  const collectionSelect = locals.user ? ', uc.status AS collection_status' : ', NULL AS collection_status';

  const [checklists,cards] = await Promise.all([
    database.prepare(`
      SELECT cl.id,cl.name,cl.kind,COUNT(c.id) card_count,
        cd.card_count_declared,cd.parallels_json,cd.notes_json
      FROM checklists cl
      LEFT JOIN cards c ON c.checklist_id=cl.id
      LEFT JOIN checklist_details cd ON cd.checklist_id=cl.id
      WHERE cl.product_id=?
      GROUP BY cl.id
      ORDER BY cl.sort_order,cl.name
    `).bind(product.id).all(),

    database.prepare(`
      SELECT c.id,c.card_number,c.rookie,c.autograph,c.memorabilia,c.serial_number,c.confidence,
        sub.name subject_name,COALESCE(a.name,'NIL') affiliation_name,cl.name checklist_name
        ${collectionSelect}
      FROM cards c
      JOIN subjects sub ON sub.id=c.subject_id
      JOIN checklists cl ON cl.id=c.checklist_id
      LEFT JOIN affiliations a ON a.id=c.affiliation_id
      ${collectionJoin}
      WHERE c.product_id=?
      ORDER BY cl.sort_order,c.sort_key,c.card_number
      LIMIT 10000
    `).bind(product.id).all()
  ]);

  return {
    product,
    checklists:(checklists.results||[]).map((row)=>({
      ...row,
      parallels:safeJson(row.parallels_json),
      notes:safeJson(row.notes_json)
    })),
    cards:cards.results||[],
    user:locals.user ? { id:locals.user.id } : null,
    initialQuery:url.searchParams.get('q')||''
  };
}

function safeJson(value){
  if(!value) return [];
  try{return JSON.parse(value);}catch{return [];}
}
