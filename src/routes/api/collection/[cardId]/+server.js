import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function PUT({ locals, platform, params, request }) {
  if (!locals.user) return json({ message: 'Sign in to save your collection.' }, { status: 401 });

  const cardId = Number(params.cardId);
  if (!Number.isInteger(cardId) || cardId <= 0) return json({ message: 'Invalid card.' }, { status: 400 });

  const body = await request.json();
  const status = body?.status;
  if (![null, 'owned', 'wanted'].includes(status)) return json({ message: 'Invalid collection status.' }, { status: 400 });

  const database = db(platform);
  const card = await database.prepare('SELECT id FROM cards WHERE id = ?').bind(cardId).first();
  if (!card) return json({ message: 'Card not found.' }, { status: 404 });

  if (status === null) {
    await database.prepare('DELETE FROM collection_cards WHERE user_id = ? AND card_id = ?').bind(locals.user.id, cardId).run();
  } else {
    await database.prepare(`
      INSERT INTO collection_cards (user_id, card_id, status, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, card_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
    `).bind(locals.user.id, cardId, status).run();
  }

  return json({ ok: true, cardId, status });
}
