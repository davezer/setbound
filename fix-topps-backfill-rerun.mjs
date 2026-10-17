import fs from 'node:fs';

const apiPath = 'src/routes/api/admin/topps-launch-backfill/+server.js';
const pagePath = 'src/routes/admin/sets/+page.svelte';

for (const path of [apiPath, pagePath]) {
  if (!fs.existsSync(path)) throw new Error(`Could not find ${path}`);
}

let api = fs.readFileSync(apiPath, 'utf8');
let page = fs.readFileSync(pagePath, 'utf8');

// 1) Make Parse.bot error messages human-readable even when their message/error is an object.
const oldParseFetch = `async function parseFetch(fetch, endpoint, apiKey, params = {}) {\n\tconst url = new URL(\`\${PARSE_BASE}/\${endpoint}\`);`;
const newParseFetch = `function errorText(value, fallback = 'Unknown error.') {\n\tif (!value) return fallback;\n\tif (typeof value === 'string') return value;\n\tif (value instanceof Error) return value.message || fallback;\n\ttry {\n\t\tif (typeof value.message === 'string') return value.message;\n\t\tif (typeof value.error === 'string') return value.error;\n\t\tif (value.error && typeof value.error.message === 'string') return value.error.message;\n\t\treturn JSON.stringify(value);\n\t} catch {\n\t\treturn String(value);\n\t}\n}\n\nasync function parseFetch(fetch, endpoint, apiKey, params = {}) {\n\tconst url = new URL(\`\${PARSE_BASE}/\${endpoint}\`);`;
if (!api.includes('function errorText(')) {
  if (!api.includes(oldParseFetch)) throw new Error('Could not find parseFetch block.');
  api = api.replace(oldParseFetch, newParseFetch);
}

const oldHttpErr = `\tif (!response.ok) {\n\t\tthrow new Error(payload?.message || payload?.error || \`Parse.bot returned HTTP \${response.status}.\`);\n\t}\n\tif (payload?.status && payload.status !== 'success') {\n\t\tthrow new Error(payload?.message || payload?.error || \`Parse.bot returned \${payload.status}.\`);\n\t}`;
const newHttpErr = `\tif (!response.ok) {\n\t\tthrow new Error(errorText(payload?.message || payload?.error || payload, \`Parse.bot returned HTTP \${response.status}.\`));\n\t}\n\tif (payload?.status && payload.status !== 'success') {\n\t\tthrow new Error(errorText(payload?.message || payload?.error || payload, \`Parse.bot returned \${payload.status}.\`));\n\t}`;
if (api.includes(oldHttpErr)) api = api.replace(oldHttpErr, newHttpErr);

// 2) Stop re-paying for the launch index on every rerun. Use D1 cache unless explicitly forced.
const oldIndexMode = `\tif (mode === 'index') {\n\t\ttry {\n\t\t\tconst launches = await refreshLaunchIndex(database, fetch, apiKey);\n\t\t\treturn json({ ok: true, launchCount: launches.length });\n\t\t} catch (error) {\n\t\t\treturn json({ message: error?.message || 'Could not refresh Topps launch index.' }, { status: 502 });\n\t\t}\n\t}`;
const newIndexMode = `\tif (mode === 'index') {\n\t\ttry {\n\t\t\tconst forceRefresh = body.forceRefresh === true;\n\t\t\tlet launches = forceRefresh ? [] : await cachedLaunchIndex(database);\n\t\t\tlet cached = launches.length > 0;\n\n\t\t\tif (!launches.length) {\n\t\t\t\tlaunches = await refreshLaunchIndex(database, fetch, apiKey);\n\t\t\t\tcached = false;\n\t\t\t}\n\n\t\t\treturn json({ ok: true, launchCount: launches.length, cached });\n\t\t} catch (error) {\n\t\t\treturn json({ message: errorText(error, 'Could not load Topps launch index.') }, { status: 502 });\n\t\t}\n\t}`;
if (api.includes(oldIndexMode)) {
  api = api.replace(oldIndexMode, newIndexMode);
} else if (!api.includes('const forceRefresh = body.forceRefresh === true;')) {
  throw new Error('Could not find index mode block.');
}

fs.writeFileSync(apiPath, api);

// 3) Make client-side thrown API messages safe if any endpoint returns structured errors.
const marker = `\tasync function backfillToppsVisible() {`;
if (!page.includes('function readableApiError(')) {
  const helper = `\tfunction readableApiError(value, fallback) {\n\t\tif (!value) return fallback;\n\t\tif (typeof value === 'string') return value;\n\t\ttry {\n\t\t\tif (typeof value.message === 'string') return value.message;\n\t\t\tif (typeof value.error === 'string') return value.error;\n\t\t\tif (value.error && typeof value.error.message === 'string') return value.error.message;\n\t\t\treturn JSON.stringify(value);\n\t\t} catch {\n\t\t\treturn fallback;\n\t\t}\n\t}\n\n`;
  if (!page.includes(marker)) throw new Error('Could not find backfillToppsVisible().');
  page = page.replace(marker, helper + marker);
}

page = page.replace(
  `throw new Error(indexResult.message || 'Could not load Topps launch history.');`,
  `throw new Error(readableApiError(indexResult.message || indexResult.error || indexResult, 'Could not load Topps launch history.'));`
);
page = page.replace(
  `throw new Error(result.message || 'Topps metadata batch failed.');`,
  `throw new Error(readableApiError(result.message || result.error || result, 'Topps metadata batch failed.'));`
);

fs.writeFileSync(pagePath, page);

console.log('Installed Topps backfill rerun/cache fix.');
console.log('Run npm run check && npm run build, then deploy.');
