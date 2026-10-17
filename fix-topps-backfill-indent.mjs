import fs from 'node:fs';

const pagePath = 'src/routes/admin/sets/+page.svelte';

if (!fs.existsSync(pagePath)) {
    throw new Error(`Could not find ${pagePath}`);
}

let source = fs.readFileSync(pagePath, 'utf8');

const startMarker = "\\tasync function runToppsBackfill";
const nextMarker = "\n\tasync function toggleVisibility";

const start = source.indexOf(startMarker);
if (start < 0) {
    if (source.includes("\tasync function runToppsBackfill")) {
        console.log('Topps backfill indentation is already repaired.');
        process.exit(0);
    }
    throw new Error('Could not find the broken runToppsBackfill block.');
}

const end = source.indexOf(nextMarker, start);
if (end < 0) {
    throw new Error('Could not find the end of the Topps backfill block.');
}

const before = source.slice(0, start);
let block = source.slice(start, end);
const after = source.slice(end);

block = block.replace(/\\t/g, '\t');

source = before + block + after;
fs.writeFileSync(pagePath, source);

console.log('Fixed literal \\t escapes in Manage Sets Topps backfill block.');
console.log('Run npm run check && npm run build.');
