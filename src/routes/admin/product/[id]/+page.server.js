import { fail, redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, params }) {
  const database=db(platform);
  const product=await database.prepare(`
    SELECT p.*,m.name manufacturer_name,s.name sport_name
    FROM products p
    JOIN manufacturers m ON m.id=p.manufacturer_id
    JOIN sports s ON s.id=p.sport_id
    WHERE p.id=?
  `).bind(Number(params.id)).first();

  if(!product) throw error(404,'Set not found');
  return { product };
}

export const actions={
  default: async ({ platform, params, request })=>{
    const database=db(platform);
    const form=await request.formData();
    const releaseDate=String(form.get('release_date')||'').trim()||null;
    const notes=String(form.get('product_notes')||'').trim()||null;

    if(releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)){
      return fail(400,{message:'Release date must be YYYY-MM-DD.'});
    }

    await database.prepare(`
      UPDATE products
      SET release_date=?,product_notes=?,updated_at=datetime('now')
      WHERE id=?
    `).bind(releaseDate,notes,Number(params.id)).run();

    throw redirect(303,`/admin/product/${params.id}?saved=1`);
  }
};
