import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { env } from '$env/dynamic/private';

const PARSE_BASE = 'https://api.parse.bot/scraper/79d19729-33e1-4ce6-9d65-cb0fd2477169';
const INDEX_SOURCE = 'topps-launch-index';
const META_SOURCE = 'topps-launch-metadata';
const MAX_BATCH = 8;

function safeJson(value) {
	try { return JSON.parse(value || '{}'); }
	catch { return null; }
}

function clean(value = '') {
	return String(value || '')
		.replace(/®|™/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalize(value = '') {
	const stop = new Set([
		'hobby', 'box', 'sealed', 'case', 'pre', 'order', 'preorder',
		'cards', 'card', 'trading', 'edition', 'configuration', 'display'
	]);

	return clean(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/^\s*\d{4}\s+/, '')
		.replace(/\bformula\s*1r?\b/g, 'formula 1')
		.replace(/\bbowman university\b/g, 'bowman u')
		.replace(/\bu best\b/g, 'u best')
		.replace(/\bvalue box\b/g, 'blaster')
		.replace(/\bmega box\b/g, 'mega')
		.replace(/\bjumbo box\b/g, 'jumbo')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.filter((token) => !stop.has(token))
		.join(' ')
		.trim();
}

function tokenSet(value = '') {
	return new Set(normalize(value).split(/\s+/).filter(Boolean));
}

function tokenStats(productName, launchName) {
	const aa = tokenSet(productName);
	const bb = tokenSet(launchName);
	let shared = 0;
	for (const token of aa) if (bb.has(token)) shared += 1;
	const union = new Set([...aa, ...bb]).size || 1;
	return {
		shared,
		productTokens: aa.size,
		launchTokens: bb.size,
		union,
		jaccard: shared / union,
		coverage: aa.size ? shared / aa.size : 0
	};
}

function scoreNames(productName, launchName) {
	const a = normalize(productName);
	const b = normalize(launchName);
	if (!a || !b) return 0;
	if (a === b) return 100;
	if (a.includes(b) || b.includes(a)) return 94;

	const stats = tokenStats(productName, launchName);
	return Math.round((stats.jaccard * 65) + (stats.coverage * 35));
}

function yearFrom(value = '') {
	const match = String(value).match(/\b((?:19|20)\d{2})\b/);
	return match ? Number(match[1]) : null;
}

function isCaseLaunch(launch) {
	return /\bsealed\s+case\b|\bcase\b/i.test(`${launch.product || ''} ${launch.subtitle || ''}`);
}

const DISTINGUISHERS = [
	'sapphire', 'black', 'logofractor', 'mega', 'jumbo', 'blaster',
	'breaker', 'lite', 'update', 'sterling', 'finest', 'cosmic'
];

function packagingPenalty(product, launch) {
	const p = clean(product.name).toLowerCase();
	const l = clean(`${launch.product || ''} ${launch.subtitle || ''}`).toLowerCase();
	let penalty = 0;

	for (const word of DISTINGUISHERS) {
		const pattern = new RegExp(`\\b${word}\\b`, 'i');
		if (pattern.test(p) !== pattern.test(l)) penalty += 24;
	}

	if (isCaseLaunch(launch) && !/\bcase\b/i.test(p)) penalty += 8;
	return penalty;
}

function launchLabel(launch) {
	return clean(launch.product || launch.subtitle || launch.slug || '');
}

function candidateFor(product, launch) {
	const label = launchLabel(launch);
	const launchYear = yearFrom(`${launch.product || ''} ${launch.slug || ''}`);
	if (launchYear && Number(product.year) !== launchYear) return null;

	const stats = tokenStats(product.name, label);
	let score = scoreNames(product.name, label) - packagingPenalty(product, launch);

	return {
		score,
		stats,
		launch,
		label
	};
}

function findBestLaunch(product, launches) {
	let best = null;
	for (const launch of launches) {
		const candidate = candidateFor(product, launch);
		if (!candidate) continue;
		if (!best || candidate.score > best.score) best = candidate;
	}

	if (!best) return { match: null, best: null, reason: 'No same-year launch candidate.' };

	// Strong exact-ish matches still pass at the traditional threshold. For the
	// historical backfill we also accept a slightly lower score when nearly all
	// Setbound name tokens are covered and at least three meaningful tokens agree.
	const safe =
		best.score >= 64 ||
		(best.score >= 56 && best.stats.shared >= 3 && best.stats.coverage >= 0.8);

	if (!safe) {
		return {
			match: null,
			best,
			reason: `Best candidate scored ${best.score}; coverage ${Math.round(best.stats.coverage * 100)}%.`
		};
	}

	return { match: best, best, reason: '' };
}

function parsePayload(payload) {
	return payload?.data ?? payload;
}

function overviewFromDescription(value = '') {
	const lines = String(value || '')
		.replace(/\r/g, '')
		.split(/\n+/)
		.map((line) => clean(line))
		.filter(Boolean)
		.filter((line) => !/^\d+\s+cards?\s+per\s+pack/i.test(line))
		.filter((line) => !/^\d+\s+packs?\s+per\s+box/i.test(line))
		.filter((line) => !/^\d+\s+(?:chrome\s+)?autographs?\s+per\s+box/i.test(line))
		.filter((line) => !/^download\s+(?:checklist|odds)/i.test(line))
		.filter((line) => !/^sku\s*:/i.test(line))
		.filter((line) => !/^ships?\s+in\b/i.test(line));

	return lines.join(' ').replace(/\s+/g, ' ').trim();
}

async function parseFetch(fetch, endpoint, apiKey, params = {}) {
	const url = new URL(`${PARSE_BASE}/${endpoint}`);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, {
		headers: { 'X-API-Key': apiKey, accept: 'application/json' }
	});
	let payload = null;
	try { payload = await response.json(); } catch {}
	if (!response.ok) {
		throw new Error(payload?.message || payload?.error || `Parse.bot returned HTTP ${response.status}.`);
	}
	if (payload?.status && payload.status !== 'success') {
		throw new Error(payload?.message || payload?.error || `Parse.bot returned ${payload.status}.`);
	}
	return payload;
}

async function cachedLaunchIndex(database) {
	const rows = await database.prepare(`
		SELECT entry_json
		FROM source_harvester_cache
		WHERE source = ?
	`).bind(INDEX_SOURCE).all();
	return (rows.results || []).map((row) => safeJson(row.entry_json)).filter(Boolean);
}

async function refreshLaunchIndex(database, fetch, apiKey) {
	const launches = [];
	for (let page = 1; page <= 10; page++) {
		const payload = await parseFetch(fetch, 'list_launches', apiKey, {
			page,
			page_size: 100,
			status: 'all'
		});
		const data = parsePayload(payload) || {};
		const rows = Array.isArray(data.launches) ? data.launches : [];
		launches.push(...rows);
		if (!data.has_more || !rows.length) break;
	}

	if (!launches.length) throw new Error('Parse.bot returned no Topps launches.');

	for (let index = 0; index < launches.length; index += 75) {
		const statements = launches.slice(index, index + 75).map((launch) => {
			const key = `parsebot:topps-launch:${launch.slug}`;
			return database.prepare(`
				INSERT INTO source_harvester_cache
					(page_url, source, year, title, entry_json, scanned_at, updated_at)
				VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
				ON CONFLICT(page_url) DO UPDATE SET
					source = excluded.source,
					year = excluded.year,
					title = excluded.title,
					entry_json = excluded.entry_json,
					scanned_at = datetime('now'),
					updated_at = datetime('now')
			`).bind(
				key,
				INDEX_SOURCE,
				yearFrom(launch.product || launch.slug || '') || null,
				clean(launch.product || launch.slug || ''),
				JSON.stringify(launch)
			);
		});
		await database.batch(statements);
	}

	return launches;
}

async function existingMetadata(database, productId) {
	const rows = await database.prepare(`
		SELECT entry_json
		FROM source_harvester_cache
		WHERE source = ?
	`).bind(META_SOURCE).all();

	for (const row of rows.results || []) {
		const entry = safeJson(row.entry_json);
		if (Number(entry?.productId) === Number(productId) && entry?.overview) return entry;
	}
	return null;
}

async function saveMetadata(database, product, match, detail) {
	const launch = match.launch;
	const overview = overviewFromDescription(detail.description || detail.extra_description || '');
	if (!overview) throw new Error('Matched launch did not contain usable description text.');

	const metadata = {
		productId: product.id,
		productSlug: product.slug,
		productName: product.name,
		productYear: Number(product.year),
		source: 'Topps Launches',
		sourceUrl: detail.launch_url || launch.launch_url || null,
		launchSlug: detail.slug || launch.slug,
		launchProduct: detail.product || launch.product || '',
		matchScore: match.score,
		overview,
		imageUrl: detail.image_url || launch.image_url || null,
		listingDate: detail.listing_date || launch.listing_date || null,
		start: detail.start || launch.start || null,
		sku: detail.sku || launch.sku || null
	};

	const pageUrl = metadata.sourceUrl || `parsebot:topps-launch-metadata:${product.id}`;
	await database.prepare(`
		INSERT INTO source_harvester_cache
			(page_url, source, year, title, entry_json, scanned_at, updated_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
		ON CONFLICT(page_url) DO UPDATE SET
			source = excluded.source,
			year = excluded.year,
			title = excluded.title,
			entry_json = excluded.entry_json,
			scanned_at = datetime('now'),
			updated_at = datetime('now')
	`).bind(
		pageUrl,
		META_SOURCE,
		Number(product.year),
		product.name,
		JSON.stringify(metadata)
	).run();

	return metadata;
}

export async function POST({ request, platform, fetch }) {
	const database = db(platform);
	const apiKey = String(platform?.env?.PARSE_API_KEY || env.PARSE_API_KEY || '').trim();
	if (!apiKey) {
		return json({
			message: 'PARSE_API_KEY is not configured. Add the free Parse.bot API key to Cloudflare first.',
			code: 'PARSE_API_KEY_MISSING'
		}, { status: 400 });
	}

	let body = {};
	try { body = await request.json(); } catch {}
	const mode = String(body.mode || 'backfill');

	if (mode === 'index') {
		try {
			const launches = await refreshLaunchIndex(database, fetch, apiKey);
			return json({ ok: true, launchCount: launches.length });
		} catch (error) {
			return json({ message: error?.message || 'Could not refresh Topps launch index.' }, { status: 502 });
		}
	}

	const ids = Array.isArray(body.productIds)
		? [...new Set(body.productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_BATCH)
		: [];

	if (!ids.length) return json({ message: 'Choose at least one product.' }, { status: 400 });

	let launches = await cachedLaunchIndex(database);
	if (!launches.length) {
		try { launches = await refreshLaunchIndex(database, fetch, apiKey); }
		catch (error) { return json({ message: error?.message || 'Could not load Topps launch index.' }, { status: 502 }); }
	}

	const placeholders = ids.map(() => '?').join(',');
	const rows = await database.prepare(`
		SELECT p.id, p.slug, p.year, p.name, m.name AS manufacturer_name
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		WHERE p.id IN (${placeholders})
	`).bind(...ids).all();

	const results = [];

	for (const product of rows.results || []) {
		if (String(product.manufacturer_name || '').toLowerCase() !== 'topps') {
			results.push({ productId: product.id, status: 'skipped', reason: 'Not a Topps product.' });
			continue;
		}

		const cached = await existingMetadata(database, product.id);
		if (cached) {
			results.push({ productId: product.id, status: 'cached', score: cached.matchScore || null, sourceUrl: cached.sourceUrl || null });
			continue;
		}

		const resolution = findBestLaunch(product, launches);
		const match = resolution.match;
		if (!match) {
			results.push({
				productId: product.id,
				status: 'unmatched',
				reason: resolution.reason || 'No safe launch match.',
				candidate: resolution.best ? {
					product: resolution.best.label,
					slug: resolution.best.launch?.slug || null,
					score: resolution.best.score,
					sharedTokens: resolution.best.stats.shared,
					coverage: Math.round(resolution.best.stats.coverage * 100)
				} : null
			});
			continue;
		}

		try {
			const payload = await parseFetch(fetch, 'get_launch', apiKey, { slug: match.launch.slug });
			const detail = parsePayload(payload) || {};
			const metadata = await saveMetadata(database, product, match, detail);
			results.push({
				productId: product.id,
				status: 'harvested',
				score: match.score,
				matchedProduct: match.label,
				sourceUrl: metadata.sourceUrl
			});
		} catch (error) {
			results.push({
				productId: product.id,
				status: 'failed',
				reason: error?.message || 'Launch detail failed.',
				candidate: {
					product: match.label,
					slug: match.launch?.slug || null,
					score: match.score
				}
			});
		}
	}

	return json({ ok: true, results });
}
