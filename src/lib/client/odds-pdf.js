import { browser } from '$app/environment';

const ODDS_RE = /^(?:\d+:)?[\d,]+$/;

export async function extractOddsPdf(file) {
	if (!browser) throw new Error('Odds PDF parsing is only available in the browser.');

	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

	const data = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data }).promise;
	const parsedPages = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const rawRows = groupIntoRows(content.items);
		parsedPages.push(parsePage(rawRows));
	}

	const formats = mergeFormats(parsedPages);
	const rows = mergeRows(parsedPages, formats);
	const disclaimer = findDisclaimer(parsedPages);
	const headerIssues = validateFormats(formats);

	if (!formats.length) throw new Error('Could not detect odds columns in this PDF.');
	if (!rows.length) throw new Error('No odds rows were detected in this PDF.');

	return { filename: file.name, formats, rows, disclaimer, headerIssues };
}

function groupIntoRows(items) {
	const rows = [];

	for (const item of items) {
		if (!item || !('str' in item)) continue;

		const text = String(item.str || '').trim();
		if (!text) continue;

		const x = Number(item.transform?.[4] || 0);
		const y = Number(item.transform?.[5] || 0);
		const width = Number(item.width || 0);

		let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);

		if (!row) {
			row = { y, items: [] };
			rows.push(row);
		}

		row.items.push({ x, y, width, centerX: x + width / 2, text });
	}

	return rows
		.sort((a, b) => b.y - a.y)
		.map((row) => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) }));
}

function parsePage(rawRows) {
	const dataRows = findLikelyDataRows(rawRows);
	const centers = columnCentersFromData(dataRows);

	if (!centers.length) {
		return { formats: [], rows: [], textRows: rawRows.map(rowText) };
	}

	const headerBand = findHeaderBand(rawRows, dataRows);
	const formats = extractFormatHeaders(headerBand, centers);

	const rows = [];
	let pendingPrefix = '';

	for (const row of rawRows) {
		if (headerBand.includes(row)) continue;

		const text = rowText(row);
		if (!text || isBoilerplate(text)) continue;

		const oddsItems = row.items.filter((item) => isOddsToken(item.text));

		if (!oddsItems.length) {
			if (looksLikeContinuation(text) && rows.length) {
				rows[rows.length - 1].name = `${rows[rows.length - 1].name} ${text}`.replace(/\s+/g, ' ').trim();
			} else if (looksLikeNameFragment(text)) {
				pendingPrefix = pendingPrefix ? `${pendingPrefix} ${text}` : text;
			}
			continue;
		}

		const firstOddsCenter = Math.min(...oddsItems.map((item) => item.centerX));
		const firstColumnCenter = centers[0];
		const gap = centers.length > 1 ? centers[1] - centers[0] : 100;
		const cardBoundary = firstColumnCenter - gap * 0.48;

		let name = row.items
			.filter((item) => item.centerX < cardBoundary && !isOddsToken(item.text))
			.map((item) => item.text)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();

		if (!name) {
			name = row.items
				.filter((item) => item.centerX < firstOddsCenter - 18 && !isOddsToken(item.text))
				.map((item) => item.text)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
		}

		if (pendingPrefix) {
			name = `${pendingPrefix} ${name}`.replace(/\s+/g, ' ').trim();
			pendingPrefix = '';
		}

		if (!name || /^cards?$/i.test(name)) continue;

		const values = new Array(formats.length).fill(null);

		for (const oddsItem of oddsItems) {
			const index = nearestCenterIndex(oddsItem.centerX, centers);
			if (index >= 0) values[index] = normalizeOdds(oddsItem.text);
		}

		rows.push({ name, values });
	}

	return { formats, rows, textRows: rawRows.map(rowText) };
}

