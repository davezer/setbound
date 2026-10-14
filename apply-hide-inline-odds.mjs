import fs from 'node:fs';

const path = 'src/routes/sets/[slug]/+page.svelte';
let source = fs.readFileSync(path, 'utf8');

const derived = `
	const activeChecklistOdds = $derived(
		activeChecklist
			? data.odds.filter((row) => Number(row.checklist_id) === Number(activeChecklist.id))
			: []
	);
`;

if (source.includes(derived)) {
	source = source.replace(derived, '');
	console.log('Removed checklist-specific odds derived state.');
} else {
	console.log('Checklist-specific odds derived state not found; continuing.');
}

const start = source.indexOf('\t{#if activeChecklist && activeChecklistOdds.length}');
const table = source.indexOf('\t<div class="table-wrap">', start);

if (start >= 0 && table > start) {
	source = source.slice(0, start) + source.slice(table);
	console.log('Removed inline checklist odds section.');
} else if (start === -1) {
	console.log('Inline checklist odds section is already absent.');
} else {
	console.error('Found inline odds section but could not safely locate the card table after it.');
	process.exit(1);
}

fs.writeFileSync(path, source);
console.log('Done. The Odds button/modal remains intact.');
