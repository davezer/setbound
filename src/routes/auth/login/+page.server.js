import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { createSession, normalizeEmail, verifyPassword } from '$lib/server/auth';

export async function load({ locals, url }) {
  if (locals.user) throw redirect(303, '/collection');
  return { next: url.searchParams.get('next') || '/collection' };
}

export const actions = {
  default: async (event) => {
    const database = db(event.platform);
    const form = await event.request.formData();
    const email = normalizeEmail(form.get('email'));
    const password = String(form.get('password') || '');
    const next = String(form.get('next') || '/collection');

    const user = await database.prepare(`
      SELECT id, email, password_hash, password_salt FROM users WHERE email = ?
    `).bind(email).first();

    if (!user || !(await verifyPassword(password, user.password_hash, user.password_salt))) {
      return fail(400, { message: 'Email or password is incorrect.', email, next });
    }

    await createSession(event, user.id);
    throw redirect(303, next.startsWith('/') ? next : '/collection');
  }
};
