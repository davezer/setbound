import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
	if (source.includes(replacement)) return;
	if (!source.includes(search)) throw new Error(`${label}: expected code not found.`);
	source = source.replace(search, replacement);
}

// "Select visible" should replace old hidden selections instead of accumulating them.
const oldSelectVisible = `\tfunction selectVisible() {
\t\tconst next = new Set(selected);
\t\tfor (const item of visible) if (item.checklistUrl && !existingFor(item)) next.add(key(item));
\t\tselected = next;
\t}`;

const newSelectVisible = `\tfunction selectVisible() {
\t\tconst next = new Set();
\t\tfor (const item of visible) {
\t\t\tif (item.checklistUrl && !existingFor(item)) next.add(key(item));
\t\t}
\t\tselected = next;
\t}`;

replaceOnce(oldSelectVisible, newSelectVisible, 'selectVisible');

// Clearing the prepared queue should also clear the stale selection,
// while preserving the harvested catalog.
const oldClearPrepared = `\tfunction clearPrepared() {
\t\tif (!queue.length) return;

\t\treviewQueueIndex = null;
\t\treviewCardIndex = null;
\t\tqueue = [];
\t\tmessage = 'Prepared checklist queue cleared. Harvested products are still loaded.';
\t}`;

const newClearPrepared = `\tfunction clearPrepared() {
\t\tif (!queue.length && !selected.size) return;

\t\treviewQueueIndex = null;
\t\treviewCardIndex = null;
\t\tqueue = [];
\t\tselected = new Set();
\t\tmessage = 'Prepared queue and selections cleared. Harvested products are still loaded.';
\t}`;

replaceOnce(oldClearPrepared, newClearPrepared, 'clearPrepared');

// Most important guard: Prepare Selected only prepares rows in the current visible filter.
// Hidden selections from another sport can never sneak back into the queue.
const oldPrepare = `\tasync function prepareSelected() {
\t\tconst items = catalog.filter((item) => selected.has(key(item)) && item.checklistUrl && !existingFor(item));`;

const newPrepare = `\tasync function prepareSelected() {
\t\tconst items = visible.filter(
\t\t\t(item) => selected.has(key(item)) && item.checklistUrl && !existingFor(item)
\t\t);`;

replaceOnce(oldPrepare, newPrepare, 'prepareSelected visible scope');

// Once preparation starts, clear checkboxes. The prepared queue is now the source of truth.
const oldBusy = `\t\tbusy = true;
\t\terrorMessage = '';
\t\tmessage = \`Preparing \${queue.length} checklist\${queue.length === 1 ? '' : 's'}…\`;`;

const newBusy = `\t\tselected = new Set();
\t\tbusy = true;
\t\terrorMessage = '';
\t\tmessage = \`Preparing \${queue.length} checklist\${queue.length === 1 ? '' : 's'}…\`;`;

replaceOnce(oldBusy, newBusy, 'clear selection after snapshot');

fs.writeFileSync(path, source);
console.log('Visible-selection queue fix installed.');
