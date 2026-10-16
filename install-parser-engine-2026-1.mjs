import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
	if (!source.includes(search)) {
		if (source.includes(replacement)) return source;
		throw new Error(`${label}: expected code was not found.`);
	}
	return source.replace(search, replacement);
}

function patchSpreadsheet() {
	const path = 'src/lib/client/spreadsheet.js';
	let source = fs.readFileSync(path, 'utf8');

	// Upper Deck exports sometimes genuinely contain NO affiliation/team column.
	// In that case the absence of affiliation is source NIL, not unresolved data.
	const pushAnchor = `\t\t\tsourceRows.push({
\t\t\t\tsheetName,
\t\t\t\trowNumber: index + 1,
\t\t\t\tsetName,
\t\t\t\tcardNumber,
\t\t\t\tsubject,
\t\t\t\taffiliation,`;

	const pushReplacement = `\t\t\tconst sourceHasAffiliation =
\t\t\t\tlayout.team >= 0 ||
\t\t\t\t(layout.teamCity >= 0 && layout.teamName >= 0);

\t\t\tsourceRows.push({
\t\t\t\tsheetName,
\t\t\t\trowNumber: index + 1,
\t\t\t\tsetName,
\t\t\t\tcardNumber,
\t\t\t\tsubject,
\t\t\t\taffiliation,
\t\t\t\tsourceHasAffiliation,`;

	if (!source.includes('sourceHasAffiliation,')) {
		source = replaceOnce(source, pushAnchor, pushReplacement, 'Upper Deck source-affiliation marker');
	}

	const oldCard = `\t\t\tconst card = makeCard({
\t\t\t\tcardNumber: row.cardNumber,
\t\t\t\tsubject: row.subject,
\t\t\t\taffiliation: row.affiliation || 'UNRESOLVED',
\t\t\t\tchecklist: rootName,
\t\t\t\trookie: row.rookie,
\t\t\t\tautograph: row.autograph,
\t\t\t\tmemorabilia: row.memorabilia,`;

	const newCard = `\t\t\tconst card = makeCard({
\t\t\t\tcardNumber: row.cardNumber,
\t\t\t\tsubject: row.subject,
\t\t\t\taffiliation:
\t\t\t\t\trow.affiliation ||
\t\t\t\t\t(row.sourceHasAffiliation ? 'UNRESOLVED' : 'NIL'),
\t\t\t\tchecklist: rootName,
\t\t\t\trookie: row.rookie,
\t\t\t\tautograph: row.autograph,
\t\t\t\tmemorabilia: row.memorabilia,`;

	if (!source.includes("(row.sourceHasAffiliation ? 'UNRESOLVED' : 'NIL')")) {
		source = replaceOnce(source, oldCard, newCard, 'Upper Deck NIL behavior');
	}

	const oldConfidence = `\t\t\t\tconfidence: row.affiliation ? 0.99 : 0.72
\t\t\t});

\t\t\tcard.serial_number = row.serial || null;`;

	const newConfidence = `\t\t\t\tconfidence:
\t\t\t\t\trow.affiliation
\t\t\t\t\t\t? 0.99
\t\t\t\t\t\t: row.sourceHasAffiliation
\t\t\t\t\t\t\t? 0.72
\t\t\t\t\t\t\t: 0.99
\t\t\t});

\t\t\tif (!row.affiliation && !row.sourceHasAffiliation) {
\t\t\t\tcard.affiliation_status = 'source-nil';
\t\t\t}

\t\t\tcard.serial_number = row.serial || null;`;

	if (!source.includes("card.affiliation_status = 'source-nil';")) {
		source = replaceOnce(source, oldConfidence, newConfidence, 'Upper Deck NIL confidence');
	}

	// WWE/Topps: "Legend" is a classification, not an affiliation.
	const affiliationAnchor = `\t\t// The first non-flag value after the subject is the affiliation/brand.
\t\tif (!affiliation && !FLAG_WORDS.has(normalized)) {
\t\t\taffiliation = value;
\t\t}`;

	const affiliationReplacement = `\t\t// Classification/status values are not affiliations.
\t\tif (['legend', 'legends'].includes(normalized)) {
\t\t\tcontinue;
\t\t}

\t\t// The first non-flag value after the subject is the affiliation/brand.
\t\tif (!affiliation && !FLAG_WORDS.has(normalized)) {
\t\t\taffiliation = value;
\t\t}`;

	if (!source.includes("['legend', 'legends'].includes(normalized)")) {
		source = replaceOnce(source, affiliationAnchor, affiliationReplacement, 'Topps Legend classification');
	}

	// Score-A-Treat: Pumpkins/Slime are parallel families, not standalone checklist roots.
	if (!source.includes("'pumpkins', 'slime'")) {
		const parallelTail = `\t'tie-dye', 'tri-color', 'maroon'
];`;

		const parallelReplacement = `\t'tie-dye', 'tri-color', 'maroon', 'pumpkins', 'slime'
];`;

		source = replaceOnce(source, parallelTail, parallelReplacement, 'Panini Halloween parallel vocabulary');
	}

	fs.writeFileSync(path, source);
	console.log('spreadsheet.js hardened.');
}

