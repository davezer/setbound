import fs from 'node:fs';

const path = 'src/routes/api/admin/topps-launch-backfill/+server.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const importNeedle = "import { db } from '$lib/server/db';";
const importReplacement =
	"import { db } from '$lib/server/db';\nimport { env } from '$env/dynamic/private';";

if (!source.includes("from '$env/dynamic/private'")) {
	if (!source.includes(importNeedle)) {
		throw new Error('Could not find the db import in the Topps launch backfill route.');
	}
	source = source.replace(importNeedle, importReplacement);
}

const oldKeyLine =
	"const apiKey = String(platform?.env?.PARSE_API_KEY || '').trim();";

const newKeyLine =
	"const apiKey = String(platform?.env?.PARSE_API_KEY || env.PARSE_API_KEY || '').trim();";

if (source.includes(oldKeyLine)) {
	source = source.replace(oldKeyLine, newKeyLine);
} else if (!source.includes(newKeyLine)) {
	throw new Error(
		'Could not find the PARSE_API_KEY lookup. The route may differ from the expected version.'
	);
}

fs.writeFileSync(path, source);
console.log('Installed Parse.bot environment binding fallback.');
console.log('Run npm run check && npm run build, then deploy.');
