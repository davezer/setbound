import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';
let source = fs.readFileSync(path, 'utf8');

const oldStart = `\tfunction oddsProblems(parsedOdds, names) {
\t\tif (!parsedOdds) return [];

\t\tconst issues = [...(parsedOdds.headerIssues || [])];`;

const newStart = `\tfunction oddsProblems(parsedOdds, names) {
\t\tif (!parsedOdds) return [];

\t\t// Revalidate the CURRENT editable labels. parsedOdds.headerIssues describes
\t\t// the parser's original guesses, so keeping those issues here made it
\t\t// impossible to verify a row even after the admin corrected every label.
\t\tconst issues = [];`;

if (!source.includes(oldStart)) {
	console.error('Could not find oddsProblems() in the current Source Harvester page.');
	process.exit(1);
}

source = source.replace(oldStart, newStart);
fs.writeFileSync(path, source);

console.log('Fixed Source Harvester odds verification to use edited labels.');
