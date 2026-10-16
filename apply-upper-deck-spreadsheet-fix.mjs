import fs from 'node:fs';

const path = 'src/lib/client/spreadsheet.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

if (!source.includes('function parseUpperDeckWorkbook(')) {
	const marker = '\nconst PANINI_PARALLEL_PREFIXES = [';

	if (!source.includes(marker)) {
		throw new Error('Could not find insertion point before Panini parser.');
	}

	const code = `
function findUpperDeckHeader(row) {
	const normalized = row.map(key);

	const exact = (label) => normalized.indexOf(label);

	const setName = exact('set name');
	const cardNumber = exact('card #');
	const firstName = exact('first name');
	const lastName = exact('last name');
	const teamCity = exact('teamcity');
	const teamName = exact('teamname');
	const notes = exact('notes');

	if (
		setName < 0 ||
		cardNumber < 0 ||
		firstName < 0 ||
		teamCity < 0 ||
		teamName < 0
	) {
		return null;
	}

	return {
		setName,
		cardNumber,
		firstName,
		lastName,
		teamCity,
		teamName,
		notes
	};
}

function upperDeckFlags(setName) {
	const value = String(setName || '');

	return {
		rookie: /\\\\brookie(?:s)?\\\\b/i.test(value),
		autograph: /\\\\b(?:auto|autograph|signatures?)\\\\b/i.test(value),
		memorabilia: /\\\\b(?:relic|memorabilia|materials?|swatch|patch|jersey)\\\\b/i.test(value)
	};
}

function parseUpperDeckWorkbook(XLSX, workbook) {
	const cards = [];
	const sections = [];
	const checklist_meta = {};
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
			const found = findUpperDeckHeader(
				Array.isArray(rows[index]) ? rows[index] : []
			);

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
				cards: 0,
				sections: 0,
				detected: false
			});
			continue;
		}

		detected = true;
		let accepted = 0;
		const sheetSections = new Set();

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const row = Array.isArray(rows[index]) ? rows[index] : [];

			const setName = text(row[header.setName]);
			const cardNumber = text(row[header.cardNumber]);
			const firstName = text(row[header.firstName]);
			const lastName =
				header.lastName >= 0
					? text(row[header.lastName])
					: '';
			const city = text(row[header.teamCity]);
			const team = text(row[header.teamName]);
			const notes =
				header.notes >= 0
					? text(row[header.notes])
					: '';

			if (!setName || !cardNumber || !firstName) continue;
			if (!isCardNumber(cardNumber)) continue;

			const subject = [firstName, lastName]
				.filter(Boolean)
				.join(' ')
				.replace(/\\\\s+/g, ' ')
				.trim();

			const affiliation = [city, team]
				.filter(Boolean)
				.join(' ')
				.replace(/\\\\s+/g, ' ')
				.trim();

			const flags = upperDeckFlags(setName);

			const card = makeCard({
				cardNumber,
				subject,
				affiliation: affiliation || 'NIL',
				checklist: setName,
				rookie: flags.rookie,
				autograph: flags.autograph,
				memorabilia: flags.memorabilia,
				raw: [
					setName,
					cardNumber,
					firstName,
					lastName,
					city,
					team,
					notes
				].filter(Boolean).join(' | '),
				confidence: affiliation ? 0.99 : 0.94
			});

			cards.push(card);
			accepted += 1;
			sheetSections.add(setName);

			if (!sections.includes(setName)) {
				sections.push(setName);
			}

			if (!checklist_meta[setName]) {
				checklist_meta[setName] = {
					card_count_declared: null,
					parallels: [],
					notes: []
				};
			}

			if (notes && !checklist_meta[setName].notes.includes(notes)) {
				checklist_meta[setName].notes.push(notes);
			}
		}

		sheetStats.push({
			name: sheetName,
			rows: rows.length,
			cards: accepted,
			sections: sheetSections.size,
			detected: true
		});
	}

	if (!detected) return null;

	if (!cards.length) {
		throw new Error(
			'Upper Deck spreadsheet layout was detected, but no checklist rows were found.'
		);
	}

	const high = cards.filter((card) => card.confidence >= 0.85).length;
	const review = cards.length - high;

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
			cards: cards.length,
			sections: sections.length
		},
		safety: {
			blocked: false,
			reasons: []
		}
	};
}
`;

	source = source.replace(marker, `\n${code}${marker}`);
}

const oldCall = `\tconst panini = parsePaniniWorkbook(XLSX, workbook);
\tif (panini) return panini;`;

const newCall = `\tconst upperDeck = parseUpperDeckWorkbook(XLSX, workbook);
\tif (upperDeck) return upperDeck;

\tconst panini = parsePaniniWorkbook(XLSX, workbook);
\tif (panini) return panini;`;

if (!source.includes('const upperDeck = parseUpperDeckWorkbook(XLSX, workbook);')) {
	if (!source.includes(oldCall)) {
		throw new Error('Could not find workbook parser dispatch block.');
	}

	source = source.replace(oldCall, newCall);
}

fs.writeFileSync(path, source);

console.log('Upper Deck spreadsheet parser installed.');
