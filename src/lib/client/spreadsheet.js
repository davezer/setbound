import { browser } from '$app/environment';

const CARD_HEADER_ALIASES = [
	'#',
	'card',
	'card #',
	'card no',
	'card no.',
	'card number',
	'cardnumber',
	'number',
	'no.'
];

const SUBJECT_HEADER_ALIASES = [
	'subject',
	'name',
	'player',
	'player name',
	'superstar',
	'superstar name',
	'wrestler',
	'talent',
	'athlete',
	'character',
	'description',
	'player name'
];

const AFFILIATION_HEADER_ALIASES = [
	'affiliation',
	'team',
	'brand',
	'show',
	'program',
	'roster',
	'league',
	'property',
	'club',
	'country'
];

const ROOKIE_HEADER_ALIASES = ['rookie', 'rc', 'rookie card'];
const AUTO_HEADER_ALIASES = ['auto', 'autograph', 'autographed'];
const MEM_HEADER_ALIASES = ['relic', 'memorabilia', 'mem', 'patch'];

const FLAG_WORDS = new Set([
	'rookie',
	'rc',
	'rookie card',
	'auto',
	'autograph',
	'autographed',
	'relic',
	'memorabilia',
	'mem',
	'patch'
]);

const GENERIC_LABELS = new Set([
	'checklist',
	'base',
	'insert',
	'inserts',
	'autographs',
	'autograph',
	'relics',
	'relic'
]);

