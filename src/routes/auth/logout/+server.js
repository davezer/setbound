import { redirect } from '@sveltejs/kit';
import { destroySession } from '$lib/server/auth';

export async function POST(event) {
  await destroySession(event);
  throw redirect(303, '/');
}
