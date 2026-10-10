import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ locals, platform, request }) {
  if (!locals.user) return json({ message: 'Sign in first.' }, { status: 401 });

  const body = await request.json();
  const ids = Array.isArray(body?.cardIds)
    ? [...new Set(body.cardIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 10000)
    : [];

  if (!ids.length) return json({ ok: true, imported: 0 });

  const database = db(platform);
  let imported = 0;

  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    const placeholders = chunk.map(() => '?').join(',');
    const found = await database.prepare(`SELECT id FROM cards WHERE id IN (${placeholders})`).bind(...chunk).all();

    const statements = (found.results || []).map((card) =>
      database.prepare(`
        INSERT INTO collection_cards (user_id, card_id, status, updated_at)
        VALUES (?, ?, 'owned', datetime('now'))
        ON CONFLICT(user_id, card_id) DO UPDATE SET status = 'owned', updated_at = datetime('now')
      `).bind(locals.user.id, card.id)
    );

    if (statements.length) {
      await database.batch(statements);
      imported += statements.length;
    }
  }

  return json({ ok: true, imported });
}
