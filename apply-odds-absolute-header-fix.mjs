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

const parsePage = `function parsePage(rawRows) {
	const cardHeaderIndex = findCardHeaderIndex(rawRows);

	if (cardHeaderIndex < 0) {
		const dataRows = findLikelyDataRows(rawRows);
		const centers = columnCentersFromData(dataRows);

		if (!centers.length) {
			return { formats: [], rows: [], textRows: rawRows.map(rowText) };
		}

		const headerBand = findHeaderBand(rawRows, dataRows);
		return parsePageWithGeometry(rawRows, headerBand, dataRows, centers);
	}

	const cardHeaderRow = rawRows[cardHeaderIndex];
	const cardItem = cardHeaderRow.items.find((item) => /^cards?$/i.test(item.text));
	const cardX = cardItem?.x ?? Math.min(...cardHeaderRow.items.map((item) => item.x));

	const firstDataIndex = findFirstRealDataRowIndex(
		rawRows,
		cardHeaderIndex + 1,
		cardX
	);

	if (firstDataIndex < 0) {
		return { formats: [], rows: [], textRows: rawRows.map(rowText) };
	}

	// CRITICAL: never let SKU/header rows participate in data-column detection.
	// Bare SKU values such as 6544 used to match isOddsToken(), causing the parser
	// to mistake the header itself for the first data row.
	const bodyRows = rawRows.slice(firstDataIndex);
	const dataRows = findLikelyDataRows(bodyRows);
	const centers = columnCentersFromData(dataRows);

	if (!centers.length) {
		return { formats: [], rows: [], textRows: rawRows.map(rowText) };
	}

	const headerBand = rawRows.slice(cardHeaderIndex, firstDataIndex);

	return parsePageWithGeometry(rawRows, headerBand, dataRows, centers);
}

function parsePageWithGeometry(rawRows, headerBand, dataRows, centers) {
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
				rows[rows.length - 1].name = \`\${rows[rows.length - 1].name} \${text}\`
					.replace(/\\s+/g, ' ')
					.trim();
			} else if (looksLikeNameFragment(text)) {
				pendingPrefix = pendingPrefix ? \`\${pendingPrefix} \${text}\` : text;
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
			.replace(/\\s+/g, ' ')
			.trim();

		if (!name) {
			name = row.items
				.filter((item) => item.centerX < firstOddsCenter - 18 && !isOddsToken(item.text))
				.map((item) => item.text)
				.join(' ')
				.replace(/\\s+/g, ' ')
				.trim();
		}

		if (pendingPrefix) {
			name = \`\${pendingPrefix} \${name}\`.replace(/\\s+/g, ' ').trim();
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

function findCardHeaderIndex(rows) {
	for (let index = 0; index < rows.length; index++) {
		if (rows[index].items.some((item) => /^cards?$/i.test(item.text))) {
			return index;
		}
	}

	return -1;
}

function findFirstRealDataRowIndex(rows, startIndex, cardX) {
	for (let index = startIndex; index < rows.length; index++) {
		const row = rows[index];
		const oddsItems = row.items.filter((item) => isOddsToken(item.text));

		if (!oddsItems.length) continue;

		const leftText = row.items
			.filter((item) => item.x <= cardX + 24 && !isOddsToken(item.text))
			.map((item) => item.text)
			.join(' ')
			.replace(/\\s+/g, ' ')
			.trim();

		if (
			leftText &&
			/[A-Za-z]/.test(leftText) &&
			!/^cards?$/i.test(leftText) &&
			!isBoilerplate(leftText)
		) {
			return index;
		}
	}

	return -1;
}`;

source = replaceBetween(
	source,
	'function parsePage(rawRows) {',
	'function findLikelyDataRows(rows) {',
	parsePage,
	'parsePage'
);

const extractHeaders = `function extractFormatHeaders(headerRows, centers) {
	if (!headerRows.length) {
		return centers.map((x, index) => ({
			index,
			x,
			name: \`Format \${index + 1}\`,
			rawHeader: ''
		}));
	}

	const buckets = centers.map(() => []);
	const bounds = centers.map((center, index) => columnBounds(centers, index));

	for (const row of headerRows) {
		for (const item of row.items) {
			if (/^cards?$/i.test(item.text)) continue;

			let index = bounds.findIndex(
				(bound) => item.x >= bound.left && item.x < bound.right
			);

			if (index < 0) {
				index = nearestCenterIndex(item.centerX, centers);
			}

			if (index < 0) continue;

			buckets[index].push({
				y: row.y,
				x: item.x,
				text: item.text
			});
		}
	}

	return centers.map((center, index) => {
		const ordered = buckets[index]
			.sort((a, b) => b.y - a.y || a.x - b.x);

		const rawHeader = normalizeHeaderFragments(
			ordered.map((piece) => piece.text).join(' ')
		);

		const bottom = bottomUpFormat(buckets[index]);

		// Absolute fallback: preserve the full reconstructed source header rather
		// than reducing an unknown format to bogus labels such as "Series".
		const fallbackHeader = cleanFullHeader(rawHeader);

		const name =
			bottom.name ||
			extractKnownFormat(rawHeader) ||
			fallbackHeader ||
			\`Format \${index + 1}\`;

		return {
			index,
			x: center,
			name,
			rawHeader,
			formatHeader: bottom.bottomRaw
		};
	});
}

function cleanFullHeader(value) {
	return normalizeHeaderFragments(value)
		.replace(/^cards?\\s+/i, '')
		.replace(/\\s+/g, ' ')
		.trim();
}`;

source = replaceBetween(
	source,
	'function extractFormatHeaders(headerRows, centers) {',
	'function prettyFormatName(value) {',
	extractHeaders,
	'extractFormatHeaders'
);

fs.writeFileSync(path, source);

console.log('Absolute Topps odds header fix installed.');
