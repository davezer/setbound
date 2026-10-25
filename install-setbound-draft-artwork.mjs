import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pagePath = path.join(root, 'src/routes/admin/sets/+page.svelte');
const endpointPath = path.join(root, 'src/routes/api/admin/products/artwork/[slug]/+server.js');
if (!fs.existsSync(pagePath) || !fs.existsSync(path.join(root,'src/hooks.server.js'))) {
  throw Error('Run this installer from the Setbound project root. Nothing changed.');
}
let page = fs.readFileSync(pagePath, 'utf8');
const before = 'return `/media/set/${product.slug}?v=${encodeURIComponent(product.image_key)}`;';
const after = 'return `/api/admin/products/artwork/${encodeURIComponent(product.slug)}?v=${encodeURIComponent(product.image_key)}`;';
if (page.includes(after)) {
  console.log('Manage Sets artwork URL already updated.');
} else {
  const count = page.split(before).length-1;
  if (count !== 1) throw Error(`Expected one Manage Sets artwork URL; found ${count}. Nothing changed.`);
  page = page.replace(before,after);
}
const endpoint = `import { error } from '@sveltejs/kit';
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
`;
// Validate targets before making either change.
if (fs.existsSync(endpointPath)) {
  const current = fs.readFileSync(endpointPath,'utf8');
  if (current !== endpoint) throw Error('Admin artwork endpoint already exists and differs. Nothing changed; review manually.');
}
fs.mkdirSync(path.dirname(endpointPath), {recursive:true});
fs.writeFileSync(endpointPath, endpoint);
fs.writeFileSync(pagePath, page);
console.log('Fixed draft artwork in Manage Sets. Admin-only endpoint installed. No migrations, backups, or D1/R2 writes.');
