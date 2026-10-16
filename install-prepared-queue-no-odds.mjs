import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);

let source = fs.readFileSync(path, 'utf8');

function replaceRequired(search, replacement, label) {
	if (source.includes(replacement)) return;
	if (!source.includes(search)) throw new Error(`${label}: expected code was not found.`);
	source = source.replace(search, replacement);
}

function replaceAllLiteral(search, replacement) {
	source = source.split(search).join(replacement);
}

if (!source.includes('const PREPARE_ODDS = false;')) {
	const anchor = "\tlet oddsPreviewUrl = $state('');";
	if (!source.includes(anchor)) throw new Error('Could not locate odds preview state.');
	source = source.replace(
		anchor,
		"\t// Odds are legacy/optional. Existing imported odds remain untouched,\n\t// but Source Harvester no longer prepares or imports them by default.\n\tconst PREPARE_ODDS = false;\n\n" + anchor
	);
}

replaceAllLiteral('if (row.oddsUrl) {', 'if (PREPARE_ODDS && row.oddsUrl) {');
replaceAllLiteral(
	'if (row.oddsUrl && !row.oddsImported) {',
	'if (PREPARE_ODDS && row.oddsUrl && !row.oddsImported) {'
);
replaceAllLiteral('{#if row.oddsUrl}', '{#if PREPARE_ODDS && row.oddsUrl}');

replaceRequired(
	"statusText: `${row.parsed.cards.length.toLocaleString()} cards ready${row.oddsUrl ? ' + odds' : ''}`",
	"statusText: `${row.parsed.cards.length.toLocaleString()} cards ready`",
	'ready status text'
);

replaceRequired(
	"statusText: row.oddsUrl ? 'Checklist imported · importing odds…' : 'Imported'",
	"statusText: 'Imported'",
	'import status text'
);

const oldSummary = `\t\tconst ready = queue.filter((row) => row.status === 'ready').length;
\t\tconst review = queue.filter((row) => row.status === 'review').length;
\t\tconst oddsReview = queue.filter((row) => row.status === 'odds-review').length;
\t\tconst parseReview = queue.filter((row) => row.status === 'parse-review').length;
\t\tconst failed = queue.filter((row) => row.status === 'error' || row.status === 'odds-error').length;
\t\tmessage = \`${ready} ready · ${review} checklist review · ${parseReview} parse review · ${oddsReview} odds review · ${failed} failed\`;`;

const newSummary = `\t\tconst ready = queue.filter((row) => row.status === 'ready').length;
\t\tconst review = queue.filter((row) => row.status === 'review').length;
\t\tconst parseReview = queue.filter((row) => row.status === 'parse-review').length;
\t\tconst failed = queue.filter((row) => row.status === 'error').length;
\t\tmessage = \`${ready} ready · ${review} checklist review · ${parseReview} parse review · ${failed} failed\`;`;

if (source.includes(oldSummary)) source = source.replace(oldSummary, newSummary);

replaceAllLiteral('Import checklist + odds', 'Import checklist');
replaceAllLiteral('Retry odds/checklist prepare', 'Retry prepare');

replaceAllLiteral(
	`{#if row.status === 'odds-review'}<span class="action-note">Verify odds formats above</span>{/if}`,
	''
);
replaceAllLiteral(
	`{#if row.status === 'odds-error'}<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry prepare</button>{/if}`,
	''
);
replaceAllLiteral(
	`{#if row.status === 'odds-import-error'}<button class="secondary" onclick={() => importOddsForRow(index)} disabled={busy}>Retry odds import</button>{/if}`,
	''
);

fs.writeFileSync(path, source);
console.log('Prepared queue is now checklist-only. Existing imported odds were not touched.');
