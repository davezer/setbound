import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

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

function replaceAll(search, replacement) {
	source = source.split(search).join(replacement);
}

if (!source.includes('const PREPARE_ODDS = false;')) {
	const anchor = "\tlet oddsPreviewUrl = $state('');";
	replaceOnce(
		anchor,
		"\t// Existing imported odds remain intact, but the Source Harvester no longer\\n" +
		"\t// prepares or imports odds as part of the normal checklist workflow.\\n" +
		"\tconst PREPARE_ODDS = false;\\n\\n" +
		anchor,
		'odds feature flag'
	);
}

replaceAll(
	"\t\tif (row.oddsUrl) {",
	"\t\tif (PREPARE_ODDS && row.oddsUrl) {"
);

replaceAll(
	"\t\t\tif (row.oddsUrl) {",
	"\t\t\tif (PREPARE_ODDS && row.oddsUrl) {"
);

replaceAll(
	"\t\t\tif (row.oddsUrl && !row.oddsImported) {",
	"\t\t\tif (PREPARE_ODDS && row.oddsUrl && !row.oddsImported) {"
);

replaceAll(
	"{#if row.oddsUrl}",
	"{#if PREPARE_ODDS && row.oddsUrl}"
);

replaceAll('Import checklist + odds', 'Import checklist');
replaceAll('Retry odds/checklist prepare', 'Retry prepare');

replaceOnce(
	"statusText: `${row.parsed.cards.length.toLocaleString()} cards ready${row.oddsUrl ? ' + odds' : ''}`",
	"statusText: `${row.parsed.cards.length.toLocaleString()} cards ready`",
	'ready status'
);

replaceOnce(
	"statusText: row.oddsUrl ? 'Checklist imported · importing odds…' : 'Imported'",
	"statusText: 'Imported'",
	'imported status'
);

const summaryOldLines = [
	"\t\tconst ready = queue.filter((row) => row.status === 'ready').length;",
	"\t\tconst review = queue.filter((row) => row.status === 'review').length;",
	"\t\tconst oddsReview = queue.filter((row) => row.status === 'odds-review').length;",
	"\t\tconst parseReview = queue.filter((row) => row.status === 'parse-review').length;",
	"\t\tconst failed = queue.filter((row) => row.status === 'error' || row.status === 'odds-error').length;",
	"\t\tmessage = `${ready} ready · ${review} checklist review · ${parseReview} parse review · ${oddsReview} odds review · ${failed} failed`;"
].join('\n');

const summaryNewLines = [
	"\t\tconst ready = queue.filter((row) => row.status === 'ready').length;",
	"\t\tconst review = queue.filter((row) => row.status === 'review').length;",
	"\t\tconst parseReview = queue.filter((row) => row.status === 'parse-review').length;",
	"\t\tconst failed = queue.filter((row) => row.status === 'error').length;",
	"\t\tmessage = `${ready} ready · ${review} checklist review · ${parseReview} parse review · ${failed} failed`;"
].join('\n');

if (source.includes(summaryOldLines)) {
	source = source.replace(summaryOldLines, summaryNewLines);
}

replaceAll(
	'{#if row.status === \'odds-review\'}<span class="action-note">Verify odds formats above</span>{/if}',
	''
);
replaceAll(
	'{#if row.status === \'odds-error\'}<button class="secondary" onclick={() => prepareItem(index)} disabled={busy}>Retry prepare</button>{/if}',
	''
);
replaceAll(
	'{#if row.status === \'odds-import-error\'}<button class="secondary" onclick={() => importOddsForRow(index)} disabled={busy}>Retry odds import</button>{/if}',
	''
);

fs.writeFileSync(path, source);
console.log('Prepared queue is now checklist-only. Existing imported odds were not touched.');
