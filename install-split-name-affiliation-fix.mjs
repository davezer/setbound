import fs from 'node:fs';

const path = 'src/lib/client/spreadsheet.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
	if (source.includes(replacement)) return;
	if (!source.includes(search)) {
		throw new Error(`${label}: expected code was not found.`);
	}
	source = source.replace(search, replacement);
}

// Teach the generic spreadsheet mapper about split first/last-name layouts.
// Without this, a row such as:
//   54 | Alex | Scott | AFC Bournemouth
// falls through to shape parsing and becomes:
//   subject = Alex
//   affiliation = Scott
const oldHeader = `function findHeaderMap(row) {
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
}`;

const newHeader = `function findHeaderMap(row) {
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
}`;

replaceOnce(oldHeader, newHeader, 'split-name header support');

const oldMapped = `function parseMappedRow(row, headerMap, section) {
	const cardNumber = row[headerMap.card];
	const subject = row[headerMap.subject];

	if (!isCardNumber(cardNumber) || !text(subject)) return null;

	let affiliation = headerMap.affiliation >= 0 ? text(row[headerMap.affiliation]) : '';
	const rookie = headerMap.rookie >= 0 && isTruthyFlag(row[headerMap.rookie]);`;

const newMapped = `function parseMappedRow(row, headerMap, section) {
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
					.replace(/\\s+/g, ' ')
					.trim();

	if (!isCardNumber(cardNumber) || !subject) return null;

	let affiliation = headerMap.affiliation >= 0 ? text(row[headerMap.affiliation]) : '';
	const rookie = headerMap.rookie >= 0 && isTruthyFlag(row[headerMap.rookie]);`;

replaceOnce(oldMapped, newMapped, 'split-name row parsing');

fs.writeFileSync(path, source);
console.log('Split first/last-name spreadsheet support installed.');
