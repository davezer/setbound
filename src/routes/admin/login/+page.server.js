import { fail, redirect } from '@sveltejs/kit';
import { makeAdminSessionToken } from '../../../hooks.server.js';

const ADMIN_COOKIE = 'setbound_admin';

function getPrivateEnv(platform, name) {
	const cloudflareValue = platform?.env?.[name];
	if (cloudflareValue) return String(cloudflareValue);

	if (typeof process !== 'undefined' && process?.env?.[name]) {
		return String(process.env[name]);
	}

	return '';
}

function safeNext(value) {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
		? value
		: '/admin/import';
}

export function load({ url }) {
	return {
		next: safeNext(url.searchParams.get('next')),
		notConfigured: url.searchParams.get('error') === 'not-configured'
	};
}

export const actions = {
	default: async ({ request, cookies, platform }) => {
		const form = await request.formData();
		const submittedPassword = String(form.get('password') || '');
		const next = safeNext(String(form.get('next') || '/admin/import'));
		const adminPassword = getPrivateEnv(platform, 'ADMIN_PASSWORD');

		if (!adminPassword) {
			return fail(503, {
				next,
				error: 'Admin authentication has not been configured yet.'
			});
		}

		if (!submittedPassword || submittedPassword !== adminPassword) {
			return fail(400, {
				next,
				error: 'Incorrect password.'
			});
		}

		const token = await makeAdminSessionToken(adminPassword);

		cookies.set(ADMIN_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: !platform ? false : true,
			maxAge: 60 * 60 * 12
		});

		throw redirect(303, next);
	}
};
