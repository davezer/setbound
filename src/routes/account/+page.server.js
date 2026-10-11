import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
  if (!locals.user) throw redirect(303, '/auth/login?next=/account');

  return {
    user: {
      id: locals.user.id,
      email: locals.user.email,
      displayName: locals.user.display_name,
      isAdmin: Boolean(locals.user.is_admin)
    }
  };
}
