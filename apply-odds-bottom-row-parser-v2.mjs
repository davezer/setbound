import fs from 'node:fs';

function replaceBetween(source, startMarker, endMarker, replacement, label) {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);

	if (start < 0 || end < 0) {
		throw new Error(`${label}: could not find expected code.`);
	}

	return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
}

const path = 'src/lib/client/odds-pdf.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const headerParser = `function normalizeHeaderFragments(value) {
	return String(value || '')
		.replace(/\\bHANGE\\s+R\\b/gi, 'HANGER')
		.replace(/\\bFANATI\\s+CS\\b/gi, 'FANATICS')
		.replace(/\\bPAC\\s+K\\b/gi, 'PACK')
		.replace(/\\bDISPLA\\s+Y\\b/gi, 'DISPLAY')
		.replace(/\\bEDITIO\\s+N\\b/gi, 'EDITION')
		.replace(/\\bBREAKE\\s+R\\b/gi, 'BREAKER')
		.replace(/\\bDELIGH\\s+T\\b/gi, 'DELIGHT')
		.replace(/\\bVALUE\\s+BO\\s+X\\b/gi, 'VALUE BOX')
		.replace(/\\s+/g, ' ')
		.trim();
}

function headerLevels(items) {
	const levels = [];

	for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
		let level = levels.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);

		if (!level) {
			level = { y: item.y, items: [] };
			levels.push(level);
		}

		level.items.push(item);
	}

	return levels.sort((a, b) => a.y - b.y);
}

function bottomUpFormat(items) {
	if (!items.length) return { name: '', bottomRaw: '' };

	const levels = headerLevels(items);
	const pieces = [];

	// The collector-facing package name is printed at the BOTTOM of Topps'
	// multi-line header. Walk upward one visual line at a time until the text
	// becomes a recognizable package format.
	for (const level of levels) {
		const line = level.items
			.sort((a, b) => a.x - b.x)
			.map((item) => item.text)
			.join(' ');

		pieces.unshift(line);

		const candidate = normalizeHeaderFragments(pieces.join(' '));
		const known = extractKnownFormat(candidate);

		if (known) {
			return {
				name: known,
				bottomRaw: candidate
			};
		}
	}

	const fallback = normalizeHeaderFragments(pieces.join(' '));

	return {
		name: cleanHumanFormat(fallback),
		bottomRaw: fallback
	};
}

