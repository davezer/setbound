import fs from 'node:fs';

function replaceBetween(source, startMarker, endMarker, replacement, label) {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);

	if (start < 0 || end < 0) {
		throw new Error(`${label}: could not find the expected code block.`);
	}

	return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
}

function patchOddsParser() {
	const path = 'src/lib/client/odds-pdf.js';
	let source = fs.readFileSync(path, 'utf8');

	const cleanBlock = `function prettyFormatName(value) {
	let text = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

	text = text.replace(/\\b\\w/g, (letter) => letter.toUpperCase());

	return text
		.replace(/\\bEa\\b/g, 'EA')
		.replace(/\\bSe\\b/g, 'SE')
		.replace(/\\bCe\\b/g, 'CE')
		.replace(/\\bCee\\b/g, 'CEE')
		.replace(/\\bHta\\b/g, 'HTA')
		.replace(/\\bFotl\\b/g, 'FOTL')
		.replace(/\\bAsg\\b/g, 'ASG')
		.replace(/\\bMlb\\b/g, 'MLB')
		.replace(/\\bNfl\\b/g, 'NFL')
		.replace(/\\bNba\\b/g, 'NBA')
		.replace(/\\bNhl\\b/g, 'NHL');
}

function extractKnownFormat(value) {
	const text = String(value || '')
		.toUpperCase()
		.replace(/[–—]/g, '-')
		.replace(/\\s+/g, ' ')
		.trim();

	if (!text) return '';

	// These are the collector-facing package labels Topps prints on the
	// bottom line of its odds headers. Product/SKU text above them is noise.
	const patterns = [
		/FANATICS FEST VALUE BOX\\b/g,
		/FANATICS FEST(?: N)? HOBBY\\b/g,
		/CLUB SUPER BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/ASG MEGA(?: BOX)?(?: (?:EA|SE|CE|CEE))?\\b/g,
		/HANGER BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/DISPLAY BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/VALUE BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/SUPER BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/FAT PACK(?: (?:EA|SE|CE|CEE))?\\b/g,
		/MEGA BOX(?: (?:EA|SE|CE|CEE))?\\b/g,
		/MEGA(?: (?:EA|SE|CE|CEE))\\b/g,
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

			if (
				!best ||
				candidate.index > best.index ||
				(candidate.index === best.index && candidate.value.length > best.value.length)
			) {
				best = candidate;
			}
		}
	}

	return best ? prettyFormatName(best.value) : '';
}

function cleanHumanFormat(value) {
	let text = String(value || '').replace(/\\s+/g, ' ').trim();

	text = text
		.replace(/^cards?\\s+/i, '')
		.replace(/\\s+cards?$/i, '')
		.trim();

	// First choice: ignore the SKU/product wording completely and take the
	// package-format phrase Topps prints at the bottom of the column.
	const known = extractKnownFormat(text);
	if (known) return known;

	// Fallback for a format we have not seen yet: everything after the final
	// four-digit product year is more likely to be the package label than the
	// SKU/product family printed before it.
	const years = [...text.matchAll(/\\b20\\d{2}\\b/g)];

	if (years.length) {
		const lastYear = years.at(-1);
		const tail = text.slice(lastYear.index + lastYear[0].length).trim();

		if (tail && !looksLikeSku(tail)) {
			return prettyFormatName(tail);
		}
	}

	// Legacy fallback.
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
		cleanBlock,
		'cleanHumanFormat'
	);

	const validationBlock = `function validateFormats(formats) {
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

	// Duplicate human labels are VALID. Topps frequently has multiple Hobby,
	// Mega, Value Box, etc. columns differentiated only by internal SKU.
	return issues;
}`;

	source = replaceBetween(
		source,
		'function validateFormats(formats) {',
		'function looksLikeSku(value) {',
		validationBlock,
		'validateFormats'
	);

	const mergeBlock = `function mergeRows(pages, formats) {
	const rows = [];

	for (const page of pages) {
		const sameColumnCount = page.formats.length === formats.length;

		const localRawHeaders = page.formats.map((format) =>
			String(format.rawHeader || '').replace(/\\s+/g, ' ').trim().toLowerCase()
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
					.replace(/\\s+/g, ' ')
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
				name: row.name.replace(/\\s+/g, ' ').trim(),
				values
			});
		}
	}

	return rows.filter((row) => row.name && row.values.some(Boolean));
}`;

	source = replaceBetween(
		source,
		'function mergeRows(pages, formats) {',
		'function findDisclaimer(pages) {',
		mergeBlock,
		'mergeRows'
	);

	fs.writeFileSync(path, source);
	console.log('Odds PDF parser patched.');
}

function patchHarvesterValidation() {
	const path = 'src/routes/admin/source-harvester/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');

	const block = `\tfunction oddsProblems(parsedOdds, names) {
\t\tif (!parsedOdds) return [];

\t\t// Validate only what is actually wrong with the editable label.
\t\t// Repeated labels are valid because separate Topps SKUs can share the
\t\t// same collector-facing format name (Hobby, Mega EA, etc.).
\t\tconst issues = [];

\t\tfor (let index = 0; index < names.length; index++) {
\t\t\tconst name = String(names[index] || '').trim();

\t\t\tif (!name || /^format \\d+$/i.test(name)) {
\t\t\t\tissues.push(\`Column \${index + 1} needs a real pack-format name.\`);
\t\t\t}

\t\t\tif (/^\\d{3,}\\b/.test(name) || /MLB-|NFL-|NBA-|NHL-/i.test(name)) {
\t\t\t\tissues.push(\`"\${name}" still looks like a SKU/product code.\`);
\t\t\t}

\t\t\tif (/^cards?\\b/i.test(name)) {
\t\t\t\tissues.push(\`"\${name}" incorrectly includes the Card column heading.\`);
\t\t\t}
\t\t}

\t\treturn [...new Set(issues)];
\t}`;

	source = replaceBetween(
		source,
		'\tfunction oddsProblems(parsedOdds, names) {',
		'\tfunction rowReadyState(row) {',
		block,
		'Harvester oddsProblems'
	);

	fs.writeFileSync(path, source);
	console.log('Harvester odds verification patched.');
}

patchOddsParser();
patchHarvesterValidation();

console.log('');
console.log('Topps bottom-line odds format extraction fix applied.');
