// SETBOUND_SEO_RECOVERY_V1
import { db } from '$lib/server/db';
import { SITE_URL } from '$lib/seo.js';
import { MIN_PROFILE_CARDS, MIN_PROFILE_SETS } from '$lib/seo-policy.js';

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function entry(loc, lastmod) {
  return `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>` : ''}</url>`;
}

// Paginate to prevent large D1 result sets from silently truncating the sitemap.
async function getAll(database, statement) {
  const pageSize = 500;
  const records = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await database.prepare(`${statement} LIMIT ? OFFSET ?`)
      .bind(pageSize, offset).all();
    const rows = result.results || [];
    records.push(...rows);
    if (rows.length < pageSize) break;
    if (offset > 500000) throw new Error('Sitemap results exceeded safety cap.');
  }
  return records;
}

export async function GET({ platform }) {
  const database = db(platform);
  const [products, sports, subjects, affiliations] = await Promise.all([
    getAll(database, `
      SELECT p.slug, p.updated_at
      FROM products p
      WHERE p.published = 1 AND EXISTS
        (SELECT 1 FROM cards c WHERE c.product_id = p.id)
      ORDER BY p.id
    `),
    getAll(database, `
      SELECT DISTINCT s.slug
      FROM sports s
      JOIN products p ON p.sport_id = s.id
      WHERE p.published = 1
      ORDER BY s.slug
    `),
    getAll(database, `
      SELECT sub.id
      FROM subjects sub
      JOIN cards c ON c.subject_id = sub.id
      JOIN products p ON p.id = c.product_id AND p.published = 1
      GROUP BY sub.id
      HAVING COUNT(c.id) >= ${MIN_PROFILE_CARDS}
         AND COUNT(DISTINCT p.id) >= ${MIN_PROFILE_SETS}
      ORDER BY sub.id
    `),
    getAll(database, `
      SELECT a.id
      FROM affiliations a
      JOIN cards c ON c.affiliation_id = a.id
      JOIN products p ON p.id = c.product_id AND p.published = 1
      GROUP BY a.id
      HAVING COUNT(c.id) >= ${MIN_PROFILE_CARDS}
         AND COUNT(DISTINCT p.id) >= ${MIN_PROFILE_SETS}
      ORDER BY a.id
    `)
  ]);

  const entries = [
    entry(`${SITE_URL}/`),
    entry(`${SITE_URL}/sets`),
    ...sports.map((sport) => entry(`${SITE_URL}/sets/sport/${sport.slug}`)),
    ...products.map((product) => entry(`${SITE_URL}/sets/${product.slug}`, product.updated_at)),
    ...subjects.map((subject) => entry(`${SITE_URL}/subjects/${subject.id}`)),
    ...affiliations.map((team) => entry(`${SITE_URL}/teams/${team.id}`))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=900',
      // This only applies to the XML document; not the URLs it lists.
      'X-Robots-Tag': 'noindex'
    }
  });
}
