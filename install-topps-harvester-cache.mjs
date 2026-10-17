import fs from 'node:fs';

const path = 'src/routes/api/admin/source-harvester/discover/+server.js';
if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);

let source = fs.readFileSync(path, 'utf8');

const oldBlock = `\tif (source === 'topps') {\n\t\tconst result = await discoverTopps(fetch);\n\t\treturn json({ ok: true, source: 'Topps', ...result });\n\t}`;

const newBlock = `\tif (source === 'topps') {\n\t\tconst database = db(platform);\n\n\t\t// Always load the saved Topps catalog first so a flaky archive endpoint\n\t\t// cannot make previously discovered products disappear.\n\t\tconst cachedRows = await database.prepare(\`\n\t\t\tSELECT page_url, entry_json, scanned_at\n\t\t\tFROM source_harvester_cache\n\t\t\tWHERE source = 'topps'\n\t\t\tORDER BY year DESC, title\n\t\t\`).all();\n\n\t\tconst cachedEntries = (cachedRows.results || [])\n\t\t\t.map((row) => ({ entry: safeJson(row.entry_json), scannedAt: row.scanned_at }))\n\t\t\t.filter((row) => row.entry?.checklistUrl);\n\n\t\tconst cachedMap = new Map(\n\t\t\tcachedEntries.map((row) => [row.entry.checklistUrl, row.entry])\n\t\t);\n\n\t\tconst result = await discoverTopps(fetch);\n\t\tconst liveEntries = Array.isArray(result.entries) ? result.entries : [];\n\n\t\tif (liveEntries.length) {\n\t\t\t// Persist the metadata only. The checklist files themselves are still\n\t\t\t// downloaded fresh when Prepare is clicked. checklistUrl is the cache key\n\t\t\t// because every Topps entry shares the same archive page URL.\n\t\t\tconst statements = liveEntries\n\t\t\t\t.filter((entry) => entry?.checklistUrl)\n\t\t\t\t.map((entry) => database.prepare(\`\n\t\t\t\t\tINSERT INTO source_harvester_cache (\n\t\t\t\t\t\tpage_url, source, year, title, entry_json, scanned_at, updated_at\n\t\t\t\t\t)\n\t\t\t\t\tVALUES (?, 'topps', ?, ?, ?, datetime('now'), datetime('now'))\n\t\t\t\t\tON CONFLICT(page_url) DO UPDATE SET\n\t\t\t\t\t\tsource = excluded.source,\n\t\t\t\t\t\tyear = excluded.year,\n\t\t\t\t\t\ttitle = excluded.title,\n\t\t\t\t\t\tentry_json = excluded.entry_json,\n\t\t\t\t\t\tscanned_at = datetime('now'),\n\t\t\t\t\t\tupdated_at = datetime('now')\n\t\t\t\t\`).bind(\n\t\t\t\t\tentry.checklistUrl,\n\t\t\t\t\tentry.year || null,\n\t\t\t\t\tentry.name || '',\n\t\t\t\t\tJSON.stringify(entry)\n\t\t\t\t));\n\n\t\t\t// Keep batches modest for D1.\n\t\t\tfor (let index = 0; index < statements.length; index += 100) {\n\t\t\t\tawait database.batch(statements.slice(index, index + 100));\n\t\t\t}\n\n\t\t\t// Merge old cached discoveries with today's live result. This protects\n\t\t\t// older files if Topps ever serves a temporarily incomplete archive.\n\t\t\tconst merged = new Map(cachedMap);\n\t\t\tfor (const entry of liveEntries) {\n\t\t\t\tif (entry?.checklistUrl) merged.set(entry.checklistUrl, entry);\n\t\t\t}\n\n\t\t\tconst entries = [...merged.values()].sort((a, b) =>\n\t\t\t\tNumber(b.year || 0) - Number(a.year || 0) ||\n\t\t\t\tString(a.name || '').localeCompare(String(b.name || ''))\n\t\t\t);\n\n\t\t\treturn json({\n\t\t\t\tok: true,\n\t\t\t\tsource: 'Topps',\n\t\t\t\t...result,\n\t\t\t\tentries,\n\t\t\t\tcache: { live: liveEntries.length, cached: cachedEntries.length, total: entries.length },\n\t\t\t\tnote: \`${result.note} Saved ${liveEntries.length} entries to the Topps cache · ${entries.length} protected total.\`\n\t\t\t});\n\t\t}\n\n\t\tif (cachedEntries.length) {\n\t\t\tconst entries = [...cachedMap.values()].sort((a, b) =>\n\t\t\t\tNumber(b.year || 0) - Number(a.year || 0) ||\n\t\t\t\tString(a.name || '').localeCompare(String(b.name || ''))\n\t\t\t);\n\n\t\t\treturn json({\n\t\t\t\tok: true,\n\t\t\t\tsource: 'Topps',\n\t\t\t\tentries,\n\t\t\t\tsourceUrl: result.sourceUrl || null,\n\t\t\t\tcache: { live: 0, cached: entries.length, total: entries.length },\n\t\t\t\tnote: \`Topps archive was unavailable, so Setbound loaded ${entries.length} protected entries from D1 cache. ${result.note || ''}\`.trim()\n\t\t\t});\n\t\t}\n\n\t\treturn json({ ok: true, source: 'Topps', ...result });\n\t}`;

if (source.includes(newBlock)) {
	console.log('Topps harvester cache is already installed.');
	process.exit(0);
}

if (!source.includes(oldBlock)) {
	throw new Error('Could not find the expected Topps discovery block. Your local discover route differs from the current Setbound version.');
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(path, source);
console.log('Installed persistent Topps harvester cache.');
