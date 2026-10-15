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
			.replace(/<li\b[^>]*>/gi, '• ')
			.replace(/<[^>]+>/g, ' ')
	)
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function sectionAfterHeading(html, phrase) {
	const heading = new RegExp(`<h([23])\\b[^>]*>[\\s\\S]*?${phrase}[\\s\\S]*?<\\/h\\1>`, 'i');
	const match = heading.exec(html);
	if (!match) return '';
	const start = match.index + match[0].length;
	const rest = html.slice(start);
	const next = /<h[23]\b/i.exec(rest);
	return next ? rest.slice(0, next.index) : rest;
}

function parseReleaseDate(html) {
	const plain = cleanText(html);
	const match = plain.match(/(?:Estimated )?Release Date:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/i);
	if (!match?.[1]) return null;
	const date = new Date(`${match[1]} 12:00:00 UTC`);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function titleFromHtml(html) {
	const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	return h1 ? cleanText(h1[1]).replace(/\s+Checklist Guide.*$/i, '').trim() : '';
}

function normalizeFormatName(value = '') {
	return String(value).replace(/\bbox(es)?\b/gi, '').replace(/\s+/g, ' ').trim();
}

function formatKey(label = '') {
	const value = label.toLowerCase();
	if (/breaker/.test(value)) return 'breaker';
	if (/blaster|value/.test(value)) return 'blaster';
	if (/mega/.test(value)) return 'mega';
	if (/jumbo/.test(value)) return 'jumbo';
	if (/retail/.test(value)) return 'retail';
	if (/fat pack/.test(value)) return 'fat_pack';
	if (/hanger/.test(value)) return 'hanger';
	if (/collector|tin/.test(value)) return 'collector';
	return 'hobby';
}

function formatLabel(key, sourceLabel) {
	const labels = {
		hobby: 'Hobby Box Breakdown', breaker: 'Breaker / Breaker Delight Breakdown',
		blaster: 'Blaster / Value Box Breakdown', mega: 'Mega Box Breakdown', jumbo: 'Jumbo Box Breakdown',
		retail: 'Retail Box Breakdown', fat_pack: 'Fat Pack Breakdown', hanger: 'Hanger Box Breakdown',
		collector: 'Collector / Tin Breakdown'
	};
	return labels[key] || `${normalizeFormatName(sourceLabel) || 'Product'} Breakdown`;
}

function parseFormatBlocks(html) {
	const configuration = textLines(sectionAfterHeading(html, 'Product Configuration'));
	const boxBreak = textLines(sectionAfterHeading(html, 'Box Break'));
	const headingLike = (line) => /\b(box|boxes|pack|packs|tin|tins)\b/i.test(line) && line.length <= 80 && !/cards? per|packs? per|boxes? per|autograph|parallel/i.test(line);
	const candidateHeads = [...new Set([...configuration.filter(headingLike), ...boxBreak.filter(headingLike)])];
	if (!candidateHeads.length && (configuration.length || boxBreak.length)) candidateHeads.push('Hobby Boxes');

	const blocks = [];
	for (const head of candidateHeads) {
		const gather = (lines) => {
			let active = false;
			const details = [];
			for (const line of lines) {
				const isHead = candidateHeads.includes(line);
				if (isHead) { active = line === head; continue; }
				if (active && line) details.push(line);
			}
			return details;
		};
		const single = candidateHeads.length === 1;
		const configDetails = gather(configuration);
		const breakDetails = gather(boxBreak);
		const merged = [
			...(configDetails.length ? configDetails : single ? configuration.filter((x) => x !== head) : []),
			...(breakDetails.length ? breakDetails : single ? boxBreak.filter((x) => x !== head) : [])
		];
		const unique = [...new Set(merged)].filter((line) => line !== head).filter((line) => !/^(buy|order)\b/i.test(line));
		if (!unique.length) continue;
		const key = formatKey(head);
		blocks.push({ key, label: formatLabel(key, head), sourceLabel: head, details: unique.join('\n') });
	}

	const byKey = new Map();
	for (const block of blocks) {
		const current = byKey.get(block.key);
		if (!current || block.details.length > current.details.length) byKey.set(block.key, block);
	}
	return [...byKey.values()];
}

function firstUsefulParagraphs(html) {
	const h1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(html);
	if (!h1) return [];
	const rest = html.slice(h1.index + h1[0].length);
	const rundown = /<h[23]\b[^>]*>[\s\S]*?Checklist Rundown[\s\S]*?<\/h[23]>/i.exec(rest);
	const lead = rundown ? rest.slice(0, rundown.index) : rest.slice(0, 15000);
	return [...lead.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
		.map((match) => cleanText(match[1]))
		.filter((paragraph) => paragraph.length >= 55)
		.filter((paragraph) => !/commission|affiliate|buy on|ebay|clicking any links/i.test(paragraph))
		.slice(0, 3);
}

function makeOverview(title, releaseDate, formats, sourceParagraphs) {
	const parts = [];
	if (title) {
		const dateText = releaseDate ? new Date(`${releaseDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
		parts.push(`${title} is a collector card release${dateText ? ` released on ${dateText}` : ''}.`);
	}
	const first = formats[0];
	if (first?.details) {
		const details = first.details.split('\n').map((line) => line.trim()).filter(Boolean);
		const config = details.filter((line) => /cards? per|packs? per|boxes? per/i.test(line)).slice(0, 2);
		const hits = details.filter((line) => /autograph|parallel|relic|memorabilia|insert/i.test(line)).slice(0, 2);
		if (config.length) parts.push(`${first.sourceLabel || 'The product'} is configured with ${config.join(' and ').replace(/\.$/, '')}.`);
		if (hits.length) parts.push(`The listed box break includes ${hits.join(' and ').replace(/\.$/, '')}.`);
	}
	const facts = sourceParagraphs.join(' ');
	const themes = [];
	if (/prospect/i.test(facts)) themes.push('prospects');
	if (/rookie/i.test(facts)) themes.push('rookies');
	if (/veteran/i.test(facts)) themes.push('veterans');
	if (/autograph/i.test(facts)) themes.push('autographs');
	if (/parallel/i.test(facts)) themes.push('parallels');
	if (themes.length) parts.push(`Checklist Insider highlights ${themes.slice(0, 4).join(', ')} as part of the release.`);
	return parts.join(' ').trim();
}

function imageCandidates(html, pageUrl, productName) {
	const candidates = new Map();
	const tokens = String(productName || '').toLowerCase().replace(/\b(19|20)\d{2}\b/g, '').split(/[^a-z0-9]+/).filter((token) => token.length >= 4).slice(0, 8);
	const add = (url, alt = '', bonus = 0) => {
		if (!url) return;
		const absolute = absoluteUrl(url, pageUrl);
		if (!absolute) return;
		let parsed;
		try { parsed = new URL(absolute); } catch { return; }
		if (parsed.hostname !== 'xcdn.checklistinsider.com') return;
		if (!/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return;
		const haystack = `${absolute} ${alt}`.toLowerCase();
		let score = bonus;
		for (const token of tokens) if (haystack.includes(token)) score += 5;
		if (/\bsealed\b|\bhobby[- _]?box\b|\bbox\b|\bproduct\b/i.test(haystack)) score += 18;
		if (/thumb-1200|1200|1600|large/i.test(haystack)) score += 6;
		if (/in-content\s*(?:1|01)\b/i.test(alt)) score += 4;
		if (/logo|avatar|author|icon|banner|advert|ebay|listing/i.test(haystack)) score -= 30;
		if (/in-content\s*(?:1[0-9]|[2-9])\b/i.test(alt)) score -= 7;
		const existing = candidates.get(absolute);
		if (!existing || score > existing.score) candidates.set(absolute, { url: absolute, alt: cleanText(alt), score });
	};

	for (const meta of html.matchAll(/<meta\b[^>]*(?:property|name)=(["'])(?:og:image|twitter:image)\1[^>]*>/gi)) add(attribute(meta[0], 'content'), 'Product image', 30);
	for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = img[0];
		const alt = attribute(tag, 'alt');
		add(attribute(tag, 'src'), alt);
		add(attribute(tag, 'data-src'), alt);
		add(attribute(tag, 'data-lazy-src'), alt);
		const srcset = attribute(tag, 'srcset') || attribute(tag, 'data-srcset');
		if (srcset) {
			const last = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).filter(Boolean).at(-1);
			add(last, alt, 3);
		}
	}
	return [...candidates.values()].filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}

export function parseChecklistInsiderEnrichment(html, pageUrl, requestedName = '') {
	const title = titleFromHtml(html) || requestedName;
	const releaseDate = parseReleaseDate(html);
	const formats = parseFormatBlocks(html);
	const sourceParagraphs = firstUsefulParagraphs(html);
	const images = imageCandidates(html, pageUrl, title || requestedName);
	const overview = makeOverview(title || requestedName, releaseDate, formats, sourceParagraphs);
	return { source: 'Checklist Insider', sourceUrl: pageUrl, title, releaseDate, overview, formats, images, sourceFacts: sourceParagraphs };
}
