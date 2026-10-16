import { cleanText, decodeHtml } from '$lib/server/source-harvester.js';

function absoluteUrl(value, baseUrl) {
	try { return new URL(decodeHtml(value), baseUrl).href; }
	catch { return null; }
}

function attribute(tag, name) {
	const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
	return tag.match(pattern)?.[2] || '';
}

function stripScripts(value = '') {
	return String(value)
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
}

function textLines(html = '') {
	return decodeHtml(
		stripScripts(html)
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n')
			.replace(/<\/li>/gi, '\n')
			.replace(/<\/div>/gi, '\n')
			.replace(/<\/h[1-6]>/gi, '\n')
			.replace(/<li\b[^>]*>/gi, '• ')
			.replace(/<[^>]+>/g, ' ')
	)
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function titleFromHtml(html) {
	const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	return h1 ? cleanText(h1[1]).replace(/\s+Checklist Guide.*$/i, '').replace(/\s+Guide$/i, '').trim() : '';
}

function parseReleaseDate(html) {
	const lines = textLines(html);
	const matches = [];

	for (const line of lines) {
		const direct = line.match(/(?:Estimated )?Release Date:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/i);
		if (direct?.[1]) matches.push(direct[1]);

		const variant = line.match(/(?:Hobby|FDI|Wave \d+)\s*[-–]\s*([A-Z][a-z]+ \d{1,2}, \d{4})/i);
		if (variant?.[1]) matches.push(variant[1]);
	}

	if (!matches.length) return null;

	// For split release dates, use the earliest date as the product release date.
	const parsed = matches
		.map((value) => new Date(`${value} 12:00:00 UTC`))
		.filter((date) => !Number.isNaN(date.getTime()))
		.sort((a, b) => a - b);

	return parsed.length ? parsed[0].toISOString().slice(0, 10) : null;
}

function isSectionHeading(line, phrase) {
	return String(line || '').toLowerCase().includes(String(phrase).toLowerCase());
}

function extractSectionLines(lines, startPhrase, stopPhrases) {
	const start = lines.findIndex((line) => isSectionHeading(line, startPhrase));
	if (start < 0) return [];

	const output = [];

	for (let index = start + 1; index < lines.length; index++) {
		const line = lines[index];

		if (stopPhrases.some((phrase) => isSectionHeading(line, phrase))) break;
		if (/^(?:Checklist Insider Editor|Brands)$/i.test(line)) continue;
		if (/clicking any links|earning a commission/i.test(line)) continue;

		output.push(line);
	}

	return output;
}

function normalizeFormatName(value = '') {
	return String(value)
		.replace(/\u00a0/g, ' ')
		.replace(/\bbox(es)?\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function looksLikeFormatHeading(line) {
	const value = String(line || '').replace(/^•\s*/, '').trim();

	if (!value || value.length > 90) return false;
	if (/cards? per|packs? per|boxes? per|total cards|autograph|parallel|relic|memorabilia/i.test(value)) return false;

	return /\b(?:hobby|jumbo|breaker|delight|blaster|value|mega|retail|fat pack|hanger|collector|tin|fdi|display|super box|bulk pack|floor display)\b/i.test(value);
}

function formatKey(label = '') {
	const value = label.toLowerCase();

	if (/breaker/.test(value)) return 'breaker';
	if (/blaster|value/.test(value)) return 'blaster';
	if (/mega/.test(value)) return 'mega';
	if (/jumbo/.test(value)) return 'jumbo';
	if (/retail|display|super box|bulk pack|floor display|fdi/.test(value)) return 'retail';
	if (/fat pack/.test(value)) return 'fat_pack';
	if (/hanger/.test(value)) return 'hanger';
	if (/collector|tin/.test(value)) return 'collector';

	return 'hobby';
}

function formatLabel(key) {
	const labels = {
		hobby: 'Hobby Box Breakdown',
		breaker: 'Breaker / Breaker Delight Breakdown',
		blaster: 'Blaster / Value Box Breakdown',
		mega: 'Mega Box Breakdown',
		jumbo: 'Jumbo Box Breakdown',
		retail: 'Retail Box Breakdown',
		fat_pack: 'Fat Pack Breakdown',
		hanger: 'Hanger Box Breakdown',
		collector: 'Collector / Tin Breakdown'
	};

	return labels[key] || 'Product Breakdown';
}

function parseSectionBlocks(lines) {
	const blocks = [];
	let current = null;

	for (const rawLine of lines) {
		const line = String(rawLine || '').replace(/^•\s*/, '').trim();
		if (!line) continue;

		if (looksLikeFormatHeading(line)) {
			current = { sourceLabel: line, details: [] };
			blocks.push(current);
			continue;
		}

		if (!current) {
			// Some pages have a single unnamed configuration list.
			current = { sourceLabel: 'Hobby Boxes', details: [] };
			blocks.push(current);
		}

		if (!/^(?:buy|order|view)\b/i.test(line)) current.details.push(line);
	}

	return blocks.filter((block) => block.details.length);
}

function parseFormatBlocks(html) {
	const lines = textLines(html);

	const configuration = extractSectionLines(
		lines,
		'Product Configuration',
		['Box Break', 'Buy ', 'Checklist', 'Team Lists', 'Downloads']
	);

	const boxBreak = extractSectionLines(
		lines,
		'Box Break',
		['Buy ', 'Checklist', 'Team Lists', 'Downloads']
	);

	const configBlocks = parseSectionBlocks(configuration);
	const breakBlocks = parseSectionBlocks(boxBreak);

	const normalizedKey = (value) =>
		normalizeFormatName(value)
			.toLowerCase()
			.replace(/\b(?:orange\/red|green\/blue|mlb x nba|mlb x nfl)\b/gi, '')
			.replace(/\s+/g, ' ')
			.trim();

	const merged = new Map();

	const addBlock = (block, source) => {
		const matchKey = normalizedKey(block.sourceLabel);
		const existing = [...merged.values()].find((candidate) =>
			normalizedKey(candidate.sourceLabel) === matchKey
		);

		const target = existing || {
			sourceLabel: block.sourceLabel,
			config: [],
			break: []
		};

		target[source].push(...block.details);

		if (!existing) merged.set(`${matchKey}:${merged.size}`, target);
	};

	for (const block of configBlocks) addBlock(block, 'config');
	for (const block of breakBlocks) addBlock(block, 'break');

	const keyed = new Map();

	for (const block of merged.values()) {
		const details = [
			...block.config,
			...block.break
		]
			.map((line) => line.replace(/\s+/g, ' ').trim())
			.filter(Boolean);

		const unique = [...new Set(details)];
		if (!unique.length) continue;

		const key = formatKey(block.sourceLabel);
		const record = {
			key,
			label: formatLabel(key),
			sourceLabel: block.sourceLabel,
			details: unique.join('\n')
		};

		// Existing Setbound product_formats has one row per format key.
		// If two source formats map to the same key (e.g. Hobby + FDI),
		// preserve both instead of silently dropping one.
		if (keyed.has(key)) {
			const previous = keyed.get(key);
			previous.details = `${previous.sourceLabel}\n${previous.details}\n\n${record.sourceLabel}\n${record.details}`.trim();
			previous.sourceLabel = `${previous.sourceLabel} / ${record.sourceLabel}`;
		} else {
			keyed.set(key, record);
		}
	}

	return [...keyed.values()];
}

function leadFactLines(html) {
	const lines = textLines(html);
	const h1Index = lines.findIndex((line) => /Checklist Guide$| Guide$/.test(line) || line === titleFromHtml(html));
	const rundownIndex = lines.findIndex((line) => /Checklist Rundown/i.test(line));

	const start = h1Index >= 0 ? h1Index + 1 : 0;
	const end = rundownIndex > start ? rundownIndex : Math.min(lines.length, start + 35);

	return lines
		.slice(start, end)
		.filter((line) => line.length >= 45)
		.filter((line) => !/Release Date:|Brands|Checklist Insider Editor|commission|affiliate|buy on|ebay|presales? came on|prices? increased/i.test(line))
		.filter((line) => !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(line))
		.slice(0, 6);
}

function factualThemes(sourceFacts) {
	const text = sourceFacts.join(' ').toLowerCase();
	const themes = [];

	if (/1st bowman/.test(text)) themes.push('1st Bowman prospects');
	else if (/prospect/.test(text)) themes.push('prospects');

	if (/rookie/.test(text)) themes.push('rookies');
	if (/veteran/.test(text)) themes.push('veterans');
	if (/autograph/.test(text)) themes.push('autographs');
	if (/parallel/.test(text)) themes.push('parallels');
	if (/insert/.test(text)) themes.push('inserts');

	return [...new Set(themes)];
}

function formatNames(formats) {
	return formats
		.map((format) => normalizeFormatName(format.sourceLabel))
		.filter(Boolean);
}

function humanList(values) {
	if (!values.length) return '';
	if (values.length === 1) return values[0];
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function overviewSport(title = '') {
	if (/\bbaseball\b/i.test(title)) return 'baseball';
	if (/\bfootball\b/i.test(title)) return 'football';
	if (/\bbasketball\b/i.test(title)) return 'basketball';
	if (/\bsoccer\b/i.test(title)) return 'soccer';
	if (/\bhockey\b/i.test(title)) return 'hockey';
	if (/\bwrestling|wwe|aew\b/i.test(title)) return 'wrestling';
	if (/\bformula 1|racing|nascar\b/i.test(title)) return 'racing';
	if (/\bgolf\b/i.test(title)) return 'golf';
	if (/\btennis\b/i.test(title)) return 'tennis';
	return 'trading card';
}

function hasAutographGuarantee(details = '') {
	return /(?:\b\d+\s+autographs?\b|\bone\s+autograph\b|\btwo\s+autographs?\b|\bthree\s+autographs?\b|\bfour\s+autographs?\b|\bautographs?\s+per\s+box\b|\bguaranteed\s+autographs?\b)/i.test(
		String(details || '')
	);
}

function collectorFacingOverview(value = '') {
	return String(value || '')
		// Collector-facing copy should never expose where Setbound gathered facts.
		.replace(/\bChecklist Insider\b/gi, '')
		.replace(/\baccording to\s+(?:the\s+)?(?:source|article|checklist)\b/gi, '')
		.replace(/\b(?:the\s+)?source\s+(?:lists|says|notes|reports|shows)\b/gi, '')
		.replace(/\s+([,.;:!?])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function makeOverview(title, releaseDate, formats, sourceFacts) {
	const sentences = [];
	const themes = factualThemes(sourceFacts);
	const sport = overviewSport(title);
	const factsText = sourceFacts.join(' ');

	let dateText = '';
	if (releaseDate) {
		dateText = new Date(`${releaseDate}T12:00:00Z`).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	if (title) {
		if (dateText && themes.length) {
			sentences.push(
				`${title} released on ${dateText} with a ${sport} checklist built around ${humanList(themes.slice(0, 4))}.`
			);
		} else if (dateText) {
			sentences.push(`${title} released on ${dateText}.`);
		} else if (themes.length) {
			sentences.push(
				`${title} features a ${sport} checklist built around ${humanList(themes.slice(0, 4))}.`
			);
		} else {
			sentences.push(`${title} is a ${sport} card release with a mix of base cards, inserts, and chase content.`);
		}
	}

	if (/chromium|chrome/i.test(factsText) && /paper/i.test(factsText)) {
		sentences.push('The release mixes traditional paper cards with Chrome-style content.');
	} else if (/sapphire/i.test(`${title} ${factsText}`)) {
		sentences.push('Sapphire styling and exclusive color parallels give the release its distinct look.');
	}

	const names = formatNames(formats);

	if (names.length) {
		sentences.push(
			`Collectors can find the product in ${humanList(names.slice(0, 5))} configurations.`
		);
	}

	const guaranteedAutographFormats = formats
		.filter((format) => hasAutographGuarantee(format.details))
		.map((format) => normalizeFormatName(format.sourceLabel))
		.filter(Boolean);

	if (guaranteedAutographFormats.length) {
		sentences.push(
			`Autograph guarantees are included in ${humanList(guaranteedAutographFormats.slice(0, 4))} boxes.`
		);
	} else if (/autograph/i.test(factsText)) {
		sentences.push('Autographs are part of the chase alongside the product’s other inserts and parallels.');
	}

	return collectorFacingOverview(sentences.slice(0, 4).join(' '));
}

function canonicalImageKey(url) {
	try {
		const parsed = new URL(url);
		let path = parsed.pathname.toLowerCase();

		path = path
			.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '')
			.replace(/[_-](?:thumb|thumbnail|small|medium|large|scaled)(?=\.[a-z0-9]+$)/i, '')
			.replace(/[_-](?:1200|1600|2000)(?=\.[a-z0-9]+$)/i, '');

		return `${parsed.hostname}${path}`;
	} catch {
		return String(url || '').toLowerCase();
	}
}

function imageCandidates(html, pageUrl, productName) {
	const candidates = new Map();

	const tokens = String(productName || '')
		.toLowerCase()
		.replace(/\b(19|20)\d{2}\b/g, '')
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 4)
		.filter((token) => !['baseball', 'football', 'basketball', 'soccer', 'hockey', 'checklist', 'guide'].includes(token))
		.slice(0, 7);

	const add = (url, alt = '', bonus = 0, width = 0, height = 0) => {
		if (!url) return;

		const absolute = absoluteUrl(url, pageUrl);
		if (!absolute) return;

		let parsed;
		try { parsed = new URL(absolute); } catch { return; }

		if (parsed.hostname !== 'xcdn.checklistinsider.com') return;
		if (!/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return;

		const haystack = `${absolute} ${alt}`.toLowerCase();
		let score = bonus;

		for (const token of tokens) {
			if (haystack.includes(token)) score += 7;
		}

		if (/\bsealed\b|\bhobby[- _]?box\b|\bproduct[- _]?image\b|\bbox[- _]?image\b/i.test(haystack)) score += 28;
		if (/\bbox\b/i.test(haystack)) score += 10;
		if (/in-content\s*(?:1|01)\b/i.test(alt)) score += 12;
		if (/thumb-1200|1200|1600|large/i.test(haystack)) score += 5;

		// Individual card scans dominate later in-content positions on CI pages.
		if (/in-content\s*(?:[2-9]|[1-9]\d+)\b/i.test(alt)) score -= 15;
		if (/autograph|refractor|parallel|variation|rookie card|card front|card back/i.test(haystack)) score -= 16;
		if (/logo|avatar|author|icon|banner|advert|ebay|listing|social/i.test(haystack)) score -= 40;

		if (Number(width) >= 500 || Number(height) >= 500) score += 3;

		const key = canonicalImageKey(absolute);
		const candidate = {
			url: absolute,
			alt: cleanText(alt) || 'Checklist Insider product image',
			score
		};

		const existing = candidates.get(key);

		if (!existing || candidate.score > existing.score) {
			candidates.set(key, candidate);
		}
	};

	for (const meta of html.matchAll(/<meta\b[^>]*(?:property|name)=(["'])(?:og:image|twitter:image)\1[^>]*>/gi)) {
		add(attribute(meta[0], 'content'), 'Product image', 24);
	}

	for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = img[0];
		const alt = attribute(tag, 'alt');
		const width = Number(attribute(tag, 'width') || 0);
		const height = Number(attribute(tag, 'height') || 0);

		add(attribute(tag, 'src'), alt, 0, width, height);
		add(attribute(tag, 'data-src'), alt, 0, width, height);
		add(attribute(tag, 'data-lazy-src'), alt, 0, width, height);

		const srcset = attribute(tag, 'srcset') || attribute(tag, 'data-srcset');

		if (srcset) {
			const largest = srcset
				.split(',')
				.map((item) => item.trim().split(/\s+/)[0])
				.filter(Boolean)
				.at(-1);

			add(largest, alt, 4, width, height);
		}
	}

	return [...candidates.values()]
		.filter((candidate) => candidate.score >= 8)
		.sort((a, b) => b.score - a.score)
		.slice(0, 4);
}

export function parseChecklistInsiderEnrichment(html, pageUrl, requestedName = '') {
	const title = titleFromHtml(html) || requestedName;
	const releaseDate = parseReleaseDate(html);
	const formats = parseFormatBlocks(html);
	const sourceFacts = leadFactLines(html);
	const images = imageCandidates(html, pageUrl, title || requestedName);
	const overview = makeOverview(title || requestedName, releaseDate, formats, sourceFacts);

	return {
		source: 'Checklist Insider',
		sourceUrl: pageUrl,
		title,
		releaseDate,
		overview,
		formats,
		images,
		sourceFacts
	};
}
