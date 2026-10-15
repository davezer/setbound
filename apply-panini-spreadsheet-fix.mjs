import fs from 'node:fs';

function patchSpreadsheetParser() {
	const path = 'src/lib/client/spreadsheet.js';

	if (!fs.existsSync(path)) {
		throw new Error(`Could not find ${path}`);
	}

	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes('function parsePaniniWorkbook(')) {
		const marker = '\nexport async function extractSpreadsheetChecklist(file) {';

		if (!source.includes(marker)) {
			throw new Error('Could not find spreadsheet parser export anchor.');
		}

		const paniniCode = String.raw`

const PANINI_PARALLEL_PREFIXES = [
	'prizms', 'prizm', 'optic', 'holo', 'laser', 'lava', 'dots', 'velocity',
	'mojo', 'shimmer', 'pulsar', 'wave', 'ice', 'seismic', 'checkerboard',
	'genesis', 'glitter', 'finite', 'pandora', 'artist proof', 'proof',
	'parallel', 'cubic', 'dragon', 'circles', 'camo', 'vinyl', 'lattice',
	'choice', 'preferred', 'disco', 'scope', 'cracked ice', 'hyper',
	'silver', 'bronze', 'gold', 'black', 'blue', 'red', 'green', 'purple',
	'pink', 'orange', 'yellow', 'white', 'teal', 'aqua', 'carolina blue',
	'light blue', 'lime green', 'neon', 'cherry blossom', 'forest',
	'rainbow', 'platinum', 'prime', 'numbered', 'anniversary', 'fractal',
	'cosmic', 'zebra', 'tiger', 'elephant', 'snakeskin', 'flash',
	'sparkle', 'premium', 'box set', 'fotl', 'retail', 'team logo',
	'wnba logo', 'celestial', 'power', 'golden', 'ruby', 'emerald',
	'checkered flag', 'checkered flags', 'numbers', 'printing plate black',
	'printing plate cyan', 'printing plate magenta', 'printing plate yellow',
	'printing plate', 'press proof', 'diamond plate', 'diamond', 'fireworks'
];

function findPaniniHeader(row) {
	const normalized = row.map(key);

	const find = (aliases) =>
		normalized.findIndex((value) => aliases.includes(value));

	const cardSet = find(['card set', 'cardset']);
	const cardNumber = find(['card #', 'card number', 'card no', 'card no.']);
	const athlete = find(['athlete', 'player', 'subject', 'name']);

	if (cardSet < 0 || cardNumber < 0 || athlete < 0) return null;

	return {
		cardSet,
		cardNumber,
		athlete,
		team: find(['team', 'affiliation']),
		seq: find(['seq', 'serial', 'serial number', 'numbered to'])
	};
}

function isPaniniParallelSuffix(value) {
	const suffix = text(value).toLowerCase();
	if (!suffix) return false;

	if (/^\d+(?:st|nd|rd|th)\s+anniversary\b/.test(suffix)) return true;

	return PANINI_PARALLEL_PREFIXES.some(
		(prefix) => suffix === prefix || suffix.startsWith(prefix + ' ')
	);
}

function paniniRosterSignature(rows) {
	return rows
		.map((row) => [
			key(row.cardNumber),
			key(row.athlete),
			key(row.team)
		].join('|'))
		.sort()
		.join('||');
}

function buildPaniniParentMap(sets) {
	const names = [...sets.keys()];
	const parents = new Map();

	// Most Panini parallel names preserve the parent checklist as an exact prefix:
	// Base -> Base Prizms Gold
	// Downtown -> Downtown Optic
	// Amplitude -> Amplitude Red
	for (const name of names) {
		const candidates = [];

		for (const candidate of names) {
			if (candidate.length >= name.length) continue;
			if (!name.toLowerCase().startsWith(candidate.toLowerCase() + ' ')) continue;

			const suffix = name.slice(candidate.length).trim();

			if (isPaniniParallelSuffix(suffix)) {
				candidates.push(candidate);
			}
		}

		if (candidates.length) {
			parents.set(name, candidates.sort((a, b) => b.length - a.length)[0]);
		}
	}

	// Contenders products use different "Ticket" names for the same underlying
	// checklist rather than a shared prefix. Only collapse tickets when the
	// complete card roster is identical, while preserving Variation and
	// Signatures as distinct checklist families.
	const ticketGroups = new Map();

	for (const name of names) {
		if (!/\bticket\b/i.test(name)) continue;

		const rows = sets.get(name) || [];
		const semantic = [
			/\bvariation\b/i.test(name) ? 'variation' : 'standard',
			/\bsignatures?\b/i.test(name) ? 'signatures' : 'cards',
			paniniRosterSignature(rows)
		].join('|');

		if (!ticketGroups.has(semantic)) ticketGroups.set(semantic, []);
		ticketGroups.get(semantic).push(name);
	}

	for (const group of ticketGroups.values()) {
		if (group.length < 2) continue;

		const season = group.filter((name) => /^season\b/i.test(name));
		const canonical = (season.length ? season : group)
			.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];

		for (const name of group) {
			if (name !== canonical) parents.set(name, canonical);
		}
	}

	return parents;
}

function resolvePaniniRoot(name, parents) {
	const visited = new Set();
	let current = name;

	while (parents.has(current) && !visited.has(current)) {
		visited.add(current);
		current = parents.get(current);
	}

	return current;
}

function paniniParallelLabel(childName, rootName, rows) {
	let label = childName;

	if (childName.toLowerCase().startsWith(rootName.toLowerCase() + ' ')) {
		label = childName.slice(rootName.length).trim();
	}

	const seqValues = [...new Set(
		rows
			.map((row) => text(row.seq))
			.filter(Boolean)
	)];

	if (seqValues.length === 1) {
		return label + ' /' + seqValues[0];
	}

	if (seqValues.length > 1) {
		return label + ' (serial varies)';
	}

	return label;
}

function paniniFlags(checklistName) {
	const value = String(checklistName || '');

	return {
		rookie: /\b(?:rookie|rated rookies?)\b/i.test(value),
		autograph: /\b(?:auto|autograph|signatures?|signings?|ink)\b/i.test(value),
		memorabilia: /\b(?:relic|memorabilia|materials?|swatches?|patch|jersey)\b/i.test(value)
	};
}

function parsePaniniWorkbook(XLSX, workbook) {
	const sourceRows = [];
	const sheetStats = [];
	let detected = false;

	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];

		const rows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: '',
			raw: false,
			blankrows: false
		});

		let header = null;
		let headerIndex = -1;

		for (let index = 0; index < Math.min(rows.length, 25); index++) {
			const found = findPaniniHeader(Array.isArray(rows[index]) ? rows[index] : []);

			if (found) {
				header = found;
				headerIndex = index;
				break;
			}
		}

		if (!header) {
			sheetStats.push({
				name: sheetName,
				rows: rows.length,
				sourceRows: 0,
				detected: false
			});
			continue;
		}

		detected = true;
		let accepted = 0;

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const row = Array.isArray(rows[index]) ? rows[index] : [];

			const cardSet = text(row[header.cardSet]);
			const cardNumber = text(row[header.cardNumber]);
			const athlete = text(row[header.athlete]);
			const team = header.team >= 0 ? text(row[header.team]) : '';
			const seq = header.seq >= 0 ? text(row[header.seq]) : '';

			if (!cardSet || !cardNumber || !athlete) continue;
			if (!isCardNumber(cardNumber)) continue;

			sourceRows.push({
				sheetName,
				rowNumber: index + 1,
				cardSet,
				cardNumber,
				athlete,
				team,
				seq
			});

			accepted += 1;
		}

		sheetStats.push({
			name: sheetName,
			rows: rows.length,
			sourceRows: accepted,
			detected: true
		});
	}

	if (!detected) return null;

	if (!sourceRows.length) {
		throw new Error(
			'Panini spreadsheet layout was detected, but no checklist rows were found.'
		);
	}

	const sets = new Map();

	for (const row of sourceRows) {
		if (!sets.has(row.cardSet)) sets.set(row.cardSet, []);
		sets.get(row.cardSet).push(row);
	}

	const parents = buildPaniniParentMap(sets);
	const rootNames = [...sets.keys()].filter(
		(name) => resolvePaniniRoot(name, parents) === name
	);

	const cards = [];
	const sections = [];
	const checklist_meta = {};
	let duplicateRowsRemoved = 0;
	let parallelRowsCollapsed = 0;
	let parallelSetCount = 0;

	for (const rootName of rootNames) {
		const rootRows = sets.get(rootName) || [];
		const flags = paniniFlags(rootName);

		const dedupe = new Map();

		for (const row of rootRows) {
			const dedupeKey = [
				key(row.cardNumber),
				key(row.athlete),
				key(row.team)
			].join('|');

			if (dedupe.has(dedupeKey)) {
				duplicateRowsRemoved += 1;
				continue;
			}

			dedupe.set(dedupeKey, row);
		}

		const rootCards = [];

		for (const row of dedupe.values()) {
			const card = makeCard({
				cardNumber: row.cardNumber,
				subject: row.athlete,
				affiliation: row.team || 'NIL',
				checklist: rootName,
				rookie: flags.rookie,
				autograph: flags.autograph,
				memorabilia: flags.memorabilia,
				raw: [
					row.cardSet,
					row.cardNumber,
					row.athlete,
					row.team,
					row.seq
				].filter(Boolean).join(' | '),
				confidence: row.team ? 0.99 : 0.94
			});

			card.serial_number = row.seq || null;
			rootCards.push(card);
		}

		if (!rootCards.length) continue;

		const children = [...sets.keys()].filter(
			(name) => name !== rootName && resolvePaniniRoot(name, parents) === rootName
		);

		const parallels = children
			.map((name) => paniniParallelLabel(name, rootName, sets.get(name) || []))
			.filter(Boolean);

		for (const child of children) {
			parallelRowsCollapsed += (sets.get(child) || []).length;
		}

		parallelSetCount += children.length;

		sections.push(rootName);
		cards.push(...rootCards);

		checklist_meta[rootName] = {
			card_count_declared: rootCards.length,
			parallels: [...new Set(parallels)],
			notes: []
		};
	}

	if (!cards.length) {
		throw new Error('Panini spreadsheet was recognized, but no base checklist families remained after parallel collapsing.');
	}

	const high = cards.filter((card) => card.confidence >= 0.85).length;
	const review = cards.length - high;

	const rawToCardRatio = sourceRows.length / Math.max(cards.length, 1);
	const blocked =
		cards.length > 6000 ||
		(cards.length > 3500 && sections.length <= 3) ||
		(rawToCardRatio < 1.05 && sourceRows.length > 2500);

	const reasons = [];

	if (cards.length > 6000) {
		reasons.push('Parser still produced ' + cards.length.toLocaleString() + ' cards.');
	}

	if (cards.length > 3500 && sections.length <= 3) {
		reasons.push(cards.length.toLocaleString() + ' cards were collapsed into only ' + sections.length + ' checklist families.');
	}

	if (rawToCardRatio < 1.05 && sourceRows.length > 2500) {
		reasons.push('Almost every Panini source row survived as a card, which usually means parallel rows were not collapsed.');
	}

	return {
		sections,
		cards,
		checklist_meta,
		metaSections: 0,
		high,
		review,
		lines: sheetStats.reduce((sum, sheet) => sum + sheet.rows, 0),
		sheetStats,
		sourceKind: 'panini-spreadsheet',
		paniniStats: {
			sourceRows: sourceRows.length,
			sourceSets: sets.size,
			checklistFamilies: sections.length,
			cards: cards.length,
			parallelSetCount,
			parallelRowsCollapsed,
			duplicateRowsRemoved
		},
		safety: {
			blocked,
			reasons
		}
	};
}
`;

		source = source.replace(marker, `${paniniCode}${marker}`);
		console.log('Added Panini CARD SET / CARD # / ATHLETE / TEAM / SEQ parser.');
	} else {
		console.log('Panini parser is already present.');
	}

	const oldAnchor = `\tconst allCards = [];\n`;
	const newAnchor = `\tconst panini = parsePaniniWorkbook(XLSX, workbook);
\tif (panini) return panini;

\tconst allCards = [];
`;

	if (!source.includes('const panini = parsePaniniWorkbook(XLSX, workbook);')) {
		if (!source.includes(oldAnchor)) {
			throw new Error('Could not find spreadsheet workbook parse anchor.');
		}

		source = source.replace(oldAnchor, newAnchor);
		console.log('Connected Panini parser before the generic spreadsheet fallback.');
	}

	fs.writeFileSync(path, source);
}