function patchHarvester() {
	const path = 'src/routes/admin/source-harvester/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes("import { tick } from 'svelte';")) {
		source = source.replace(
			"<script>\n",
			"<script>\n\timport { tick } from 'svelte';\n"
		);
	}

	const oldManufacturer = `\tfunction manufacturerIdFor(item) {
\t\tconst exact = data.manufacturers.find((manufacturer) =>
\t\t\tmanufacturer.name.toLowerCase() === String(item.manufacturer || '').toLowerCase()
\t\t);
\t\treturn exact?.id ?? data.manufacturers[0]?.id ?? null;
\t}`;

	const newManufacturer = `\tfunction manufacturerIdFor(item) {
\t\tconst raw = String(item.manufacturer || '').trim().toLowerCase();

\t\tconst exact = data.manufacturers.find(
\t\t\t(manufacturer) => manufacturer.name.toLowerCase() === raw
\t\t);

\t\tif (exact) return exact.id;

\t\tconst aliases = {
\t\t\tfleer: 'upper deck',
\t\t\t'fleer ultra': 'upper deck',
\t\t\tskybox: 'upper deck',
\t\t\t'skybox metal universe': 'upper deck',
\t\t\tdonruss: 'panini',
\t\t\tscore: 'panini'
\t\t};

\t\tconst target = aliases[raw];

\t\tif (target) {
\t\t\tconst aliased = data.manufacturers.find(
\t\t\t\t(manufacturer) => manufacturer.name.toLowerCase() === target
\t\t\t);
\t\t\tif (aliased) return aliased.id;
\t\t}

\t\treturn data.manufacturers[0]?.id ?? null;
\t}`;

	if (!source.includes("fleer: 'upper deck'")) {
		source = replaceOnce(source, oldManufacturer, newManufacturer, 'Manufacturer aliases');
	}

	const oldResolved = `\t\t\tconst unresolved =
\t\t\t\tcard.affiliation === 'UNRESOLVED' ||
\t\t\t\tcard.affiliation_status === 'unresolved';`;

	const newResolved = `\t\t\tconst unresolved =
\t\t\t\tcard.affiliation === 'UNRESOLVED' ||
\t\t\t\tcard.affiliation_status === 'unresolved' ||
\t\t\t\tcard.affiliation_status === 'source-nil';`;

	if (!source.includes("card.affiliation_status === 'source-nil';")) {
		source = replaceOnce(source, oldResolved, newResolved, 'Product-context NIL override');
	}

	const queueAnchor = `\t\tqueue = items.map((item) => ({`;

	if (!source.includes("message = 'Clearing previous prepared results…';")) {
		const queueReplacement = `\t\tmessage = 'Clearing previous prepared results…';
\t\tqueue = [];
\t\tawait tick();

\t\tqueue = items.map((item) => ({`;

		source = replaceOnce(source, queueAnchor, queueReplacement, 'Prepared queue reset');
	}

	fs.writeFileSync(path, source);
	console.log('Source Harvester QOL + manufacturer aliases applied.');
}

patchSpreadsheet();
patchHarvester();

console.log('Setbound parser engine 2026.1 upgrade installed.');
