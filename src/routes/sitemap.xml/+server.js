// SETBOUND SEO SITEMAP HOTFIX 2026-11-05
// This intentionally lists canonical published checklists and sport landing pages.
// Subject/team aggregation is excluded: querying tens of thousands of subjects
// on every sitemap request can exhaust Cloudflare D1/Worker limits.
import { db } from '$lib/server/db';
import { SITE_URL } from '$lib/seo.js';

const PAGE_SIZE = 500;
const MAX_PAGES = 100; // Guard against an accidental infinite loop.

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function entry(url, lastmod = null) {
  const date = lastmod ? String(lastmod).slice(0, 10) : '';
  return `<url><loc>${escapeXml(url)}</loc>${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `<lastmod>${escapeXml(date)}</lastmod>` : ''}</url>`;
}

async function publishedChecklists(database) {
  const rows = [];
  let lastId = 0;

  // Keyset pagination: does not repeatedly rescan all previously fetched rows.
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await database.prepare(`
      SELECT p.id, p.slug, p.updated_at
      FROM products p
      WHERE p.published = 1
        AND p.id > ?
        AND EXISTS (SELECT 1 FROM cards c WHERE c.product_id = p.id)
      ORDER BY p.id ASC
      LIMIT ?
    `).bind(lastId, PAGE_SIZE).all();

    const batch = result.results || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;

    const nextId = Number(batch[batch.length - 1].id);
    if (!Number.isSafeInteger(nextId) || nextId <= lastId) {
      throw new Error('Sitemap pagination stalled');
    }
    lastId = nextId;
  }

  throw new Error('Sitemap page limit reached: split into sitemap files before expanding further');
}

export async function GET({ platform }) {
  const database = db(platform);

  const [products, sportsResult] = await Promise.all([
    publishedChecklists(database),
    database.prepare(`
      SELECT s.slug
      FROM sports s
      WHERE EXISTS (
        SELECT 1 FROM products p WHERE p.sport_id = s.id AND p.published = 1
      )
      ORDER BY s.slug
    `).all()
  ]);

  const entries = [
    entry(`${SITE_URL}/`),
    entry(`${SITE_URL}/sets`),
    ...(sportsResult.results || []).map((sport) =>
      entry(`${SITE_URL}/sets/sport/${sport.slug}`)
    ),
    ...products.map((product) =>
      entry(`${SITE_URL}/sets/${product.slug}`, product.updated_at)
    )
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=900'
    }
  });
}
