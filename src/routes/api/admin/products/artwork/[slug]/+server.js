import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// The existing /api/admin guard in hooks.server.js authenticates this route,
// including admins using the password-based fallback login.
export async function GET({ platform, params, locals, request }) {
  if (!locals.isAdmin) throw error(403, 'Admin access required');
  const database = db(platform);
  const product = await database.prepare(
    'SELECT image_key FROM products WHERE slug = ?'
  ).bind(params.slug).first();
  if (!product?.image_key) throw error(404, 'Image not found');
  const object = await platform?.env?.SET_IMAGES?.get(product.image_key);
  if (!object) throw error(404, 'Image not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  const inm = request.headers.get('if-none-match');
  if (inm && inm === object.httpEtag) return new Response(null, {status:304,headers});
  return new Response(object.body, {headers});
}
