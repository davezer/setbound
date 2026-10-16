import fs from 'node:fs';

const path = 'src/lib/client/spreadsheet.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const start = source.indexOf('function findUpperDeckHeader(');
const end = source.indexOf('\nconst PANINI_PARALLEL_PREFIXES = [', start);

if (start < 0 || end < 0) {
	throw new Error('Could not find the current Upper Deck parser block.');
}

const replacement = `
const UPPER_DECK_VARIANT_RE =
	/\\\\b(parallel|foil|rainbow|script|printing plates?|outburst|high gloss|ud exclusives|deluxe|gold|silver|black|blue|red|green|purple|pink|orange|yellow|emerald|ruby|copper|jade|platinum|amber|rose|sky blue|teal|speckle|turquoise|auto|material)\\\\b|\\\\/\\\\//i;

function findUpperDeckLayout(row) {
	const normalized = row.map(key);
	const find = (aliases) => normalized.findIndex((value) => aliases.includes(value));

	// Layout A: Upper Deck's own cleaner workbook style.
	const setName = find(['set name']);
	const cardHash = find(['card #']);
	const firstName = find(['first name']);
	const lastName = find(['last name']);
	const teamCityCompact = find(['teamcity']);
	const teamNameCompact = find(['teamname']);
	const notes = find(['notes']);

	if (
		setName >= 0 &&
		cardHash >= 0 &&
		firstName >= 0 &&
		teamCityCompact >= 0 &&
		teamNameCompact >= 0
	) {
		return {
			kind: 'split-name',
			setName,
			cardNumber: cardHash,
			firstName,
			lastName,
			teamCity: teamCityCompact,
			teamName: teamNameCompact,
			notes
		};
	}

	// Layout B: Checklist Insider's Upper Deck export.
	const card = find(['card', 'card #']);
	const description = find(['description']);
	const team = find(['team']);
	const teamCity = find(['team city']);
	const teamName = find(['team name']);
	const rookie = find(['rookie']);
	const auto = find(['auto']);
	const mem = find(['mem', 'mem/tech']);
	const tech = find(['tech']);
	const serial = find(["#'d", "serial #'d"]);
	const odds = find(['odds', 'stated odds']);

	if (setName >= 0 && card >= 0 && description >= 0) {
		return {
			kind: 'checklist-insider',
			setName,
			cardNumber: card,
			description,
			team,
			teamCity,
			teamName,
			rookie,
			auto,
			mem,
			tech,
			serial,
			odds
		};
	}

	return null;
}

function upperDeckTruthy(value) {
	const v = key(value);
	return Boolean(v && !['0', 'no', 'n', 'false', '-'].includes(v));
}

function upperDeckFlags(setName, row, layout) {
	const label = String(setName || '');

	const rookieFromColumn =
		layout.rookie >= 0 &&
		upperDeckTruthy(row[layout.rookie]);

	const autoFromColumn =
		layout.auto >= 0 &&
		upperDeckTruthy(row[layout.auto]);

	const memFromColumn =
		layout.mem >= 0 &&
		upperDeckTruthy(row[layout.mem]);

	return {
		rookie:
			rookieFromColumn ||
			/\\\\b(?:rookie|rookies|young guns?)\\\\b/i.test(label),
		autograph:
			autoFromColumn ||
			/\\\\b(?:auto|autograph|signatures?)\\\\b/i.test(label),
		memorabilia:
			memFromColumn ||
			/\\\\b(?:relic|memorabilia|materials?|swatch|patch|jersey)\\\\b/i.test(label)
	};
}

function upperDeckVariantScore(name) {
	const value = String(name || '');
	const matches = value.match(new RegExp(UPPER_DECK_VARIANT_RE.source, 'ig')) || [];

	let score = matches.length * 10;

	if (/\\\\bbase set\\\\b/i.test(value)) score -= 8;
	if (/\\\\bparallel\\\\b/i.test(value)) score += 4;
	if (/\\\\/\\\\//.test(value)) score += 3;

	return score;
}

function upperDeckRosterSignature(rows) {
	return rows
		.map((row) => [
			key(row.cardNumber),
			key(row.subject),
			key(row.affiliation)
		].join('|'))
		.sort()
		.join('||');
}

function upperDeckSemanticKey(rows) {
	const auto = rows.some((row) => row.autograph) ? 'auto' : 'no-auto';
	const mem = rows.some((row) => row.memorabilia) ? 'mem' : 'no-mem';

	return [auto, mem, upperDeckRosterSignature(rows)].join('||');
}

function chooseUpperDeckRoot(names) {
	return [...names].sort((a, b) => {
		const scoreDiff = upperDeckVariantScore(a) - upperDeckVariantScore(b);
		if (scoreDiff) return scoreDiff;

		const lengthDiff = a.length - b.length;
		if (lengthDiff) return lengthDiff;

		return a.localeCompare(b);
	})[0];
}

function upperDeckParallelLabel(name, rows) {
	const serials = [...new Set(
		rows
			.map((row) => text(row.serial))
			.filter(Boolean)
	)];

	if (serials.length === 1) {
		return name + ' /' + serials[0];
	}

	if (serials.length > 1) {
		return name + ' (serial varies)';
	}

	return name;
}

function parseUpperDeckWorkbook(XLSX, workbook) {
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

		let layout = null;
		let headerIndex = -1;

		for (let index = 0; index < Math.min(rows.length, 25); index++) {
			const found = findUpperDeckLayout(
				Array.isArray(rows[index]) ? rows[index] : []
			);

			if (found) {
				layout = found;
				headerIndex = index;
				break;
			}
		}

		if (!layout) {
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

			const setName = text(row[layout.setName]);
			const cardNumber = text(row[layout.cardNumber]);

			let subject = '';
			let affiliation = '';
			let notes = '';
			let serial = '';

			if (layout.kind === 'split-name') {
				subject = [
					text(row[layout.firstName]),
					layout.lastName >= 0 ? text(row[layout.lastName]) : ''
				]
					.filter(Boolean)
					.join(' ')
					.replace(/\\\\s+/g, ' ')
					.trim();

				affiliation = [
					text(row[layout.teamCity]),
					text(row[layout.teamName])
				]
					.filter(Boolean)
					.join(' ')
					.replace(/\\\\s+/g, ' ')
					.trim();

				notes = layout.notes >= 0 ? text(row[layout.notes]) : '';
			} else {
				subject = text(row[layout.description]);

				if (layout.team >= 0) {
					affiliation = text(row[layout.team]);
				} else {
					affiliation = [
						layout.teamCity >= 0 ? text(row[layout.teamCity]) : '',
						layout.teamName >= 0 ? text(row[layout.teamName]) : ''
					]
						.filter(Boolean)
						.join(' ')
						.replace(/\\\\s+/g, ' ')
						.trim();
				}

				serial =
					layout.serial >= 0
						? text(row[layout.serial])
						: '';

				notes =
					layout.odds >= 0
						? text(row[layout.odds])
						: '';
			}

			if (!setName || !cardNumber || !subject) continue;
			if (!isCardNumber(cardNumber)) continue;

			const flags = upperDeckFlags(setName, row, layout);

			sourceRows.push({
				sheetName,
				rowNumber: index + 1,
				setName,
				cardNumber,
				subject,
				affiliation,
				rookie: flags.rookie,
				autograph: flags.autograph,
				memorabilia: flags.memorabilia,
				serial,
				notes
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
			'Upper Deck spreadsheet layout was detected, but no checklist rows were found.'
		);
	}

	const sets = new Map();

	for (const row of sourceRows) {
		if (!sets.has(row.setName)) sets.set(row.setName, []);
		sets.get(row.setName).push(row);
	}

	const semanticGroups = new Map();

	for (const [name, rows] of sets) {
		const groupKey = upperDeckSemanticKey(rows);

		if (!semanticGroups.has(groupKey)) {
			semanticGroups.set(groupKey, []);
		}

		semanticGroups.get(groupKey).push(name);
	}

	const cards = [];
	const sections = [];
	const checklist_meta = {};
	let duplicateRowsRemoved = 0;
	let parallelRowsCollapsed = 0;
	let parallelSetCount = 0;

	for (const names of semanticGroups.values()) {
		const rootName = chooseUpperDeckRoot(names);
		const rootRows = sets.get(rootName) || [];

		const dedupe = new Map();

		for (const row of rootRows) {
			const dedupeKey = [
				key(row.cardNumber),
				key(row.subject),
				key(row.affiliation)
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
				subject: row.subject,
				affiliation: row.affiliation || 'UNRESOLVED',
				checklist: rootName,
				rookie: row.rookie,
				autograph: row.autograph,
				memorabilia: row.memorabilia,
				raw: [
					row.setName,
					row.cardNumber,
					row.subject,
					row.affiliation,
					row.serial,
					row.notes
				].filter(Boolean).join(' | '),
				confidence: row.affiliation ? 0.99 : 0.72
			});

			card.serial_number = row.serial || null;
			rootCards.push(card);
		}

		if (!rootCards.length) continue;

		const variants = names.filter((name) => name !== rootName);

		const parallels = variants
			.map((name) => upperDeckParallelLabel(name, sets.get(name) || []))
			.filter(Boolean);

		for (const child of variants) {
			parallelRowsCollapsed += (sets.get(child) || []).length;
		}

		parallelSetCount += variants.length;

		sections.push(rootName);
		cards.push(...rootCards);

		checklist_meta[rootName] = {
			card_count_declared: rootCards.length,
			parallels: [...new Set(parallels)],
			notes: []
		};
	}

	const high = cards.filter((card) => card.confidence >= 0.85).length;
	const review = cards.length - high;

	const rawToCardRatio = sourceRows.length / Math.max(cards.length, 1);

	const blocked =
		cards.length > 4000 ||
		(cards.length > 2500 && sections.length <= 3) ||
		(rawToCardRatio < 1.05 && sourceRows.length > 2000);

	const reasons = [];

	if (cards.length > 4000) {
		reasons.push('Upper Deck parser still produced ' + cards.length.toLocaleString() + ' cards.');
	}

	if (cards.length > 2500 && sections.length <= 3) {
		reasons.push(cards.length.toLocaleString() + ' cards were collapsed into only ' + sections.length + ' checklist families.');
	}

	if (rawToCardRatio < 1.05 && sourceRows.length > 2000) {
		reasons.push(
			'Almost every Upper Deck source row survived as a card, which usually means parallel rows were not collapsed.'
		);
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
		sourceKind: 'upper-deck-spreadsheet',
		upperDeckStats: {
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

source = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(path, source);

console.log('Upper Deck parser v2 installed.');