function text(value) {
	return String(value ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function key(value) {
	return text(value).toLowerCase();
}

function uppercaseRatio(value) {
	const letters = text(value).replace(/[^A-Za-z]/g, '');
	if (!letters) return 0;
	let upper = 0;
	for (const char of letters) {
		if (char === char.toUpperCase()) upper++;
	}
	return upper / letters.length;
}

function nonEmptyCells(row) {
	return row
		.map((value, index) => ({ value: text(value), index }))
		.filter((cell) => cell.value);
}

function isCardNumber(value) {
	if (value == null || value === '') return false;

	if (typeof value === 'number') {
		return Number.isFinite(value) && value > 0 && Number.isInteger(value);
	}

	const v = text(value);
	if (!v || v.length > 28 || /\s/.test(v)) return false;

	// Card IDs are messy:
	//   1
	//   TTN-1
	//   75D-AB
	//   NLA-AA
	//   AR-JC
	//
	// Inserts/autographs/relics often use letter-only prefixes/suffixes with a
	// hyphen and no digit at all, so requiring a digit drops perfectly valid rows.
	// A plain word such as "AUTOGRAPHS" still fails because it has no separator.
	if (/\d/.test(v) && /^[A-Z0-9._/-]+$/i.test(v)) return true;

	return /^[A-Z0-9]{1,12}(?:[-/.][A-Z0-9]{1,12})+$/i.test(v);
}

function looksLikeSection(row) {
	const cells = nonEmptyCells(row);
	if (!cells.length || cells.length > 2) return false;

	const label = cells.map((cell) => cell.value).join(' ').trim();
	if (!label || label.length > 100) return false;

	const normalized = key(label);
	if (GENERIC_LABELS.has(normalized)) return false;

	// A single numeric/card-code cell is not a section.
	if (cells.length === 1 && isCardNumber(cells[0].value)) return false;

	// Topps spreadsheets overwhelmingly use all-caps standalone section rows.
	return uppercaseRatio(label) >= 0.82;
}

function findHeaderMap(row) {
	const normalized = row.map(key);

	const find = (aliases) => normalized.findIndex((value) => aliases.includes(value));

	const card = find(CARD_HEADER_ALIASES);
	const subject = find(SUBJECT_HEADER_ALIASES);
	const firstName = find(['first name', 'firstname', 'player first name']);
	const lastName = find(['last name', 'lastname', 'surname', 'player last name']);

	if (card < 0 || (subject < 0 && firstName < 0)) return null;

	return {
		card,
		subject,
		firstName,
		lastName,
		affiliation: find(AFFILIATION_HEADER_ALIASES),
		rookie: find(ROOKIE_HEADER_ALIASES),
		autograph: find(AUTO_HEADER_ALIASES),
		memorabilia: find(MEM_HEADER_ALIASES)
	};
}

function isTruthyFlag(value) {
	const v = key(value);
	return ['1', 'true', 'yes', 'y', 'x', 'rc', 'rookie', 'auto', 'autograph', 'relic', 'mem', 'patch'].includes(v);
}

function makeCard({
	cardNumber,
	subject,
	affiliation = 'NIL',
	checklist,
	rookie = false,
	autograph = false,
	memorabilia = false,
	raw,
	confidence = 0.97
}) {
	return {
		card_number: text(cardNumber),
		subject: text(subject),
		affiliation: text(affiliation) || 'NIL',
		affiliation_id: null,
		rookie,
		autograph,
		memorabilia,
		serial_number: null,
		checklist_name: checklist || 'Uncategorized',
		confidence,
		raw
	};
}

function parseMappedRow(row, headerMap, section) {
	const cardNumber = row[headerMap.card];

	const subject =
		headerMap.subject >= 0
			? text(row[headerMap.subject])
			: [
					headerMap.firstName >= 0 ? text(row[headerMap.firstName]) : '',
					headerMap.lastName >= 0 ? text(row[headerMap.lastName]) : ''
				]
					.filter(Boolean)
					.join(' ')
					.replace(/\s+/g, ' ')
					.trim();

	if (!isCardNumber(cardNumber) || !subject) return null;

	let affiliation = headerMap.affiliation >= 0 ? text(row[headerMap.affiliation]) : '';
	const rookie = headerMap.rookie >= 0 && isTruthyFlag(row[headerMap.rookie]);
	const autograph =
		(headerMap.autograph >= 0 && isTruthyFlag(row[headerMap.autograph])) ||
		/\b(auto|autograph)\b/i.test(section);
	const memorabilia =
		(headerMap.memorabilia >= 0 && isTruthyFlag(row[headerMap.memorabilia])) ||
		/\b(relic|memorabilia|patch)\b/i.test(section);

	return makeCard({
		cardNumber,
		subject,
		affiliation: affiliation || 'NIL',
		checklist: section,
		rookie,
		autograph,
		memorabilia,
		raw: row.map(text).filter(Boolean).join(' | '),
		confidence: affiliation ? 0.99 : 0.94
	});
}

function parseShapeRow(row, section) {
	const cells = nonEmptyCells(row);
	if (cells.length < 2) return null;

	const numberPos = cells.findIndex((cell) => isCardNumber(row[cell.index]));
	if (numberPos < 0) return null;

	const numberCell = cells[numberPos];
	const after = cells.slice(numberPos + 1);
	if (!after.length) return null;

	const subjectCell = after[0];
	const subject = subjectCell.value;
	if (!subject) return null;

	let affiliation = '';
	let rookie = false;
	let autograph = /\b(auto|autograph)\b/i.test(section);
	let memorabilia = /\b(relic|memorabilia|patch)\b/i.test(section);

	for (const cell of after.slice(1)) {
		const value = cell.value;
		const normalized = key(value);

		if (['rookie', 'rc', 'rookie card'].includes(normalized)) {
			rookie = true;
			continue;
		}
		if (['auto', 'autograph', 'autographed'].includes(normalized)) {
			autograph = true;
			continue;
		}
		if (['relic', 'memorabilia', 'mem', 'patch'].includes(normalized)) {
			memorabilia = true;
			continue;
		}

		// Classification/status values are not affiliations.
		if (['legend', 'legends'].includes(normalized)) {
			continue;
		}

		// The first non-flag value after the subject is the affiliation/brand.
		if (!affiliation && !FLAG_WORDS.has(normalized)) {
			affiliation = value;
		}
	}

	return makeCard({
		cardNumber: numberCell.value,
		subject,
		affiliation: affiliation || 'NIL',
		checklist: section,
		rookie,
		autograph,
		memorabilia,
		raw: cells.map((cell) => cell.value).join(' | '),
		confidence: affiliation ? 0.97 : 0.92
	});
}

function parseSheetRows(rows, sheetName) {
	const cards = [];
	const sections = [];
	const checklist_meta = {};

	let section = 'Uncategorized';
	let headerMap = null;

	const ensureSection = (name) => {
		const safe = text(name) || 'Uncategorized';
		if (!sections.includes(safe)) sections.push(safe);
		if (!checklist_meta[safe]) {
			checklist_meta[safe] = {
				card_count_declared: null,
				parallels: [],
				notes: []
			};
		}
		return safe;
	};

	ensureSection(section);

	for (const rawRow of rows) {
		const row = Array.isArray(rawRow) ? rawRow : [];
		if (!nonEmptyCells(row).length) continue;

		const detectedHeader = findHeaderMap(row);
		if (detectedHeader) {
			headerMap = detectedHeader;
			continue;
		}

		if (looksLikeSection(row)) {
			const label = nonEmptyCells(row).map((cell) => cell.value).join(' ');
			section = ensureSection(label);
			headerMap = null;
			continue;
		}

		let card = null;

		if (headerMap) {
			card = parseMappedRow(row, headerMap, section);
		}

		if (!card) {
			card = parseShapeRow(row, section);
		}

		if (card) cards.push(card);
	}

	// Only expose sections that actually contain card rows. Spreadsheet files often
	// include category/title rows that are visually useful but are not real checklists.
	let usedSections = [...new Set(cards.map((card) => card.checklist_name).filter(Boolean))];

	if (usedSections.length === 1 && usedSections[0] === 'Uncategorized' && cards.length) {
		const fallback = text(sheetName) || 'Checklist';
		for (const card of cards) card.checklist_name = fallback;
		usedSections = [fallback];
	}

	const filteredMeta = {};
	for (const name of usedSections) {
		if (checklist_meta[name]) filteredMeta[name] = checklist_meta[name];
		else {
			filteredMeta[name] = { card_count_declared: null, parallels: [], notes: [] };
		}
	}

	return {
		cards,
		sections: usedSections,
		checklist_meta: filteredMeta
	};
}




const UPPER_DECK_VARIANT_RE = new RegExp(
	'\\b(parallel|foil|rainbow|script|printing plates?|outburst|high gloss|ud exclusives|deluxe|gold|silver|black|blue|red|green|purple|pink|orange|yellow|emerald|ruby|copper|jade|platinum|amber|rose|sky blue|teal|speckle|turquoise|auto|material)\\b|//',
	'i'
);

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
	const description = find(['description', 'name', 'player name']);
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
			/\\b(?:rookie|rookies|young guns?)\\b/i.test(label),
		autograph:
			autoFromColumn ||
			/\\b(?:auto|autograph|signatures?)\\b/i.test(label),
		memorabilia:
			memFromColumn ||
			/\\b(?:relic|memorabilia|materials?|swatch|patch|jersey)\\b/i.test(label)
	};
}

