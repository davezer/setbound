import fs from 'node:fs';

function replaceOnce(source, search, replacement, label) {
	const at = source.indexOf(search);
	if (at < 0) throw new Error(`${label}: expected code not found.`);
	return source.slice(0, at) + replacement + source.slice(at + search.length);
}

const importPath = 'src/routes/api/import/+server.js';
let source = fs.readFileSync(importPath, 'utf8');

if (!source.includes('function franchiseLookupKey(value)')) {
	source = replaceOnce(
		source,
		`function hasVerifiedAffiliation(card) {`,
		`function franchiseLookupKey(value) {
	return String(value || '')
		.trim()
		.normalize('NFKD')
		.replace(/[\\u0300-\\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\\s+/g, ' ')
		.trim();
}

function hasVerifiedAffiliation(card) {`,
		'franchise helper'
	);
}

source = source.replace(
	`\t\t\tlet affiliationId = null;\n\n\t\t\tif (hasVerifiedAffiliation(card)) {`,
	`\t\t\tlet affiliationId = null;
\t\t\tlet affiliationLabel = null;

\t\t\tif (hasVerifiedAffiliation(card)) {`
);

const affiliationStart = source.indexOf(`\t\t\tif (hasVerifiedAffiliation(card)) {`);
const cardInsertStart = source.indexOf(`\n\t\t\tawait database\n\t\t\t\t.prepare(\`\n\t\t\t\t\tINSERT INTO cards`, affiliationStart);

if (affiliationStart < 0 || cardInsertStart < 0) {
	throw new Error('Could not locate current affiliation/card insert region.');
}

const currentAffiliationBlock = source.slice(affiliationStart, cardInsertStart);

if (!currentAffiliationBlock.includes('affiliation_franchise_aliases')) {
	const body = currentAffiliationBlock
		.split('\n')
		.slice(1, -1)
		.map((line) => '\t' + line)
		.join('\n');

	const replacement = [
		'\t\t\tif (hasVerifiedAffiliation(card)) {',
		"\t\t\t\tconst historicalName = String(card.affiliation || '').trim();",
		'\t\t\t\tconst aliasKey = franchiseLookupKey(historicalName);',
		'',
		'\t\t\t\tconst franchiseAlias = await database',
		"\t\t\t\t\t.prepare('SELECT canonical_affiliation_id FROM affiliation_franchise_aliases WHERE sport_id = ? AND alias_normalized = ? LIMIT 1')",
		'\t\t\t\t\t.bind(Number(body.sportId), aliasKey)',
		'\t\t\t\t\t.first();',
		'',
		'\t\t\t\tif (franchiseAlias?.canonical_affiliation_id) {',
		'\t\t\t\t\taffiliationId = franchiseAlias.canonical_affiliation_id;',
		'\t\t\t\t\taffiliationLabel = historicalName;',
		'\t\t\t\t} else {',
		body,
		'\t\t\t\t}',
		'\t\t\t}',
		''
	].join('\n');

	source = source.slice(0, affiliationStart) + replacement + source.slice(cardInsertStart);
}

if (!source.includes('\t\t\t\t\t\t\taffiliation_label,')) {
	source = replaceOnce(
		source,
		`\t\t\t\t\t\t\taffiliation_id,\n\t\t\t\t\t\t\tcard_number,`,
		`\t\t\t\t\t\t\taffiliation_id,
\t\t\t\t\t\t\taffiliation_label,
\t\t\t\t\t\t\tcard_number,`,
		'cards column list'
	);

	source = replaceOnce(
		source,
		`\t\t\t\t\t\t(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		`\t\t\t\t\t\t(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		'cards placeholders'
	);

	source = replaceOnce(
		source,
		`\t\t\t\t\taffiliationId,\n\t\t\t\t\tString(card.card_number),`,
		`\t\t\t\t\taffiliationId,
\t\t\t\t\taffiliationLabel,
\t\t\t\t\tString(card.card_number),`,
		'cards bindings'
	);
}

fs.writeFileSync(importPath, source);
console.log('Import API patched.');

const serverPath = 'src/routes/sets/[slug]/+page.server.js';
let server = fs.readFileSync(serverPath, 'utf8');

if (!server.includes('AS franchise_name')) {
	server = replaceOnce(
		server,
		`\t\t\t\tCOALESCE(a.name, 'NIL') AS affiliation_name,`,
		`\t\t\t\tCOALESCE(c.affiliation_label, a.name, 'NIL') AS affiliation_name,
\t\t\t\tCOALESCE(a.name, 'NIL') AS franchise_name,`,
		'set card affiliation select'
	);
}

fs.writeFileSync(serverPath, server);
console.log('Set page server patched.');

const pagePath = 'src/routes/sets/[slug]/+page.svelte';
let page = fs.readFileSync(pagePath, 'utf8');

page = page.replace(
	`...[...new Set(data.cards.map((card) => card.affiliation_name))].sort((a, b) => a.localeCompare(b))`,
	`...[...new Set(data.cards.map((card) => card.franchise_name || card.affiliation_name))].sort((a, b) => a.localeCompare(b))`
);

page = page.replace(
	`(team === 'All teams' || card.affiliation_name === team) &&`,
	`(team === 'All teams' || (card.franchise_name || card.affiliation_name) === team) &&`
);

page = page.replace(
	'`${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.checklist_name}`',
	"`${card.card_number} ${card.subject_name} ${card.affiliation_name} ${card.franchise_name || \'\'} ${card.checklist_name}`"
);

fs.writeFileSync(pagePath, page);
console.log('Set page filters patched.');

console.log('Historical franchise mapping patch applied successfully.');
