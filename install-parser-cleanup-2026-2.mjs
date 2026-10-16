import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
	if (source.includes(replacement)) return source;
	if (!source.includes(search)) throw new Error(`${label}: expected code not found.`);
	return source.replace(search, replacement);
}

function patchLayouts() {
	const path = 'src/lib/parser-layouts.js';
	let source = fs.readFileSync(path, 'utf8');

	source = replaceOnce(
		source,
		"\tTOPPS_DUAL: 'topps-dual-subject',",
		"\tTOPPS_DUAL: 'topps-dual-subject',\n\tTOPPS_SPLIT_NAME_NO_HEADER: 'topps-split-name-no-header',\n\tTOPPS_NONSPORT_SECTIONED: 'topps-nonsport-sectioned',",
		'layout constants'
	);

	const anchor = `\tconst manufacturer = key(context.manufacturer);
\tconst fileName = key(context.fileName || context.name);
\tconst joined = rows
\t\t.flatMap((row) => row.map(clean))
\t\t.join(' ')
\t\t.toLowerCase();`;

	const replacement = `\tconst manufacturer = key(context.manufacturer);
\tconst sport = key(context.sport);
\tconst fileName = key(context.fileName || context.name);
\tconst joined = rows
\t\t.flatMap((row) => row.map(clean))
\t\t.join(' ')
\t\t.toLowerCase();

\t// Some Topps soccer workbooks (Premier League / Bundesliga) have no header
\t// row at all. Their card rows are:
\t// Card # | First Name | Last Name | Club
\t// Detect the repeated shape instead of letting the generic parser interpret
\t// the surname as the affiliation.
\tif (manufacturer === 'topps' && sport === 'soccer') {
\t\tlet splitRows = 0;

\t\tfor (const row of rows) {
\t\t\tconst cells = (Array.isArray(row) ? row : []).map(clean);
\t\t\tconst number = cells[0] || '';
\t\t\tconst first = cells[1] || '';
\t\t\tconst last = cells[2] || '';
\t\t\tconst team = cells[3] || '';

\t\t\tif (
\t\t\t\t/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(number) &&
\t\t\t\t(first || last) &&
\t\t\t\tteam
\t\t\t) {
\t\t\t\tsplitRows += 1;
\t\t\t}
\t\t}

\t\tif (splitRows >= 5) {
\t\t\treturn detected(
\t\t\t\tLAYOUTS.TOPPS_SPLIT_NAME_NO_HEADER,
\t\t\t\t0.99,
\t\t\t\t'Headerless Card # / First Name / Last Name / Team rows'
\t\t\t);
\t\t}
\t}

\t// Topps non-sport files such as Vault Disney/Marvel use section headings
\t// followed by card-code + subject (+ optional character/artist/role).
\t// The extra third cell is descriptive metadata, not a team affiliation.
\tif (manufacturer === 'topps' && sport === 'non-sport') {
\t\tlet nonsportRows = 0;

\t\tfor (const row of rows) {
\t\t\tconst cells = (Array.isArray(row) ? row : []).map(clean);
\t\t\tif (
\t\t\t\t/^[A-Z0-9][A-Z0-9._/-]{0,24}$/i.test(cells[0] || '') &&
\t\t\t\t(cells[1] || '')
\t\t\t) {
\t\t\t\tnonsportRows += 1;
\t\t\t}
\t\t}

\t\tif (nonsportRows >= 5) {
\t\t\treturn detected(
\t\t\t\tLAYOUTS.TOPPS_NONSPORT_SECTIONED,
\t\t\t\t0.99,
\t\t\t\t'Topps non-sport sectioned card-code / subject rows'
\t\t\t);
\t\t}
\t}`;

	source = replaceOnce(source, anchor, replacement, 'layout family detection');
	fs.writeFileSync(path, source);
	console.log('parser-layouts.js patched.');
}

