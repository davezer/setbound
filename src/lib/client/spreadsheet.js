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
	'athlete'
];

const AFFILIATION_HEADER_ALIASES = [
	'affiliation',
	'team',
	'brand',
	'show',
	'program',
	'roster',
	'league'
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

	// Card IDs are messy: 1, TTN-1, 75D-AB, AU-CODY, etc.
	// Require at least one digit so normal headings are not mistaken for cards.
	return /\d/.test(v) && /^[A-Z0-9._/-]+$/i.test(v);
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

	if (card < 0 || subject < 0) return null;

	return {
		card,
		subject,
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
	const subject = row[headerMap.subject];

	if (!isCardNumber(cardNumber) || !text(subject)) return null;

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

	// If a workbook sheet itself has a useful name and everything was otherwise
	// uncategorized, use the sheet name rather than exposing "Uncategorized".
	const meaningfulSections = sections.filter((name) => name !== 'Uncategorized');
	if (!meaningfulSections.length && cards.length) {
		const fallback = text(sheetName) || 'Checklist';

		for (const card of cards) card.checklist_name = fallback;

		delete checklist_meta.Uncategorized;
		checklist_meta[fallback] = {
			card_count_declared: null,
			parallels: [],
			notes: []
		};

		return {
			cards,
			sections: [fallback],
			checklist_meta
		};
	}

	return {
		cards,
		sections: meaningfulSections.length ? meaningfulSections : sections,
		checklist_meta
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

	const high = allCards.filter((card) => card.confidence >= 0.85).length;
	const review = allCards.length - high;

	if (!allCards.length) {
		throw new Error(
			'No card rows were detected in this spreadsheet. The workbook loaded, but its column layout needs a parser mapping.'
		);
	}

	return {
		sections: allSections,
		cards: allCards,
		checklist_meta,
		metaSections: 0,
		high,
		review,
		lines: sheetStats.reduce((sum, sheet) => sum + sheet.rows, 0),
		sheetStats,
		sourceKind: 'spreadsheet'
	};
}
