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
		.replace(/^\s*\d{4}(?:[-–]\d{2})?\s+/, '')
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


const HARD_VARIANTS = [
  'sapphire', 'black', 'logofractor', 'cosmic', 'galaxy', 'pristine',
  'finest', 'sterling', 'midnight', 'definitive', 'dynasty', 'museum',
  'heritage', 'inception', 'tribute', 'gilded', 'chrome', 'paper',
  'series 1', 'series 2', 'update'
];

function hasPhrase(value, phrase) {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return new RegExp('(?:^|\\\\s)' + target.replace(/\\\\s+/g, '\\\\s+') + '(?:$|\\\\s)', 'i').test(normalized);
}

function hardVariantConflict(productName, launchName) {
  for (const variant of HARD_VARIANTS) {
    if (hasPhrase(productName, variant) !== hasPhrase(launchName, variant)) return variant;
  }
  return null;
}

function identityTokens(value = '') {
  const generic = new Set([
    'topps', 'bowman', 'baseball', 'basketball', 'football', 'soccer', 'hockey',
    'racing', 'cards', 'card', 'trading', 'hobby', 'box', 'sealed', 'case',
    'pre', 'order', 'preorder', 'edition', 'configuration', 'display', 'mega',
    'jumbo', 'blaster', 'breaker', 'lite'
  ]);
  return new Set(
    normalize(value)
      .split(/\\s+/)
      .filter(Boolean)
      .filter((token) => !generic.has(token))
  );
}

function hasIdentityOverlap(productName, launchName) {
  const a = identityTokens(productName);
  const b = identityTokens(launchName);
  if (!a.size || !b.size) return true;
  for (const token of a) if (b.has(token)) return true;
  return false;
}

function safeCachedLaunch(product, entry) {
  const launchName = entry?.launchProduct || entry?.matchedProduct || '';
  if (!launchName) return false;
  if (hardVariantConflict(product.name, launchName)) return false;
  if (!hasIdentityOverlap(product.name, launchName)) return false;
  const stats = tokenStats(product.name, launchName);
  const score = scoreNames(product.name, launchName);
  return score >= 64 || (score >= 56 && stats.shared >= 3 && stats.coverage >= 0.8);
}

function stripToppsLegalCopy(value = '') {
  let text = String(value || '').replace(/\\r/g, '').trim();
  const legal = /\\b(?:all sales are final|art subject to change|not responsible for (?:typographical|printing|printer) errors?|product(?:s)? subject to change|images? subject to change)\\b/i;
  const match = text.match(legal);
  if (match?.index >= 0) text = text.slice(0, match.index).trim();
  return text
    .replace(/\\s+/g, ' ')
    .replace(/\\s+([,.;!?])/g, '$1')
    .trim();
}

function candidateFor(product, launch) {
  const label = launchLabel(launch);
  const launchYear = yearFrom(
    (launch.product || '') + ' ' + (launch.slug || '')
  );
  if (launchYear && Number(product.year) !== launchYear) return null;

  // A sibling product is not the same product. These are hard blockers, not
  // score penalties: Chrome != Sapphire, Chrome != Black, Hoops != Pristine, etc.
  const variantConflict = hardVariantConflict(product.name, label);
  if (variantConflict) return null;
  if (!hasIdentityOverlap(product.name, label)) return null;

  const stats = tokenStats(product.name, label);
  const score = scoreNames(product.name, label) - packagingPenalty(product, launch);

  return { score, stats, launch, label };
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
    .replace(/\\r/g, '')
    .split(/\\n+/)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !/^\\d+\\s+cards?\\s+per\\s+pack/i.test(line))
    .filter((line) => !/^\\d+\\s+packs?\\s+per\\s+box/i.test(line))
    .filter((line) => !/^\\d+\\s+(?:chrome\\s+)?autographs?\\s+per\\s+box/i.test(line))
    .filter((line) => !/^download\\s+(?:checklist|odds)/i.test(line))
    .filter((line) => !/^sku\\s*:/i.test(line))
    .filter((line) => !/^ships?\\s+in\\b/i.test(line));

  return stripToppsLegalCopy(lines.join(' '));
}

