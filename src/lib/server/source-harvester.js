const CHECKLIST_INSIDER = 'https://www.checklistinsider.com';
const TOPPS_ARCHIVES = [
	'https://in.topps.com/pages/checklists',
	'https://in-next.topps.com/pages/checklists',
	'https://www.topps.com/pages/checklists'
];

export function decodeHtml(value = '') {
	return String(value)
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;|&#160;/gi, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function cleanText(value = '') {
	return decodeHtml(String(value).replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

export function inferYear(name) {
	const value = String(name || '');
	const season = value.match(/\b((?:19|20)\d{2})\s*[-/]\s*\d{2}\b/);
	if (season) return Number(season[1]);

	const year = value.match(/\b((?:19|20)\d{2})\b/);
	return year ? Number(year[1]) : null;
}

export function inferSport(name) {
	const value = String(name || '').toLowerCase();

	if (/\bbaseball\b|\bmlb\b/.test(value)) return 'Baseball';
	if (/\bfootball\b|\bnfl\b/.test(value)) return 'Football';
	if (/\bwwe\b|\bwrestling\b/.test(value)) return 'Wrestling';
	if (/\bbasketball\b|\bnba\b|\bwnba\b|\bnbl\b|\bg[- ]?league\b/.test(value)) return 'Basketball';
	if (/\bufc\b|\bmma\b/.test(value)) return 'MMA';
	if (/\bsoccer\b|\bmls\b|\bpremier league\b|\buefa\b|\bbundesliga\b|\bchampions league\b/.test(value)) return 'Soccer';
	if (/\bformula 1\b|\bf1\b|\bracing\b/.test(value)) return 'Racing';
	if (/\bhockey\b|\bnhl\b/.test(value)) return 'Hockey';
	if (/\btennis\b/.test(value)) return 'Tennis';

	return '';
}

export function inferManufacturer(name) {
	const value = String(name || '').toLowerCase();
	if (/\btopps\b|\bbowman\b/.test(value)) return 'Topps';
	if (/\bpanini\b|\bdonruss\b|\bprizm\b|\bselect\b|\bscore\b|\bcontenders\b/.test(value)) return 'Panini';
	if (/\bupper deck\b|\bo-pee-chee\b|\bskybox\b|\bmetal universe\b/.test(value)) return 'Upper Deck';
	if (/\bleaf\b/.test(value)) return 'Leaf';
	return '';
}

export function slugify(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 120);
}

export function productDisplayName(name, year) {
	const value = String(name || '').trim();
	const yearText = String(year ?? '').trim();
	if (!value || !yearText) return value;

	const match = value.match(/^(\d{4})\s+(.+)$/);
	if (match && match[1] === yearText) return match[2].trim();

	return value;
}

export function productSlug(name, year) {
	return `${year}-${slugify(productDisplayName(name, year))}`;
}

export function filenameFromUrl(value) {
	try {
		const url = new URL(value);
		return decodeURIComponent(url.pathname.split('/').pop() || 'download');
	} catch {
		return 'download';
	}
}

export function extensionFromUrl(value) {
	const filename = filenameFromUrl(value).toLowerCase();
	const match = filename.match(/\.([a-z0-9]+)$/);
	return match?.[1] || '';
}

function absoluteUrl(href, base) {
	try { return new URL(decodeHtml(href), base).href; }
	catch { return null; }
}

export function parseToppsArchive(html, baseUrl) {
	const found = [];
	const seen = new Set();
	const anchor = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

	for (const match of html.matchAll(anchor)) {
		const name = cleanText(match[3]);
		const url = absoluteUrl(match[2], baseUrl);
		if (!name || !url) continue;

		const ext = extensionFromUrl(url);
		if (!['pdf', 'xls', 'xlsx'].includes(ext)) continue;

		const year = inferYear(name);
		if (!year || year < 2018) continue;

		if (seen.has(url)) continue;
		seen.add(url);

		found.push({
			source: 'Topps',
			pageUrl: baseUrl,
			name,
			year,
			sport: inferSport(name),
			manufacturer: 'Topps',
			checklistUrl: url,
			checklistFilename: filenameFromUrl(url),
			checklistExtension: ext,
			oddsUrl: null,
			oddsFilename: null
		});
	}

	return found;
}

function titleFromHtml(html) {
	const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	if (h1) return cleanText(h1[1]).replace(/\s+Checklist Guide.*$/i, '').trim();

	const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	return title ? cleanText(title[1]).replace(/\s+Checklist.*$/i, '').trim() : '';
}

export function parseChecklistInsiderPage(html, pageUrl) {
	const title = titleFromHtml(html);
	const name = title || cleanText(pageUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || '');
	const year = inferYear(name);

	const files = [];
	const seen = new Set();
	const anchor = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

	for (const match of html.matchAll(anchor)) {
		const label = cleanText(match[3]).toLowerCase();
		const url = absoluteUrl(match[2], pageUrl);
		if (!url) continue;

		let host = '';
		try { host = new URL(url).hostname; } catch { continue; }

		if (host !== 'xcdn.checklistinsider.com') continue;

		const ext = extensionFromUrl(url);
		if (!['pdf', 'xls', 'xlsx'].includes(ext)) continue;
		if (seen.has(url)) continue;
		seen.add(url);

		files.push({
			url,
			label,
			filename: filenameFromUrl(url),
			extension: ext
		});
	}

	const checklist = files.find((file) =>
		/xls|xlsx/.test(file.extension) ||
		/checklist|excel|spreadsheet/.test(file.label)
	);

	const odds = files.find((file) =>
		file.extension === 'pdf' &&
		/odds/.test(`${file.label} ${file.filename}`.toLowerCase())
	);

	// Some older CI pages expose only a PDF checklist, not Excel.
	const fallbackChecklist = checklist || files.find((file) =>
		file.extension === 'pdf' &&
		!/odds/.test(`${file.label} ${file.filename}`.toLowerCase())
	);

	return {
		source: 'Checklist Insider',
		pageUrl,
		name,
		year,
		sport: inferSport(name),
		manufacturer: inferManufacturer(name),
		checklistUrl: fallbackChecklist?.url || null,
		checklistFilename: fallbackChecklist?.filename || null,
		checklistExtension: fallbackChecklist?.extension || null,
		oddsUrl: odds?.url || null,
		oddsFilename: odds?.filename || null
	};
}

export async function discoverTopps(fetch) {
	const errors = [];

	for (const url of TOPPS_ARCHIVES) {
		try {
			const response = await fetch(url, {
				headers: {
					'accept': 'text/html,application/xhtml+xml',
					'accept-language': 'en-US,en;q=0.9',
					'user-agent': 'Mozilla/5.0 Setbound/1.0'
				}
			});

			if (!response.ok) {
				errors.push(`${new URL(url).hostname}: HTTP ${response.status}`);
				continue;
			}

			const html = await response.text();
			const entries = parseToppsArchive(html, url);

			if (entries.length) {
				return {
					entries,
					sourceUrl: url,
					note: `Loaded ${entries.length} official Topps checklist files.`
				};
			}

			errors.push(`${new URL(url).hostname}: no downloadable checklist links found`);
		} catch (error) {
			errors.push(`${new URL(url).hostname}: ${error?.message || 'fetch failed'}`);
		}
	}

	return {
		entries: [],
		sourceUrl: TOPPS_ARCHIVES[0],
		note: `Topps archive discovery failed: ${errors.join(' · ')}`
	};
}

async function tryChecklistInsiderRest(fetch, page = 1, perPage = 100, search = '') {
	const searchPart = search ? `&search=${encodeURIComponent(search)}` : '';
	const url = `${CHECKLIST_INSIDER}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=link,date,slug,title${searchPart}`;
	const response = await fetch(url, {
		headers: {
			'accept': 'application/json',
			'user-agent': 'Mozilla/5.0 Setbound/1.0'
		}
	});

	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const rows = await response.json();
	const totalPages = Number(response.headers.get('x-wp-totalpages') || page);

	return {
		urls: (Array.isArray(rows) ? rows : [])
			.map((row) => ({
				url: row.link,
				title: cleanText(row.title?.rendered || ''),
				date: row.date || ''
			}))
			.filter((row) => row.url),
		totalPages
	};
}

function parseLocs(xml = '') {
	return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
		.map((match) => decodeHtml(match[1]).trim())
		.filter(Boolean);
}

async function tryChecklistInsiderSitemaps(fetch) {
	const roots = [
		`${CHECKLIST_INSIDER}/wp-sitemap.xml`,
		`${CHECKLIST_INSIDER}/sitemap_index.xml`
	];

	for (const root of roots) {
		try {
			const response = await fetch(root, {
				headers: { 'user-agent': 'Mozilla/5.0 Setbound/1.0' }
			});

			if (!response.ok) continue;

			const xml = await response.text();
			const locs = parseLocs(xml);
			if (!locs.length) continue;

			const childSitemaps = locs.filter((url) => /\.xml(?:$|\?)/i.test(url));
			const articleUrls = locs.filter((url) => !/\.xml(?:$|\?)/i.test(url));

			for (const sitemapUrl of childSitemaps.slice(0, 50)) {
				if (!/post|posts/i.test(sitemapUrl)) continue;

				try {
					const childResponse = await fetch(sitemapUrl, {
						headers: { 'user-agent': 'Mozilla/5.0 Setbound/1.0' }
					});
					if (!childResponse.ok) continue;
					articleUrls.push(...parseLocs(await childResponse.text()));
				} catch {
					// Keep going; one broken child sitemap should not kill discovery.
				}
			}

			const unique = [...new Set(articleUrls)]
				.filter((url) => url.startsWith(`${CHECKLIST_INSIDER}/`))
				.filter((url) => !/\/(?:about|contact|privacy|terms|category|tag|author)\b/i.test(url));

			if (unique.length) return unique;
		} catch {
			// Try the next sitemap root.
		}
	}

	return [];
}

export async function discoverChecklistInsiderUrls(fetch, maxPages = 20, search = '') {
	const urls = [];
	let restError = '';

	try {
		const first = await tryChecklistInsiderRest(fetch, 1, 100, search);
		urls.push(...first.urls);

		const pages = Math.min(first.totalPages, maxPages);

		for (let page = 2; page <= pages; page++) {
			const result = await tryChecklistInsiderRest(fetch, page, 100, search);
			urls.push(...result.urls);
		}

		if (urls.length) {
			return {
				urls: [...new Map(urls.map((item) => [item.url, item])).values()],
				mode: 'wordpress-rest',
				note: `Discovered ${urls.length} Checklist Insider article URLs through its public WordPress index.`
			};
		}
	} catch (error) {
		restError = error?.message || 'REST discovery failed';
	}

	const sitemapUrls = await tryChecklistInsiderSitemaps(fetch);

	return {
		urls: sitemapUrls.map((url) => ({ url, title: '', date: '' })),
		mode: sitemapUrls.length ? 'sitemap' : 'failed',
		note: sitemapUrls.length
			? `WordPress REST was unavailable (${restError}); discovered ${sitemapUrls.length} URLs through the sitemap instead.`
			: `Checklist Insider discovery failed. WordPress REST: ${restError || 'no results'}; sitemap: no usable URLs.`
	};
}

export function allowedDownloadUrl(value) {
	let url;
	try { url = new URL(value); }
	catch { return null; }

	if (url.protocol !== 'https:') return null;

	const allowed = new Set([
		'cdn.shopify.com',
		'xcdn.checklistinsider.com'
	]);

	return allowed.has(url.hostname) ? url : null;
}

export function allowedArticleUrl(value) {
	let url;
	try { url = new URL(value); }
	catch { return null; }

	if (url.protocol !== 'https:') return null;
	return url.hostname === 'www.checklistinsider.com' ? url : null;
}
