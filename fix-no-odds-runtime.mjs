import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

// The previous installer accidentally wrote literal "\\n" characters into a
// // comment, which commented-out PREPARE_ODDS + oddsPreviewUrl/Name at runtime.
// Remove that malformed block if present.
source = source.replace(
	/\t\/\/ Existing imported odds remain intact,[^\r\n]*oddsPreviewName = \$state\(''\);[^\r\n]*\r?\n?/,
	''
);

// Also clean up any standalone duplicate declarations so this is idempotent.
source = source.replace(/^\s*const PREPARE_ODDS = false;\s*$/gm, '');
source = source.replace(/^\s*let oddsPreviewUrl = \$state\(''\);\s*$/gm, '');
source = source.replace(/^\s*let oddsPreviewName = \$state\(''\);\s*$/gm, '');

// Insert a clean, real multiline block immediately before enrichment state.
const anchor = "\tlet enrichment = $state(null);";

if (!source.includes(anchor)) {
	throw new Error('Could not locate enrichment state anchor.');
}

const cleanBlock = [
	"\t// Odds are legacy/optional. Existing imported odds remain untouched,",
	"\t// but Source Harvester no longer prepares/imports them by default.",
	"\tconst PREPARE_ODDS = false;",
	"",
	"\t// Keep preview state defined because legacy preview/modal helpers still",
	"\t// exist in this page even though their UI is disabled.",
	"\tlet oddsPreviewUrl = $state('');",
	"\tlet oddsPreviewName = $state('');",
	""
].join('\n');

source = source.replace(anchor, cleanBlock + anchor);

fs.writeFileSync(path, source);
console.log('Fixed no-odds runtime state declarations.');
