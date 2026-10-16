import fs from 'node:fs';

const path = 'src/routes/admin/source-harvester/+page.svelte';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const start = source.indexOf('\tasync function discoverCI() {');
const end = source.indexOf('\n\tasync function refreshCatalog()', start);

if (start < 0 || end < 0) {
	throw new Error('Could not locate discoverCI().');
}

const replacement = `\tasync function discoverCI() {
\t\tconst response = await fetch(\`/api/admin/source-harvester/discover?source=checklistinsider&year=\${encodeURIComponent(year)}\`);
\t\tconst result = await response.json();
\t\tif (!response.ok) throw new Error(result.message || 'Checklist Insider discovery failed.');

\t\tconst entries = result.entries || [];
\t\tconst cached = entries.filter((entry) => entry.cached);
\t\tconst uncached = entries.filter((entry) => !entry.cached);

\t\t// Cached pages already contain their checklist/odds links, so merge them
\t\t// immediately and never hit Checklist Insider for them again.
\t\tconst cachedUsable = cached.filter(
\t\t\t(entry) => entry && (entry.checklistUrl || entry.oddsUrl)
\t\t);

\t\tif (cachedUsable.length) mergeCatalog(cachedUsable);

\t\tlet scanned = 0;
\t\tlet found = cachedUsable.length;

\t\tif (!uncached.length) {
\t\t\treturn \`\${result.note} Everything for \${year} was served from cache.\`;
\t\t}

\t\tfor (let i = 0; i < uncached.length; i += 2) {
\t\t\tconst batch = uncached.slice(i, i + 2);

\t\t\tconst results = await Promise.all(
\t\t\t\tbatch.map(async (stub) => {
\t\t\t\t\ttry {
\t\t\t\t\t\tconst scanResponse = await fetch(
\t\t\t\t\t\t\t\`/api/admin/source-harvester/scan?url=\${encodeURIComponent(stub.pageUrl)}\`
\t\t\t\t\t\t);
\t\t\t\t\t\tconst scanResult = await scanResponse.json();
\t\t\t\t\t\tif (!scanResponse.ok) return null;
\t\t\t\t\t\treturn scanResult.entry;
\t\t\t\t\t} catch {
\t\t\t\t\t\treturn null;
\t\t\t\t\t}
\t\t\t\t})
\t\t\t);

\t\t\tscanned += batch.length;

\t\t\tconst usable = results.filter(
\t\t\t\t(entry) => entry && (entry.checklistUrl || entry.oddsUrl)
\t\t\t);

\t\t\tfound += usable.length;
\t\t\tif (usable.length) mergeCatalog(usable);

\t\t\tmessage =
\t\t\t\t\`Checklist Insider cache: \${cached.length} cached · scanning new pages \${scanned}/\${uncached.length} · \${found} products with downloads\`;

\t\t\t// Keep the polite delay only for pages we actually hit remotely.
\t\t\tawait new Promise((resolve) => setTimeout(resolve, 250));
\t\t}

\t\treturn \`\${result.note} Scanned only \${uncached.length} uncached page\${uncached.length === 1 ? '' : 's'}.\`;
\t}`;

source = source.slice(0, start) + replacement + source.slice(end);

fs.writeFileSync(path, source);
console.log('Source Harvester client cache support installed.');
