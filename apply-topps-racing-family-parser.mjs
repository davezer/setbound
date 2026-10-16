import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const importLine = `import { extractToppsRacingChecklist } from '$lib/client/topps-racing.js';`;

if (!source.includes(importLine)) {
	const anchor = `import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';`;

	if (!source.includes(anchor)) {
		throw new Error('Could not find spreadsheet import line.');
	}

	source = source.replace(anchor, `${anchor}\n\t${importLine}`);
}

if (!source.includes('const isToppsRacing =')) {
	const anchor = `\t\t\tif (ext === 'pdf') {`;

	if (!source.includes(anchor)) {
		throw new Error('Could not find checklist parser branch in prepareItem().');
	}

	const replacement = `\t\t\tconst isToppsRacing =
\t\t\t\tString(row.manufacturer || '').toLowerCase() === 'topps' &&
\t\t\t\tString(row.sport || '').toLowerCase() === 'racing';

\t\t\tif (isToppsRacing) {
\t\t\t\tparsed = await extractToppsRacingChecklist(file, row.name);

\t\t\t\tif (!parsed) {
\t\t\t\t\tthrow new Error(
\t\t\t\t\t\t'Topps Racing source layout is not supported yet. Import blocked instead of falling back to the generic parser.'
\t\t\t\t\t);
\t\t\t\t}
\t\t\t} else if (ext === 'pdf') {`;

	source = source.replace(anchor, replacement);
}

fs.writeFileSync(path, source);
console.log('Source Harvester now routes Topps Racing through the dedicated family parser.');