function upperDeckVariantScore(name) {
	const value = String(name || '');
	const matches = value.match(new RegExp(UPPER_DECK_VARIANT_RE.source, 'ig')) || [];

	let score = matches.length * 10;

	if (/\\bbase set\\b/i.test(value)) score -= 8;
	if (/\\bparallel\\b/i.test(value)) score += 4;
	if (value.includes('//')) score += 3;

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
					.replace(/\\s+/g, ' ')
					.trim();

				affiliation = [
					text(row[layout.teamCity]),
					text(row[layout.teamName])
				]
					.filter(Boolean)
					.join(' ')
					.replace(/\\s+/g, ' ')
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
						.replace(/\\s+/g, ' ')
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

			const sourceHasAffiliation =
				layout.team >= 0 ||
				(layout.teamCity >= 0 && layout.teamName >= 0);

			sourceRows.push({
				sheetName,
				rowNumber: index + 1,
				setName,
				cardNumber,
				subject,
				affiliation,
				sourceHasAffiliation,
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
				affiliation:
					row.affiliation ||
					(row.sourceHasAffiliation ? 'UNRESOLVED' : 'NIL'),
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
				confidence:
					row.affiliation
						? 0.99
						: row.sourceHasAffiliation
							? 0.72
							: 0.99
			});

			if (!row.affiliation && !row.sourceHasAffiliation) {
				card.affiliation_status = 'source-nil';
			}

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
	'printing plate', 'press proof', 'diamond plate', 'diamond', 'fireworks',
	'tie-dye', 'tri-color', 'maroon', 'pumpkins', 'slime'
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
	const suffix = text(value)
		.toLowerCase()
		.replace(/^[\s\-–—:|/]+/, '')
		.trim();

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

export async function extractSpreadsheetChecklist(file) {
	if (!browser) {
		throw new Error('Spreadsheet parsing is only available in the browser.');
	}

	const XLSX = await import('xlsx');
	const data = await file.arrayBuffer();
	const workbook = XLSX.read(data, {
		type: 'array',
		cellDates: false,
		cellText: true,
		raw: false
	});

	const upperDeck = parseUpperDeckWorkbook(XLSX, workbook);
	if (upperDeck) return upperDeck;

	const panini = parsePaniniWorkbook(XLSX, workbook);
	if (panini) return panini;

	const allCards = [];
	const allSections = [];
	const checklist_meta = {};
	const sheetStats = [];

	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];

		const rows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: '',
			raw: false,
			blankrows: false
		});

		const parsed = parseSheetRows(rows, sheetName);

		for (const section of parsed.sections) {
			if (!allSections.includes(section)) allSections.push(section);
		}

		Object.assign(checklist_meta, parsed.checklist_meta);
		allCards.push(...parsed.cards);

		sheetStats.push({
			name: sheetName,
			rows: rows.length,
			cards: parsed.cards.length,
			sections: parsed.sections.length
		});
	}

	// Final safety pass across the whole workbook. Only sections that actually
	// own at least one parsed card are allowed out of the spreadsheet parser.
	const usedSections = [...new Set(
		allCards.map((card) => card.checklist_name || 'Uncategorized').filter(Boolean)
	)];

	const prunedMeta = {};
	for (const section of usedSections) {
		prunedMeta[section] = checklist_meta[section] || {
			card_count_declared: null,
			parallels: [],
			notes: []
		};
	}

	const high = allCards.filter((card) => card.confidence >= 0.85).length;
	const review = allCards.length - high;

	if (!allCards.length) {
		throw new Error(
			'No card rows were detected in this spreadsheet. The workbook loaded, but its column layout needs a parser mapping.'
		);
	}

	return {
		sections: usedSections,
		cards: allCards,
		checklist_meta: prunedMeta,
		metaSections: 0,
		high,
		review,
		lines: sheetStats.reduce((sum, sheet) => sum + sheet.rows, 0),
		sheetStats,
		sourceKind: 'spreadsheet'
	};
}