function patchHarvesterSafety() {
	const path = 'src/routes/admin/source-harvester/+page.svelte';

	if (!fs.existsSync(path)) {
		throw new Error(`Could not find ${path}`);
	}

	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes("status: 'parse-review'")) {
		const anchor = `\tfunction rowReadyState(row) {
\t\tif (!row?.parsed) return row;

\t\tconst unresolved = row.parsed.cards.filter(`;

		const replacement = `\tfunction rowReadyState(row) {
\t\tif (!row?.parsed) return row;

\t\tif (row.parsed.safety?.blocked) {
\t\t\treturn {
\t\t\t\t...row,
\t\t\t\tstatus: 'parse-review',
\t\t\t\tstatusText: 'Suspicious spreadsheet parse'
\t\t\t};
\t\t}

\t\tconst unresolved = row.parsed.cards.filter(`;

		if (!source.includes(anchor)) {
			throw new Error('Could not find rowReadyState() safety anchor in Source Harvester.');
		}

		source = source.replace(anchor, replacement);
		console.log('Added suspicious spreadsheet blocking to Harvester.');
	}

	if (!source.includes('source rows →')) {
		const metricsAnchor = `\t\t\t\t\t\t\t\t\t<span>{row.parsed.sections.length} sections</span>
\t\t\t\t\t\t\t\t\t<span>{row.audit?.totals?.review || 0} review flags</span>`;

		const metricsReplacement = `\t\t\t\t\t\t\t\t\t<span>{row.parsed.sections.length} sections</span>
\t\t\t\t\t\t\t\t\t{#if row.parsed.paniniStats}
\t\t\t\t\t\t\t\t\t\t<span>{row.parsed.paniniStats.sourceRows.toLocaleString()} source rows → {row.parsed.paniniStats.cards.toLocaleString()} checklist cards</span>
\t\t\t\t\t\t\t\t\t\t<span>{row.parsed.paniniStats.parallelSetCount.toLocaleString()} parallel sets collapsed</span>
\t\t\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t\t\t<span>{row.audit?.totals?.review || 0} review flags</span>`;

		if (source.includes(metricsAnchor)) {
			source = source.replace(metricsAnchor, metricsReplacement);
			console.log('Added Panini collapse diagnostics to prepared rows.');
		} else {
			console.warn('Harvester metrics anchor not found; diagnostics UI was skipped.');
		}
	}

	if (!source.includes("row.status === 'parse-review'")) {
		const actionsAnchor = `{#if row.status === 'review'}<button class="secondary" onclick={() => openReview(index)}>Review checklist inline →</button>{/if}`;

		const actionsReplacement = `{#if row.status === 'review'}<button class="secondary" onclick={() => openReview(index)}>Review checklist inline →</button>{/if}
							{#if row.status === 'parse-review'}
								<span class="action-note">Import blocked: suspicious spreadsheet parse</span>
								<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry prepare</button>
							{/if}`;

		if (source.includes(actionsAnchor)) {
			source = source.replace(actionsAnchor, actionsReplacement);
			console.log('Added blocked-parse action state.');
		}
	}

	const summaryOld = `\t\tconst oddsReview = queue.filter((row) => row.status === 'odds-review').length;
\t\tconst failed = queue.filter((row) => row.status === 'error' || row.status === 'odds-error').length;
\t\tmessage = \`${'${ready}'} ready · ${'${review}'} checklist review · ${'${oddsReview}'} odds review · ${'${failed}'} failed\`;`;

	const summaryNew = `\t\tconst oddsReview = queue.filter((row) => row.status === 'odds-review').length;
\t\tconst parseReview = queue.filter((row) => row.status === 'parse-review').length;
\t\tconst failed = queue.filter((row) => row.status === 'error' || row.status === 'odds-error').length;
\t\tmessage = \`${'${ready}'} ready · ${'${review}'} checklist review · ${'${parseReview}'} parse review · ${'${oddsReview}'} odds review · ${'${failed}'} failed\`;`;

	if (source.includes(summaryOld)) {
		source = source.replace(summaryOld, summaryNew);
		console.log('Added parse-review count to batch summary.');
	}

	fs.writeFileSync(path, source);
}

patchSpreadsheetParser();
patchHarvesterSafety();

console.log('');
console.log('Panini spreadsheet fix applied.');
console.log('Re-prepare Panini products in Source Harvester to use the corrected parser.');
