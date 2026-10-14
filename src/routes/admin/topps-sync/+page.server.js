import { db } from '$lib/server/db';

const TOPPS_CHECKLISTS_URL = 'https://www.topps.com/pages/checklists';

const DISCOVERY_URLS = [
	'https://www.topps.com/pages/checklists',
	'https://www-next.topps.com/pages/checklists'
];

// Topps currently blocks some server-side requests to its checklist directory.
// These are official Topps CDN checklist links captured from the public checklist
// directory so Topps Sync remains usable even when live discovery returns 403.
const FALLBACK_2026 = [
	['2026 Bowman Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Bowman_Baseball_Checklist.pdf?v=1775743176'],
	['2026 Bowman Chrome Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Bowman_Chrome_Baseball_Checklist_1.pdf?v=1786458901'],
	['2026 Bowman Chrome Baseball Mega Box', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Bowman_Chrome_Baseball_Mega_Box_Checklist_1.pdf?v=1786458909'],
	['2026 Bowman Chrome Baseball Sapphire Edition', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Bowman_Chrome_Baseball_Sapphire_Edition_Checklist.pdf?v=1790956155'],
	['2026 Bowman Football', 'Football', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Bowman_Football_Checklist.pdf?v=1790867994'],
	['2026 Topps Allen & Ginter Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Allen_and_Ginter.pdf?v=1788875550'],
	['2026 Topps Chrome Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Chrome_Baseball_Checklist_Final_7.22.pdf?v=1785169183'],
	['2026 Topps Chrome Baseball Logofractor Edition', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Chrome_Logofractor_Checklist.pdf?v=1786996133'],
	['2026 Topps Chrome Baseball Sapphire Edition', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Chrome_Sapphire_Checklist.pdf?v=1786996122'],
	['2026 Topps Chrome Baseball Team Samurai Japan Collection', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Chrome_Samurai_Japan_Checklist_update_8.26_1.pdf?v=1787762012'],
	['2026 Topps Chrome WWE', 'Wrestling', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/FINAL_CheckList_26CWWE_ChromeWWE.pdf?v=1775658305'],
	['2026 Topps Cosmic Chrome Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Cosmic_Chrome_Baseball_-_Checklist.pdf?v=1790609925'],
	['2026 Topps Finest Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Finest_Baseball_FDI_Checklist.pdf?v=1780433969'],
	['2026 Topps Flagship Football', 'Football', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/CheckList_26TFOB_VERSION5_1.pdf?v=1786730315'],
	['2026 Topps Heritage Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/Checklist_26THBB_3.20.pdf?v=1774362662'],
	['2026 Topps Heritage Football', 'Football', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Heritage_Football_Checklist.pdf?v=1790800436'],
	['2026 Topps Holiday Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Holiday_Baseball_26THBW_-_Checklist.pdf?v=1789566977'],
	['2026 Topps Inception Football', 'Football', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Inception_Football_CheckList_26TIFB_VERSION.pdf?v=1790715925'],
	['2026 Topps Museum Collection Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Museum_Baseball_Checklist.pdf?v=1788204579'],
	['2026 Topps Series 1 Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Series_1_Baseball_Checklist_2-23.pdf?v=1772557808'],
	['2026 Topps Series 2 Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Series_2_Baseball_Checklist_5-11.pdf?v=1778521905'],
	['2026 Topps Tier One Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/CheckList_26T1BB.pdf?v=1779804529'],
	['2026 Topps Tribute Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Tribute_Baseball_Checklist_1.pdf?v=1782740369'],
	['2026 Topps Update Series Baseball', 'Baseball', 'https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2026_Topps_Update_Series_Baseball_Checklist_10-12.pdf?v=1791908509']
];

function decodeHtml(value = '') {
	return String(value)
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&reg;|&#174;/gi, '®')
		.replace(/&trade;|&#8482;/gi, '™')
		.replace(/&nbsp;|&#160;/gi, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value = '') {
	return decodeHtml(String(value).replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

function filenameFromUrl(value) {
	try {
		const url = new URL(value);
		return decodeURIComponent(url.pathname.split('/').pop() || 'topps-checklist');
	} catch {
		return 'topps-checklist';
	}
}

function extensionFromUrl(value) {
	const filename = filenameFromUrl(value).toLowerCase();
	const match = filename.match(/\.([a-z0-9]+)$/);
	return match?.[1] || '';
}

function inferYear(name) {
	const value = String(name || '');
	const season = value.match(/\b((?:19|20)\d{2})\s*[-/]\s*\d{2}\b/);
	if (season) return Number(season[1]);
	const year = value.match(/\b((?:19|20)\d{2})\b/);
	return year ? Number(year[1]) : new Date().getFullYear();
}

function inferSport(name) {
	const value = String(name || '').toLowerCase();
	if (/\bbaseball\b|\bmlb\b/.test(value)) return 'Baseball';
	if (/\bfootball\b|\bnfl\b/.test(value)) return 'Football';
	if (/\bwwe\b|\bwrestling\b/.test(value)) return 'Wrestling';
	if (/\bbasketball\b|\bnba\b|\bnbl\b|\bg[- ]?league\b/.test(value)) return 'Basketball';
	if (/\bufc\b|\bmma\b/.test(value)) return 'MMA';
	if (/\bsoccer\b|\bmls\b|\bpremier league\b|\buefa\b|\bbundesliga\b|\bmanchester united\b/.test(value)) return 'Soccer';
	if (/\bformula 1\b|\bf1\b/.test(value)) return 'Racing';
	if (/\btennis\b/.test(value)) return 'Tennis';
	return '';
}

function slugify(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 120);
}

function productDisplayName(name, year) {
	const value = String(name || '').trim();
	const yearText = String(year ?? '').trim();
	if (!value || !yearText) return value;
	const match = value.match(/^(\d{4})\s+(.+)$/);
	if (match && match[1] === yearText) return match[2].trim();
	return value;
}

function productSlug(name, year) {
	return `${year}-${slugify(productDisplayName(name, year))}`;
}

function parseChecklistLinks(html) {
	const rows = [];
	const seen = new Set();
	const anchor = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

	for (const match of html.matchAll(anchor)) {
		const href = decodeHtml(match[2]).trim();
		const name = cleanText(match[3]);
		if (!href || !name) continue;

		let url;
		try { url = new URL(href, TOPPS_CHECKLISTS_URL); }
		catch { continue; }

		if (url.hostname !== 'cdn.shopify.com') continue;

		const extension = extensionFromUrl(url.href);
		if (!['pdf', 'xls', 'xlsx'].includes(extension)) continue;
		if (seen.has(url.href)) continue;
		seen.add(url.href);

		const year = inferYear(name);
		rows.push({
			name,
			year,
			sport: inferSport(name),
			url: url.href,
			filename: filenameFromUrl(url.href),
			extension
		});
	}

	return rows;
}

function fallbackEntries() {
	return FALLBACK_2026.map(([name, sport, url]) => ({
		name,
		year: 2026,
		sport,
		url,
		filename: filenameFromUrl(url),
		extension: extensionFromUrl(url)
	}));
}

async function discoverLive(fetch) {
	const errors = [];

	for (const discoveryUrl of DISCOVERY_URLS) {
		try {
			const response = await fetch(discoveryUrl, {
				headers: {
					'accept': 'text/html,application/xhtml+xml',
					'accept-language': 'en-US,en;q=0.9',
					'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36'
				}
			});

			if (!response.ok) {
				errors.push(`${new URL(discoveryUrl).hostname}: HTTP ${response.status}`);
				continue;
			}

			const html = await response.text();
			const entries = parseChecklistLinks(html);

			if (!entries.length) {
				errors.push(`${new URL(discoveryUrl).hostname}: no checklist links found`);
				continue;
			}

			return {
				entries,
				sourceMode: 'live',
				sourceUrl: discoveryUrl,
				sourceNote: `Live Topps directory loaded from ${new URL(discoveryUrl).hostname}.`
			};
		} catch (error) {
			errors.push(`${new URL(discoveryUrl).hostname}: ${error?.message || 'fetch failed'}`);
		}
	}

	return {
		entries: fallbackEntries(),
		sourceMode: 'fallback',
		sourceUrl: TOPPS_CHECKLISTS_URL,
		sourceNote: `Topps blocked live server-side discovery (${errors.join(' · ')}). Using Setbound's verified 2026 Topps checklist catalog instead.`
	};
}

export async function load({ platform, fetch, url }) {
	const database = db(platform);

	const [sportsResult, manufacturersResult, affiliationsResult, productsResult] = await Promise.all([
		database.prepare('SELECT id, name, slug FROM sports ORDER BY sort_order, name').all(),
		database.prepare('SELECT id, name, slug FROM manufacturers ORDER BY name').all(),
		database.prepare('SELECT id, name, aliases_json FROM affiliations ORDER BY length(name) DESC').all(),
		database.prepare('SELECT id, year, name, slug FROM products ORDER BY year DESC, name').all()
	]);

	const sports = sportsResult.results || [];
	const manufacturers = manufacturersResult.results || [];
	const affiliations = (affiliationsResult.results || []).map((item) => ({
		...item,
		aliases: JSON.parse(item.aliases_json || '[]')
	}));
	const existingProducts = productsResult.results || [];

	const discovery = await discoverLive(fetch);

	const entries = discovery.entries.map((entry) => {
		const slug = productSlug(entry.name, entry.year);
		const existing = existingProducts.find((product) => product.slug === slug);

		return {
			...entry,
			suggestedSlug: slug,
			existing: existing ? {
				id: existing.id,
				year: existing.year,
				name: existing.name,
				slug: existing.slug
			} : null
		};
	});

	const requestedYear = Number(url.searchParams.get('year')) || new Date().getFullYear();

	return {
		sourceUrl: discovery.sourceUrl,
		sourceMode: discovery.sourceMode,
		sourceNote: discovery.sourceNote,
		entries,
		fetchError: '',
		requestedYear,
		sports,
		manufacturers,
		affiliations
	};
}
