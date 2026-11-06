import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { MIN_PROFILE_CARDS, MIN_PROFILE_SETS } from '$lib/seo-policy.js';

const VALID_PATH = /^\/(?:sets\/[a-z0-9]+(?:-[a-z0-9]+)*|subjects\/[1-9][0-9]*)$/;

function parsePath(input) {
  let value = String(input || '').trim();
  if (value.startsWith('https://setbound.app/')) {
    try {
      const parsed = new URL(value);
      if (parsed.search || parsed.hash) return null;
      value = parsed.pathname;
    } catch { return null; }
  }
  return VALID_PATH.test(value) ? value : null;
}

async function liveTarget(database, path) {
  if (path.startsWith('/sets/')) {
    return Boolean(await database.prepare(`
      SELECT id FROM products WHERE slug = ? AND published = 1 LIMIT 1
    `).bind(path.slice('/sets/'.length)).first());
  }
  return Boolean(await database.prepare(`
    SELECT sub.id FROM subjects sub
    JOIN cards c ON c.subject_id = sub.id
    JOIN products p ON p.id = c.product_id AND p.published = 1
    WHERE sub.id = ? LIMIT 1
  `).bind(Number(path.slice('/subjects/'.length))).first());
}

export async function load({ platform }) {
  const database = db(platform);
  const [counts, subjectPreview, missingProductCards, recentRedirects] = await Promise.all([
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE published = 1) AS published_sets,
        (SELECT COUNT(*) FROM products p WHERE p.published = 1 AND NOT EXISTS
          (SELECT 1 FROM cards c WHERE c.product_id=p.id)) AS empty_sets,
        (SELECT COUNT(*) FROM seo_redirects) AS redirects,
        (SELECT COUNT(*) FROM subjects) AS total_subjects
    `).first(),
    database.prepare(`
      SELECT sub.id, sub.name, COUNT(c.id) AS cards,
        COUNT(DISTINCT p.id) AS sets
      FROM subjects sub
      JOIN cards c ON c.subject_id = sub.id
      JOIN products p ON p.id = c.product_id AND p.published = 1
      GROUP BY sub.id
      HAVING COUNT(c.id) < ? OR COUNT(DISTINCT p.id) < ?
      ORDER BY COUNT(c.id) DESC, sub.name
      LIMIT 40
    `).bind(MIN_PROFILE_CARDS, MIN_PROFILE_SETS).all(),
    database.prepare(`
      SELECT p.id, p.slug, p.year, p.name
      FROM products p
      WHERE p.published = 1 AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.product_id=p.id)
      ORDER BY p.updated_at DESC LIMIT 20
    `).all(),
    database.prepare(`
      SELECT old_path, new_path, reason, created_at
      FROM seo_redirects ORDER BY updated_at DESC LIMIT 20
    `).all()
  ]);

  return {
    counts,
    minCards: MIN_PROFILE_CARDS,
    minSets: MIN_PROFILE_SETS,
    subjectPreview: subjectPreview.results || [],
    emptySets: missingProductCards.results || [],
    redirects: recentRedirects.results || []
  };
}

export const actions = {
  addRedirect: async ({ platform, request }) => {
    const form = await request.formData();
    const oldPath = parsePath(form.get('old_path'));
    const newPath = parsePath(form.get('new_path'));
    if (!oldPath || !newPath || oldPath === newPath) {
      return fail(400, { message: 'Enter two different valid /sets/slug or /subjects/123 paths.' });
    }
    if (oldPath.split('/')[1] !== newPath.split('/')[1]) {
      return fail(400, { message: 'Redirects must remain in the same page category.' });
    }
    const database = db(platform);
    if (await liveTarget(database, oldPath)) {
      return fail(409, { message: 'The old URL still has a live page; it should not be redirected.' });
    }
    if (!(await liveTarget(database, newPath))) {
      return fail(400, { message: 'The destination must be an existing, published page with cards.' });
    }
    // The destination is live, so it will not be resolved through the redirect lookup.
    await database.prepare(`
      INSERT INTO seo_redirects(old_path,new_path,reason)
      VALUES(?,?, 'manual-reviewed')
      ON CONFLICT(old_path) DO UPDATE SET
        new_path=excluded.new_path, reason=excluded.reason, updated_at=datetime('now')
    `).bind(oldPath, newPath).run();
    return { ok: true, message: `Saved permanent redirect: ${oldPath} → ${newPath}` };
  }
};