function errorText(value, fallback = 'Unknown error.') {
	if (!value) return fallback;
	if (typeof value === 'string') return value;
	if (value instanceof Error) return value.message || fallback;
	try {
		if (typeof value.message === 'string') return value.message;
		if (typeof value.error === 'string') return value.error;
		if (value.error && typeof value.error.message === 'string') return value.error.message;
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function decodeHtmlEntities(value = '') {
	return String(value)
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&nbsp;|&#160;/gi, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlToLines(html = '') {
	const text = decodeHtmlEntities(String(html)
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, ' '));
	return text.split(/\n+/).map((line) => clean(line)).filter(Boolean);
}

function extractToppsLaunchDescription(html = '', expectedName = '') {
	const lines = htmlToLines(html);
	if (!lines.length) return '';
	const endIndex = lines.findIndex((line) => /^(?:download checklist|download odds|sku\s*:)/i.test(line));
	const working = endIndex >= 0 ? lines.slice(0, endIndex) : lines;
	let startIndex = working.findIndex((line) => /\b\d+\s+packs?\s+per\s+box\b/i.test(line) || /\b\d+\s+cards?\s+per\s+pack\b/i.test(line));
	if (startIndex < 0) startIndex = working.findIndex((line) => /^featuring\b/i.test(line) || /^look out\b/i.test(line) || /^(?:19|20)\d{2}\s+(?:topps|bowman)\b/i.test(line));
	if (startIndex < 0 && expectedName) {
		const expected = normalize(expectedName);
		startIndex = working.findIndex((line) => normalize(line) === expected);
		if (startIndex >= 0) startIndex += 1;
	}
	if (startIndex < 0) return '';
	const boilerplate = [/^how do eql launches work\??$/i,/^free to enter$/i,/^one entry per person$/i,/^no bots$/i,/^the eqlizer$/i,/^read the faqs/i,/^maximum of \d+ per customer$/i,/^(?:us\$|\$)\d/i];
	const out=[]; const seen=new Set();
	for (const line of working.slice(startIndex)) {
		if (boilerplate.some((pattern)=>pattern.test(line))) continue;
		if (expectedName && normalize(line) === normalize(expectedName)) continue;
		const key=normalize(line); if (!key || seen.has(key)) continue;
		seen.add(key); out.push(line); if (out.length >= 12) break;
	}
	return out.join('\n').trim();
}

async function fetchToppsLaunchDirect(fetch, launch) {
	const slug = String(launch?.slug || '').trim();
	if (!slug) throw new Error('Matched launch did not include a slug.');
	const launchUrl = `https://launches.topps.com/en-US/launch/${encodeURIComponent(slug)}`;
	const response = await fetch(launchUrl, { headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36' } });
	if (!response.ok) throw new Error(`Topps launch page returned HTTP ${response.status}.`);
	const html = await response.text();
	const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	const title = titleMatch ? clean(decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ' '))) : clean(launch.product || '');
	if (title && launch.product) {
		const pageScore = scoreNames(launch.product, title);
		if (pageScore < 55) throw new Error(`Topps page title did not safely match cached launch (${pageScore}% match).`);
	}
	const description = extractToppsLaunchDescription(html, title || launch.product || '');
	if (!description) throw new Error('Topps launch page loaded, but no usable product description was found.');
	const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
	return { slug, product: title || launch.product || '', description, launch_url: launchUrl, image_url: imageMatch ? decodeHtmlEntities(imageMatch[1]) : (launch.image_url || null), sku: launch.sku || null, listing_date: launch.listing_date || null, start: launch.start || null };
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
		throw new Error(errorText(payload?.message || payload?.error || payload, `Parse.bot returned HTTP ${response.status}.`));
	}
	if (payload?.status && payload.status !== 'success') {
		throw new Error(errorText(payload?.message || payload?.error || payload, `Parse.bot returned ${payload.status}.`));
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

async function existingMetadata(database, product) {
  const rows = await database.prepare(`
    SELECT page_url, entry_json
    FROM source_harvester_cache
    WHERE source = ?
  `).bind(META_SOURCE).all();

  for (const row of rows.results || []) {
    const entry = safeJson(row.entry_json);
    if (Number(entry?.productId) !== Number(product.id) || !entry?.overview) continue;

    if (safeCachedLaunch(product, entry)) return entry;

    // Remove old false-positive cache entries created by the looser matcher.
    await database.prepare(
      'DELETE FROM source_harvester_cache WHERE source = ? AND page_url = ?'
    ).bind(META_SOURCE, row.page_url).run();
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

	let body = {};
	try { body = await request.json(); } catch {}
	const mode = String(body.mode || 'backfill');

	// Parse.bot is optional now. Product detail pages are fetched directly from Topps.
	if (mode === 'index' && !apiKey) {
		const cached = await cachedLaunchIndex(database);
		if (cached.length) return json({ ok: true, launchCount: cached.length, cached: true });
		return json({ message: 'No cached Topps launch index exists and PARSE_API_KEY is not configured.', code: 'TOPPS_INDEX_MISSING' }, { status: 400 });
	}

	if (mode === 'index') {
		try {
			const forceRefresh = body.forceRefresh === true;
			let launches = forceRefresh ? [] : await cachedLaunchIndex(database);
			let cached = launches.length > 0;

			if (!launches.length) {
				launches = await refreshLaunchIndex(database, fetch, apiKey);
				cached = false;
			}

			return json({ ok: true, launchCount: launches.length, cached });
		} catch (error) {
			return json({ message: errorText(error, 'Could not load Topps launch index.') }, { status: 502 });
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

		const cached = await existingMetadata(database, product);
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
			const detail = await fetchToppsLaunchDirect(fetch, match.launch);
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
