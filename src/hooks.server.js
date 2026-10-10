import { redirect, json } from '@sveltejs/kit';
import { getSessionUser, sha256 } from '$lib/server/auth';

const ADMIN_COOKIE = 'setbound_admin';
const TOKEN_PREFIX = 'setbound-admin-v1:';

function getPrivateEnv(platform, name) {
  const cloudflareValue = platform?.env?.[name];
  if (cloudflareValue) return String(cloudflareValue);
  if (typeof process !== 'undefined' && process?.env?.[name]) return String(process.env[name]);
  return '';
}

export async function makeAdminSessionToken(password) {
  return sha256(`${TOKEN_PREFIX}${password}`);
}

export async function handle({ event, resolve }) {
  event.locals.user = await getSessionUser(event);

  const pathname = event.url.pathname;
  const isAdminPage = pathname.startsWith('/admin');
  const isAdminLogin = pathname === '/admin/login';
  const isProtectedAdminApi = pathname.startsWith('/api/import') || pathname.startsWith('/api/admin');

  if (!isAdminPage && !isProtectedAdminApi) return resolve(event);

  const password = getPrivateEnv(event.platform, 'ADMIN_PASSWORD');

  if (!password) {
    if (isProtectedAdminApi) return json({ message: 'Admin authentication is not configured.' }, { status: 503 });
    if (!isAdminLogin) throw redirect(303, '/admin/login?error=not-configured');
    return resolve(event);
  }

  const expectedToken = await makeAdminSessionToken(password);
  const suppliedToken = event.cookies.get(ADMIN_COOKIE) || '';
  const isAdmin = suppliedToken === expectedToken;
  event.locals.isAdmin = isAdmin;

  if (isProtectedAdminApi && !isAdmin) return json({ message: 'Unauthorized.' }, { status: 401 });

  if (isAdminPage && !isAdminLogin && !isAdmin) {
    const next = `${pathname}${event.url.search}`;
    throw redirect(303, `/admin/login?next=${encodeURIComponent(next)}`);
  }

  if (isAdminLogin && isAdmin) {
    const next = event.url.searchParams.get('next');
    throw redirect(303, next?.startsWith('/') ? next : '/admin');
  }

  return resolve(event);
}
