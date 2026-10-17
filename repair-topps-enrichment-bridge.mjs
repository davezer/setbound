import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';
if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);

let source = fs.readFileSync(path, 'utf8');
const replacement = Buffer.from('CQkJY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh7CgkJCQl1cmw6IGl0ZW0ucGFnZVVybCB8fCAnJywKCQkJCW5hbWU6IGl0ZW0ubmFtZSB8fCAnJywKCQkJCXllYXI6IFN0cmluZyhpdGVtLnllYXIgfHwgJycpLAoJCQkJY2hlY2tsaXN0VXJsOiBpdGVtLmNoZWNrbGlzdFVybCB8fCAnJwoJCQl9KTsKCQkJY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgKCQkJCWAvYXBpL2FkbWluL3NvdXJjZS1oYXJ2ZXN0ZXIvZW5yaWNoPyR7cGFyYW1zLnRvU3RyaW5nKCl9YAoJCQkpOw==', 'base64').toString('utf8');

if (source.includes('checklistUrl: item.checklistUrl') && source.includes('new URLSearchParams')) {
	console.log('Harvester enrichment caller is already patched.');
	process.exit(0);
}

const marker = '/api/admin/source-harvester/enrich?url=';
const markerIndex = source.indexOf(marker);
if (markerIndex < 0) {
	throw new Error('Could not find the Harvester enrichment endpoint call.');
}

const start = source.lastIndexOf('const response = await fetch(', markerIndex);
if (start < 0) {
	throw new Error('Found the enrichment URL, but could not locate its fetch() call.');
}

let end = source.indexOf(');', markerIndex);
if (end < 0) {
	throw new Error('Found the enrichment fetch() call, but could not locate its end.');
}
end += 2;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);

console.log('Repaired Harvester enrichment caller.');
console.log('The API endpoint from the first installer may already be installed; this repair only fixes the caller patch.');
console.log('Run npm run check && npm run build.');
