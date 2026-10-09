import { db } from '$lib/server/db';
export async function load({ platform, url }) {
  const q=(url.searchParams.get('q')||'').trim(); if(!q) return {q,results:[]};
  try { const database=db(platform); const like=`%${q}%`; const r=await database.prepare(`SELECT c.id,c.card_number,sub.name subject_name,COALESCE(a.name,'NIL') affiliation_name,p.year,p.name product_name,p.slug,m.name manufacturer_name,cl.name checklist_name
    FROM cards c JOIN subjects sub ON sub.id=c.subject_id JOIN products p ON p.id=c.product_id JOIN manufacturers m ON m.id=p.manufacturer_id JOIN checklists cl ON cl.id=c.checklist_id LEFT JOIN affiliations a ON a.id=c.affiliation_id
    WHERE p.published=1 AND (sub.name LIKE ? OR a.name LIKE ? OR p.name LIKE ? OR c.card_number LIKE ?) ORDER BY p.year DESC,sub.name LIMIT 200`).bind(like,like,like,like).all(); return {q,results:r.results||[]}; }
  catch{return {q,results:[]};}
}
