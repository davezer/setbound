export const SITE_URL = 'https://setbound.app';
export const SITE_NAME = 'Setbound';

export function absoluteUrl(path = '/') {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `${SITE_URL}${normalized}`;
}

export function metaDescription(value, fallback = '') {
	const clean = String(value || fallback || '')
		.replace(/\s+/g, ' ')
		.trim();

	if (clean.length <= 158) return clean;
	return `${clean.slice(0, 155).trimEnd()}…`;
}

export function safeJsonLd(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}