function findLikelyDataRows(rows) {
	return rows.filter((row) => {
		const oddsItems = row.items.filter((item) => isOddsToken(item.text));
		if (!oddsItems.length) return false;

		const text = rowText(row);
		if (isBoilerplate(text)) return false;

		const firstOddsCenter = Math.min(...oddsItems.map((item) => item.centerX));

		return row.items.some(
			(item) => item.centerX < firstOddsCenter - 12 && !isOddsToken(item.text)
		);
	});
}

/*
 * Old parser clustered every odds token using a fixed 24pt threshold.
 * On dense Topps sheets that can blend neighboring columns or produce unstable
 * centers. Topps fills empty odds cells with "-", so the densest real data row
 * is a much better description of the actual table columns.
 */
function columnCentersFromData(rows) {
	const candidates = rows
		.map((row) =>
			row.items
				.filter((item) => isOddsToken(item.text))
				.map((item) => item.centerX)
				.sort((a, b) => a - b)
		)
		.filter((values) => values.length);

	if (!candidates.length) return [];

	candidates.sort((a, b) => b.length - a.length);

	const maxCount = candidates[0].length;
	const dense = candidates.filter((values) => values.length === maxCount).slice(0, 20);

	if (maxCount === 1) {
		return [dense.reduce((sum, values) => sum + values[0], 0) / dense.length];
	}

	const centers = [];

	for (let index = 0; index < maxCount; index++) {
		const values = dense.map((row) => row[index]).filter(Number.isFinite);
		centers.push(values.reduce((sum, value) => sum + value, 0) / values.length);
	}

	return centers;
}

function findHeaderBand(rows, dataRows) {
	if (!dataRows.length) return [];

	const firstDataIndex = rows.indexOf(dataRows[0]);
	let cardIndex = -1;

	for (let index = Math.max(0, firstDataIndex - 12); index < firstDataIndex; index++) {
		if (rows[index].items.some((item) => /^cards?$/i.test(item.text))) cardIndex = index;
	}

	if (cardIndex >= 0) return rows.slice(cardIndex, firstDataIndex);

	return rows.slice(Math.max(0, firstDataIndex - 7), firstDataIndex);
}

function columnBounds(centers, index) {
	const center = centers[index];
	const left = index === 0
		? center - (centers[1] - center) / 2
		: (centers[index - 1] + center) / 2;
	const right = index === centers.length - 1
		? center + (center - centers[index - 1]) / 2
		: (center + centers[index + 1]) / 2;

	return { left, right };
}

function headerColumnIndex(item, centers) {
	// Prefer the geometric overlap of the PDF text item with a column cell.
	// This behaves much better than centerX for long wrapped header fragments.
	const itemLeft = item.x;
	const itemRight = item.x + Math.max(item.width, 1);
	let best = -1;
	let bestOverlap = -1;

	for (let index = 0; index < centers.length; index++) {
		const { left, right } = columnBounds(centers, index);
		const overlap = Math.max(0, Math.min(itemRight, right) - Math.max(itemLeft, left));

		if (overlap > bestOverlap) {
			bestOverlap = overlap;
			best = index;
		}
	}

	if (bestOverlap > 0) return best;
	return nearestCenterIndex(item.centerX, centers);
}

function normalizeHeaderFragments(value) {
	return String(value || '')
		.replace(/\bHANGE\s+R\b/gi, 'HANGER')
		.replace(/\bFANATI\s+CS\b/gi, 'FANATICS')
		.replace(/\bPAC\s+K\b/gi, 'PACK')
		.replace(/\bDISPLA\s+Y\b/gi, 'DISPLAY')
		.replace(/\bEDITIO\s+N\b/gi, 'EDITION')
		.replace(/\bBREAKE\s+R\b/gi, 'BREAKER')
		.replace(/\bDELIGH\s+T\b/gi, 'DELIGHT')
		.replace(/\bVALUE\s+BO\s+X\b/gi, 'VALUE BOX')
		.replace(/\s+/g, ' ')
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
			name: `Format ${index + 1}`,
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
			`Format ${index + 1}`;

		return {
			index,
			x: center,
			name,
			rawHeader,
			formatHeader: bottom.bottomRaw
		};
	});
}