function patchStructured() {
	const path = 'src/lib/client/structured-spreadsheet.js';
	let source = fs.readFileSync(path, 'utf8');

	// makeCard variation support
	source = replaceOnce(
		source,
		"function makeCard({ cardNumber, subject, affiliation = 'NIL', checklist, rookie = false, autograph = false, memorabilia = false, raw = '' }) {",
		"function makeCard({ cardNumber, subject, affiliation = 'NIL', checklist, rookie = false, autograph = false, memorabilia = false, variation = null, raw = '' }) {",
		'makeCard variation signature'
	);
	source = replaceOnce(
		source,
		"\t\tserial_number: null,\n\t\tchecklist_name:",
		"\t\tserial_number: null,\n\t\tvariation: variation || null,\n\t\tchecklist_name:",
		'makeCard variation field'
	);

	const loopAnchor = `\tfor (const sheetName of workbook.SheetNames) {
\t\tconst rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });

\t\tif (layout === 'topps-entertainment') {`;

	const loopReplacement = `\tfor (const sheetName of workbook.SheetNames) {
\t\tconst rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });

\t\tif (layout === 'topps-split-name-no-header') {
\t\t\tlet section = 'Checklist';

\t\t\tfor (const rawRow of rows) {
\t\t\t\tconst row = rawRow || [];
\t\t\t\tconst non = row.map(text).filter(Boolean);

\t\t\t\tif (non.length === 1 && !/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(non[0])) {
\t\t\t\t\tif (!/checklists provided by topps|subject to change|checklist$/i.test(non[0])) {
\t\t\t\t\t\tsection = non[0];
\t\t\t\t\t}
\t\t\t\t\tcontinue;
\t\t\t\t}

\t\t\t\tconst number = text(row[0]);
\t\t\t\tconst first = text(row[1]);
\t\t\t\tconst last = text(row[2]);
\t\t\t\tconst team = text(row[3]);

\t\t\t\tif (!/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(number) || !(first || last) || !team) {
\t\t\t\t\tcontinue;
\t\t\t\t}

\t\t\t\tcards.push(makeCard({
\t\t\t\t\tcardNumber: number,
\t\t\t\t\tsubject: [first, last].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim(),
\t\t\t\t\taffiliation: team,
\t\t\t\t\tchecklist: section,
\t\t\t\t\traw: non.join(' | ')
\t\t\t\t}));
\t\t\t}
\t\t\tcontinue;
\t\t}

\t\tif (layout === 'topps-nonsport-sectioned') {
\t\t\tlet section = 'Checklist';
\t\t\tlet majorType = '';

\t\t\tfor (const rawRow of rows) {
\t\t\t\tconst row = rawRow || [];
\t\t\t\tconst non = row.map(text).filter(Boolean);

\t\t\t\tif (!non.length) continue;

\t\t\t\tif (non.length === 1) {
\t\t\t\t\tconst label = non[0].trim();

\t\t\t\t\tif (/^(INSERT|AUTOGRAPH|RELIC|AUTOGRAPH RELIC|AUTOGRAPH RELICS)$/i.test(label)) {
\t\t\t\t\t\tmajorType = label.toUpperCase();
\t\t\t\t\t\tcontinue;
\t\t\t\t\t}

\t\t\t\t\tif (
\t\t\t\t\t\t!/checklists provided by topps|subject to change|checklist$/i.test(label) &&
\t\t\t\t\t\t!/^2026\\b/i.test(label)
\t\t\t\t\t) {
\t\t\t\t\t\tsection = label;
\t\t\t\t\t}
\t\t\t\t\tcontinue;
\t\t\t\t}

\t\t\t\tconst number = text(row[0]);
\t\t\t\tconst subject = text(row[1]);
\t\t\t\tconst detail = text(row[2]);

\t\t\t\tif (!/^[A-Z0-9][A-Z0-9._/-]{0,24}$/i.test(number) || !subject) continue;

\t\t\t\tcards.push(makeCard({
\t\t\t\t\tcardNumber: number,
\t\t\t\t\tsubject,
\t\t\t\t\taffiliation: 'NIL',
\t\t\t\t\tchecklist: section,
\t\t\t\t\tautograph: /AUTOGRAPH/.test(majorType) || /AUTO|AUTOGRAPH/i.test(section),
\t\t\t\t\tmemorabilia: /RELIC/.test(majorType) || /RELIC|MEMORABILIA|PATCH/i.test(section),
\t\t\t\t\tvariation: detail || null,
\t\t\t\t\traw: non.join(' | ')
\t\t\t\t}));
\t\t\t}
\t\t\tcontinue;
\t\t}

\t\tif (layout === 'topps-entertainment') {`;

	source = replaceOnce(source, loopAnchor, loopReplacement, 'structured family parsers');
	fs.writeFileSync(path, source);
	console.log('structured-spreadsheet.js patched.');
}

function patchEngine() {
	const path = 'src/lib/client/checklist-engine.js';
	let source = fs.readFileSync(path, 'utf8');

	const old = `\t\tif (
\t\t\t!parsed &&
\t\t\t[
\t\t\t\tLAYOUTS.TOPPS_STRUCTURED,
\t\t\t\tLAYOUTS.TOPPS_ENTERTAINMENT,
\t\t\t\tLAYOUTS.TOPPS_DUAL
\t\t\t].includes(detection.layout)
\t\t) {`;

	const replacement = `\t\tif (
\t\t\t!parsed &&
\t\t\t[
\t\t\t\tLAYOUTS.TOPPS_STRUCTURED,
\t\t\t\tLAYOUTS.TOPPS_ENTERTAINMENT,
\t\t\t\tLAYOUTS.TOPPS_DUAL,
\t\t\t\tLAYOUTS.TOPPS_SPLIT_NAME_NO_HEADER,
\t\t\t\tLAYOUTS.TOPPS_NONSPORT_SECTIONED
\t\t\t].includes(detection.layout)
\t\t) {`;

	source = replaceOnce(source, old, replacement, 'engine structured routes');
	fs.writeFileSync(path, source);
	console.log('checklist-engine.js patched.');
}

function patchImport() {
	const path = 'src/routes/api/import/+server.js';
	let source = fs.readFileSync(path, 'utf8');

	// The DB unique index is the final canonical definition of duplicate identity.
	// If two source rows normalize to the same identity after subject/affiliation
	// resolution, skip the second one instead of aborting the entire product.
	source = replaceOnce(
		source,
		"\t\t\t\t\tINSERT INTO cards\n",
		"\t\t\t\t\tINSERT OR IGNORE INTO cards\n",
		'import duplicate hardening'
	);

	fs.writeFileSync(path, source);
	console.log('import route duplicate hardening installed.');
}

patchLayouts();
patchStructured();
patchEngine();
patchImport();

console.log('Setbound parser cleanup 2026.2 installed.');
