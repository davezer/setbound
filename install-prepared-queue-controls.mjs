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

// Add queue-only removal helpers. These do NOT touch the harvested catalog or DB.
const helperAnchor = `\tfunction clearSelected() {
\t\tselected = new Set();
\t}`;

const helperReplacement = `\tfunction clearSelected() {
\t\tselected = new Set();
\t}

\tfunction removePrepared(index) {
\t\tif (index < 0 || index >= queue.length) return;

\t\tif (reviewQueueIndex === index) {
\t\t\treviewQueueIndex = null;
\t\t\treviewCardIndex = null;
\t\t} else if (reviewQueueIndex != null && reviewQueueIndex > index) {
\t\t\treviewQueueIndex -= 1;
\t\t}

\t\tqueue = queue.filter((_, rowIndex) => rowIndex !== index);
\t}

\tfunction clearPrepared() {
\t\tif (!queue.length) return;

\t\treviewQueueIndex = null;
\t\treviewCardIndex = null;
\t\tqueue = [];
\t\tmessage = 'Prepared checklist queue cleared. Harvested products are still loaded.';
\t}`;

replaceOnce(helperAnchor, helperReplacement, 'prepared queue helpers');

// Replace single Import-all button with Clear prepared + Import-all controls.
const headAnchor = `\t\t\t\t<button class="primary" onclick={importAllReady} disabled={busy || !queue.some((row) => row.status === 'ready')}>Import all ready</button>`;

const headReplacement = `\t\t\t\t<div class="batch-head-actions">
\t\t\t\t\t<button class="secondary" type="button" onclick={clearPrepared} disabled={busy || !queue.length}>Clear prepared</button>
\t\t\t\t\t<button class="primary" onclick={importAllReady} disabled={busy || !queue.some((row) => row.status === 'ready')}>Import all ready</button>
\t\t\t\t</div>`;

replaceOnce(headAnchor, headReplacement, 'batch head controls');

// Add Remove button to every prepared row.
const actionsAnchor = `\t\t\t\t\t\t<div class="row-actions">
\t\t\t\t\t\t\t{#if row.status === 'ready'}<button class="secondary" onclick={() => importRow(index)} disabled={busy}>Import checklist + odds</button>{/if}`;

const actionsReplacement = `\t\t\t\t\t\t<div class="row-actions">
\t\t\t\t\t\t\t<button
\t\t\t\t\t\t\t\tclass="secondary remove-prepared"
\t\t\t\t\t\t\t\ttype="button"
\t\t\t\t\t\t\t\tonclick={() => removePrepared(index)}
\t\t\t\t\t\t\t\tdisabled={busy}
\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\tRemove
\t\t\t\t\t\t\t</button>
\t\t\t\t\t\t\t{#if row.status === 'ready'}<button class="secondary" onclick={() => importRow(index)} disabled={busy}>Import checklist + odds</button>{/if}`;

replaceOnce(actionsAnchor, actionsReplacement, 'row remove control');

// Add light styling without depending on exact existing style order.
if (!source.includes('.batch-head-actions{')) {
	const styleClose = '</style>';
	if (!source.includes(styleClose)) throw new Error('Could not find </style>.');

	source = source.replace(
		styleClose,
		`
\t.batch-head-actions{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;justify-content:flex-end}
\t.remove-prepared{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
\t@media(max-width:700px){
\t\t.batch-head-actions{justify-content:flex-start}
\t}
${styleClose}`
	);
}

fs.writeFileSync(path, source);
console.log('Prepared queue controls installed.');
