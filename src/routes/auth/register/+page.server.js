import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, hashPassword, normalizeEmail } from '$lib/server/auth';

export async function load({ locals }) {
  if (locals.user) throw redirect(303, '/collection');
}

export const actions = {
  default: async (event) => {
    const database = db(event.platform);
    const form = await event.request.formData();
    const email = normalizeEmail(form.get('email'));
    const password = String(form.get('password') || '');
    const displayName = String(form.get('display_name') || '').trim();

    if (!email || !email.includes('@')) return fail(400, { message: 'Enter a valid email address.', email, displayName });
    if (password.length < 8) return fail(400, { message: 'Use at least 8 characters for your password.', email, displayName });

    const existing = await database.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return fail(409, { message: 'An account already exists for that email.', email, displayName });

    const { hash, salt } = await hashPassword(password);
    const user = await database.prepare(`
      INSERT INTO users (email, password_hash, password_salt, display_name)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `).bind(email, hash, salt, displayName || null).first();

    await createSession(event, user.id);
    throw redirect(303, '/collection?welcome=1');
  }
};
