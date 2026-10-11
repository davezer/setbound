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

		if (!name || /^card$/i.test(name)) continue;

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
			(item) => item.centerX < firstOddsCenter - 18 && !isOddsToken(item.text)
		);
	});
}

function columnCentersFromData(rows) {
	const points = [];

	for (const row of rows.slice(0, 60)) {
		for (const item of row.items) {
			if (isOddsToken(item.text)) points.push(item.centerX);
		}
	}

	return clusterCenters(points);
}

function clusterCenters(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const clusters = [];

	for (const value of sorted) {
		const cluster = clusters.find((candidate) => Math.abs(candidate.mean - value) <= 24);

		if (cluster) {
			cluster.values.push(value);
			cluster.mean = cluster.values.reduce((sum, x) => sum + x, 0) / cluster.values.length;
		} else {
			clusters.push({ mean: value, values: [value] });
		}
	}

	return clusters
		.filter((cluster) => cluster.values.length >= 2)
		.map((cluster) => cluster.mean)
		.sort((a, b) => a - b);
}

function findHeaderBand(rows, dataRows) {
	if (!dataRows.length) return [];

	const firstDataIndex = rows.indexOf(dataRows[0]);
	let cardIndex = -1;

	for (let index = Math.max(0, firstDataIndex - 8); index < firstDataIndex; index++) {
		if (rows[index].items.some((item) => /^card$/i.test(item.text))) cardIndex = index;
	}

	if (cardIndex >= 0) return rows.slice(cardIndex, firstDataIndex);

	return rows.slice(Math.max(0, firstDataIndex - 4), firstDataIndex);
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

	const gaps = centers.map((center, index) => {
		const leftGap = index > 0 ? center - centers[index - 1] : Infinity;
		const rightGap = index < centers.length - 1 ? centers[index + 1] - center : Infinity;
		return Math.min(leftGap, rightGap);
	});

	return centers.map((center, index) => {
		const pieces = [];

		for (const row of headerRows) {
			for (const item of row.items) {
				if (/^card$/i.test(item.text)) continue;

				const distance = Math.abs(item.centerX - center);
				const maxDistance = Number.isFinite(gaps[index]) ? Math.max(35, gaps[index] * 0.46) : 70;

				if (distance > maxDistance) continue;

				const cleaned = removeSkuPrefix(item.text);
				if (!cleaned) continue;

				pieces.push({ y: row.y, x: item.x, text: cleaned });
			}
		}

		pieces.sort((a, b) => b.y - a.y || a.x - b.x);

		const rawHeader = uniquePieces(pieces.map((piece) => piece.text))
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();

		const name = cleanHumanFormat(rawHeader) || `Format ${index + 1}`;

		return { index, x: center, name, rawHeader };
	});
}

function removeSkuPrefix(value) {
	let text = String(value || '').replace(/\s+/g, ' ').trim();
	if (!text) return '';

	// Strip Topps SKU/product-code prefixes but preserve any real format suffix.
	text = text.replace(
		/^\d{3,}\s*-\s*[A-Z0-9-]+(?:\s+[A-Z0-9-]+)*?\s+20\d{2}\b\s*/i,
		''
	);

	text = text.replace(/^\d{3,}\s*-\s*[A-Z0-9-]+\s*/i, '').trim();

	if (!text || /^card$/i.test(text) || looksLikeSku(text)) return '';
	return text;
}

function cleanHumanFormat(value) {
	let text = String(value || '').replace(/\s+/g, ' ').trim();

	// "Card" is the row-label column, never a pack format.
	text = text.replace(/^cards?\s+/i, '').replace(/\s+cards?$/i, '').trim();

	if (!text || looksLikeSku(text)) return '';

	if (text === text.toUpperCase()) {
		text = text
			.toLowerCase()
			.replace(/\b\w/g, (letter) => letter.toUpperCase())
			.replace(/\bHta\b/g, 'HTA')
			.replace(/\bMlb\b/g, 'MLB')
			.replace(/\bNfl\b/g, 'NFL')
			.replace(/\bNba\b/g, 'NBA')
			.replace(/\bNhl\b/g, 'NHL');
	}

	return text;
}

function validateFormats(formats) {
	const issues = [];
	const seen = new Set();

	for (const format of formats) {
		const name = String(format.name || '').trim();
		const lower = name.toLowerCase();

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

		if (seen.has(lower)) issues.push(`Duplicate format header detected: "${name}".`);
		seen.add(lower);
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
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(value);
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
		const localNames = page.formats.map((format) => format.name.toLowerCase());

		for (const row of page.rows) {
			const values = new Array(formats.length).fill(null);

			for (let i = 0; i < formats.length; i++) {
				const target = formats[i].name.toLowerCase();
				const localIndex = localNames.indexOf(target);

				if (localIndex >= 0) values[i] = row.values[localIndex] ?? null;
				else if (i < row.values.length) values[i] = row.values[i] ?? null;
			}

			rows.push({ name: row.name.replace(/\s+/g, ' ').trim(), values });
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
		text.length <= 34 &&
		/^[A-Z0-9 &/'().+-]+$/.test(text) &&
		/\b(PARALLEL|CARD|CARDS|FRAME|FILAGREE)\b/.test(text)
	);
}

function looksLikeNameFragment(text) {
	return text.length <= 70 && /^[A-Z0-9 &/'().+-]+$/.test(text);
}