function prettyFormatName(value) {
	let text = normalizeHeaderFragments(value).toLowerCase();

	text = text.replace(/\b\w/g, (letter) => letter.toUpperCase());

	return text
		.replace(/\bEa\b/g, 'EA')
		.replace(/\bSe\b/g, 'SE')
		.replace(/\bCe\b/g, 'CE')
		.replace(/\bCee\b/g, 'CEE')
		.replace(/\bCc\b/g, 'CC')
		.replace(/\bHta\b/g, 'HTA')
		.replace(/\bFotl\b/g, 'FOTL')
		.replace(/\bAsg\b/g, 'ASG')
		.replace(/\bMlb\b/g, 'MLB')
		.replace(/\bNfl\b/g, 'NFL')
		.replace(/\bNba\b/g, 'NBA')
		.replace(/\bNhl\b/g, 'NHL');
}

function extractKnownFormat(value) {
	const text = normalizeHeaderFragments(value).toUpperCase();

	if (!text) return '';

	const patterns = [
		/FANATICS FEST VALUE BOX\b/g,
		/FANATICS FEST(?: N)? HOBBY\b/g,
		/CLUB SUPER BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/ASG MEGA(?: BOX)?(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/HANGER BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/DISPLAY BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/VALUE BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/SUPER BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/FAT PACK(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/MEGA BOX(?: (?:EA|SE|CC|CE|CEE))?\b/g,
		/MEGA(?: (?:EA|SE|CC|CE|CEE))\b/g,
		/FLOOR DISPLAY\b/g,
		/BULK PACKS?\b/g,
		/JAPAN EDITION\b/g,
		/BREAKER DELIGHT\b/g,
		/HOBBY DELIGHT\b/g,
		/BLASTER BOX\b/g,
		/RETAIL BOX\b/g,
		/FANATICS\b/g,
		/SAPPHIRE\b/g,
		/JUMBO\b/g,
		/HOBBY\b/g,
		/BLASTER\b/g,
		/RETAIL\b/g,
		/FOTL\b/g,
		/HTA\b/g
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
		.replace(/^cards?\s+/i, '')
		.replace(/\s+cards?$/i, '')
		.trim();

	const known = extractKnownFormat(text);
	if (known) return known;

	const years = [...text.matchAll(/\b20\d{2}\b/g)];

	if (years.length) {
		const lastYear = years.at(-1);
		const tail = normalizeHeaderFragments(
			text.slice(lastYear.index + lastYear[0].length)
		);

		if (tail && !looksLikeSku(tail)) {
			return prettyFormatName(tail);
		}
	}

	text = text.replace(/^\d{3,}\s*-\s*/i, '');
	text = text.replace(/^(?:MLB|NFL|NBA|NHL|WWE)[-\s]+/i, '');
	text = text.replace(/^(?:TOPPS|BOWMAN|PANINI)[-\s]+/i, '');
	text = text.trim();

	if (!text || looksLikeSku(text)) return '';

	return prettyFormatName(text);
}

function validateFormats(formats) {
	const issues = [];

	for (const format of formats) {
		const name = String(format.name || '').trim();

		if (!name || /^format \d+$/i.test(name)) {
			issues.push(`Column ${format.index + 1} does not have a verified format name.`);
			continue;
		}

		if (looksLikeSku(name)) {
			issues.push(`"${name}" still looks like a product/SKU code, not a pack format.`);
		}

		if (/^cards?\b/i.test(name)) {
			issues.push(`"${name}" incorrectly includes the Card column heading.`);
		}
	}

	return issues;
}

function looksLikeSku(value) {
	const text = String(value || '').trim();

	return (
		/^\d{3,}\b/.test(text) ||
		/\b(?:MLB|NFL|NBA|NHL)-[A-Z0-9-]+\b/i.test(text) ||
		(/\b20\d{2}\b/.test(text) && /\d{3,}\s*-/i.test(text))
	);
}

function uniquePieces(values) {
	const seen = new Set();
	const output = [];

	for (const value of values) {
		const text = String(value || '').trim();
		if (!text) continue;

		const key = text.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(text);
	}

	return output;
}

function mergeFormats(pages) {
	const first = pages.find((page) => page.formats.length);
	if (!first) return [];

	return first.formats.map((format, index) => ({
		index,
		name: format.name,
		rawHeader: format.rawHeader || ''
	}));
}

function mergeRows(pages, formats) {
	const rows = [];

	for (const page of pages) {
		const sameColumnCount = page.formats.length === formats.length;

		const localRawHeaders = page.formats.map((format) =>
			String(format.rawHeader || '').replace(/\s+/g, ' ').trim().toLowerCase()
		);

		const localNames = page.formats.map((format) =>
			String(format.name || '').trim().toLowerCase()
		);

		for (const row of page.rows) {
			const values = new Array(formats.length).fill(null);

			for (let i = 0; i < formats.length; i++) {
				// On Topps PDFs the column order is stable from page to page.
				// Positional mapping is essential because duplicate package labels
				// such as Hobby/Hobby or Mega EA/Mega EA are completely legitimate.
				if (sameColumnCount && i < row.values.length) {
					values[i] = row.values[i] ?? null;
					continue;
				}

				const targetRaw = String(formats[i].rawHeader || '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase();

				let localIndex = targetRaw
					? localRawHeaders.indexOf(targetRaw)
					: -1;

				if (localIndex < 0) {
					const targetName = String(formats[i].name || '').trim().toLowerCase();
					const matches = localNames
						.map((name, index) => (name === targetName ? index : -1))
						.filter((index) => index >= 0);

					// Name matching is safe only when that human label is unique.
					if (matches.length === 1) localIndex = matches[0];
				}

				if (localIndex >= 0) {
					values[i] = row.values[localIndex] ?? null;
				} else if (i < row.values.length) {
					values[i] = row.values[i] ?? null;
				}
			}

			rows.push({
				name: row.name.replace(/\s+/g, ' ').trim(),
				values
			});
		}
	}

	return rows.filter((row) => row.name && row.values.some(Boolean));
}

function findDisclaimer(pages) {
	for (const page of pages) {
		const line = page.textRows.find((text) =>
			/intended configuration|actual contents and odds may vary/i.test(text)
		);

		if (line) return line.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
	}

	return '';
}

function nearestCenterIndex(x, centers) {
	let best = -1;
	let distance = Infinity;

	for (let i = 0; i < centers.length; i++) {
		const next = Math.abs(x - centers[i]);

		if (next < distance) {
			distance = next;
			best = i;
		}
	}

	return best;
}

function rowText(row) {
	return row.items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
}

function isOddsToken(value) {
	const text = String(value || '').trim();
	return text === '-' || ODDS_RE.test(text);
}

function normalizeOdds(value) {
	const text = String(value || '').trim();
	if (text === '-') return '-';
	return text.includes(':') ? text : `1:${text}`;
}

function isBoilerplate(text) {
	return (
		/^mlb-/i.test(text) ||
		/^checklists and odds provided/i.test(text) ||
		/^actual contents and odds may vary/i.test(text) ||
		/^topps$/i.test(text)
	);
}

function looksLikeContinuation(text) {
	return (
		text.length <= 90 &&
		!isBoilerplate(text) &&
		!/^(?:card|cards)$/i.test(text) &&
		!/\b(?:hobby|jumbo|mega|value|retail|breaker|blaster|hanger|pack|box)\b/i.test(text)
	);
}

function looksLikeNameFragment(text) {
	return (
		text.length <= 110 &&
		!isBoilerplate(text) &&
		!/^(?:card|cards)$/i.test(text)
	);
}