function extractFormatHeaders(headerRows, centers) {
	if (!headerRows.length) {
		return centers.map((x, index) => ({
			index,
			x,
			name: \`Format \${index + 1}\`,
			rawHeader: ''
		}));
	}

	const buckets = centers.map(() => []);

	for (const row of headerRows) {
		for (const item of row.items) {
			if (/^cards?$/i.test(item.text)) continue;

			// Header fragments in dense Topps PDFs often visually overlap the
			// next cell. Assign by text center instead of overlap width so
			// wrapped fragments like HANGE / R BOX / EA stay in one column.
			const index = nearestCenterIndex(item.centerX, centers);
			if (index < 0) continue;

			buckets[index].push({
				y: row.y,
				x: item.x,
				text: item.text
			});
		}
	}

	return centers.map((center, index) => {
		const pieces = buckets[index]
			.sort((a, b) => b.y - a.y || a.x - b.x)
			.map((piece) => piece.text);

		const rawHeader = normalizeHeaderFragments(
			uniquePieces(pieces).join(' ')
		);

		const bottom = bottomUpFormat(buckets[index]);
		const name =
			bottom.name ||
			cleanHumanFormat(rawHeader) ||
			\`Format \${index + 1}\`;

		return {
			index,
			x: center,
			name,
			rawHeader,
			formatHeader: bottom.bottomRaw
		};
	});
}`;

source = replaceBetween(
	source,
	'function extractFormatHeaders(headerRows, centers) {',
	'function cleanHumanFormat(value) {',
	headerParser,
	'extractFormatHeaders'
);

const cleaner = `function prettyFormatName(value) {
	let text = normalizeHeaderFragments(value).toLowerCase();

	text = text.replace(/\\b\\w/g, (letter) => letter.toUpperCase());

	return text
		.replace(/\\bEa\\b/g, 'EA')
		.replace(/\\bSe\\b/g, 'SE')
		.replace(/\\bCe\\b/g, 'CE')
		.replace(/\\bCee\\b/g, 'CEE')
		.replace(/\\bCc\\b/g, 'CC')
		.replace(/\\bHta\\b/g, 'HTA')
		.replace(/\\bFotl\\b/g, 'FOTL')
		.replace(/\\bAsg\\b/g, 'ASG')
		.replace(/\\bMlb\\b/g, 'MLB')
		.replace(/\\bNfl\\b/g, 'NFL')
		.replace(/\\bNba\\b/g, 'NBA')
		.replace(/\\bNhl\\b/g, 'NHL');
}

function extractKnownFormat(value) {
	const text = normalizeHeaderFragments(value).toUpperCase();

	if (!text) return '';

	const patterns = [
		/FANATICS FEST VALUE BOX\\b/g,
		/FANATICS FEST(?: N)? HOBBY\\b/g,
		/CLUB SUPER BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/ASG MEGA(?: BOX)?(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/HANGER BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/DISPLAY BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/VALUE BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/SUPER BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/FAT PACK(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/MEGA BOX(?: (?:EA|SE|CC|CE|CEE))?\\b/g,
		/MEGA(?: (?:EA|SE|CC|CE|CEE))\\b/g,
		/FLOOR DISPLAY\\b/g,
		/BULK PACKS?\\b/g,
		/JAPAN EDITION\\b/g,
		/BREAKER DELIGHT\\b/g,
		/HOBBY DELIGHT\\b/g,
		/BLASTER BOX\\b/g,
		/RETAIL BOX\\b/g,
		/FANATICS\\b/g,
		/SAPPHIRE\\b/g,
		/JUMBO\\b/g,
		/HOBBY\\b/g,
		/BLASTER\\b/g,
		/RETAIL\\b/g,
		/FOTL\\b/g,
		/HTA\\b/g
	];

	let best = null;

	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		let match;

		while ((match = pattern.exec(text))) {
			const candidate = {
				value: match[0],
				index: match.index
			};

			// When walking bottom-up, the desired phrase is generally the
			// longest recognized phrase in the reconstructed bottom lines.
			if (
				!best ||
				candidate.value.length > best.value.length ||
				(candidate.value.length === best.value.length && candidate.index > best.index)
			) {
				best = candidate;
			}
		}
	}

	return best ? prettyFormatName(best.value) : '';
}

function cleanHumanFormat(value) {
	let text = normalizeHeaderFragments(value);

	text = text
		.replace(/^cards?\\s+/i, '')
		.replace(/\\s+cards?$/i, '')
		.trim();

	const known = extractKnownFormat(text);
	if (known) return known;

	const years = [...text.matchAll(/\\b20\\d{2}\\b/g)];

	if (years.length) {
		const lastYear = years.at(-1);
		const tail = normalizeHeaderFragments(
			text.slice(lastYear.index + lastYear[0].length)
		);

		if (tail && !looksLikeSku(tail)) {
			return prettyFormatName(tail);
		}
	}

	text = text.replace(/^\\d{3,}\\s*-\\s*/i, '');
	text = text.replace(/^(?:MLB|NFL|NBA|NHL|WWE)[-\\s]+/i, '');
	text = text.replace(/^(?:TOPPS|BOWMAN|PANINI)[-\\s]+/i, '');
	text = text.trim();

	if (!text || looksLikeSku(text)) return '';

	return prettyFormatName(text);
}`;

source = replaceBetween(
	source,
	'function cleanHumanFormat(value) {',
	'function validateFormats(formats) {',
	cleaner,
	'cleanHumanFormat'
);

// Make sure duplicate human-readable names are still accepted.
const validation = `function validateFormats(formats) {
	const issues = [];

	for (const format of formats) {
		const name = String(format.name || '').trim();

		if (!name || /^format \\d+$/i.test(name)) {
			issues.push(\`Column \${format.index + 1} does not have a verified format name.\`);
			continue;
		}

		if (looksLikeSku(name)) {
			issues.push(\`"\${name}" still looks like a product/SKU code, not a pack format.\`);
		}

		if (/^cards?\\b/i.test(name)) {
			issues.push(\`"\${name}" incorrectly includes the Card column heading.\`);
		}
	}

	return issues;
}`;

source = replaceBetween(
	source,
	'function validateFormats(formats) {',
	'function looksLikeSku(value) {',
	validation,
	'validateFormats'
);

fs.writeFileSync(path, source);
console.log('Bottom-row Topps odds header parser installed.');
