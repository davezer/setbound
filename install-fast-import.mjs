import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const location = path.resolve('src/routes/api/import/+server.js');
if (!fs.existsSync(location)) throw new Error('Run this from the Setbound project root. Import endpoint not found.');
const original = fs.readFileSync(location, 'utf8');
const marker = '// SETBOUND_FAST_IMPORT_V1';
if (original.includes(marker)) { console.log('Fast import already installed; no changes.'); process.exit(0); }
let code = original;
function swapOnce(label, before, after) {
  const n=code.split(before).length-1;
  if(n!==1) throw new Error(`${label}: expected one exact match, found ${n}. No files changed; send the current +server.js for a compatible update.`);
  code=code.replace(before,after);
}
const anchor = '\t\tconst checklistSlugs = uniqueChecklistSlugs(body.cards);';
const prep = `\t\t// SETBOUND_FAST_IMPORT_V1
\t\t// Preload only the subjects needed for this checklist, in bounded chunks.
\t\t// This avoids SELECT per card while retaining the existing insert path.
\t\tconst existingSubjectIds = new Map();
\t\tconst subjectNames = [...new Set(body.cards.map(card => resolvedSubject(card).toLowerCase()))];
\t\tfor (let offset = 0; offset < subjectNames.length; offset += 75) {
\t\t\tconst names = subjectNames.slice(offset, offset + 75);
\t\t\tconst found = await database.prepare(
\t\t\t\t\`SELECT id, normalized_name FROM subjects WHERE normalized_name IN (\${names.map(() => '?').join(',')})\`
\t\t\t).bind(...names).all();
\t\t\tfor (const subject of found.results || []) existingSubjectIds.set(subject.normalized_name, subject.id);
\t\t}
\t\tconst aliasRows = await database.prepare(
\t\t\t'SELECT alias_normalized, canonical_affiliation_id, preserve_source_label FROM affiliation_franchise_aliases WHERE sport_id = ?'
\t\t).bind(Number(body.sportId)).all();
\t\tconst aliasByKey = new Map((aliasRows.results || []).map(alias => [alias.alias_normalized, alias]));
\t\tconst cardStatements = [];
\t\tconst CARD_BATCH_SIZE = 60;
\t\tasync function flushCardStatements() {
\t\t\tif (!cardStatements.length) return;
\t\t\tconst results = await database.batch(cardStatements.splice(0));
\t\t\tif (results.some(result => result?.success === false)) throw new Error('Card insert batch failed.');
\t\t}

`;
swapOnce('batch initialization',anchor,prep+anchor);
const oldSubject = `\t\t\t\tlet row = await database
\t\t\t\t\t.prepare(\`
\t\t\t\t\t\tSELECT id
\t\t\t\t\t\tFROM subjects
\t\t\t\t\t\tWHERE normalized_name = ?
\t\t\t\t\t\`)
\t\t\t\t\t.bind(subjectKey)
\t\t\t\t\t.first();`;
const newSubject = `\t\t\t\tlet row = existingSubjectIds.has(subjectKey)
\t\t\t\t\t? { id: existingSubjectIds.get(subjectKey) }
\t\t\t\t\t: null;`;
swapOnce('cached subject lookup',oldSubject,newSubject);
const oldAlias = `\t\t\t\tconst franchiseAlias = await database
\t\t\t\t\t.prepare('SELECT canonical_affiliation_id, preserve_source_label FROM affiliation_franchise_aliases WHERE sport_id = ? AND alias_normalized = ? LIMIT 1')
\t\t\t\t\t.bind(Number(body.sportId), aliasKey)
\t\t\t\t\t.first();`;
swapOnce('cached alias lookup',oldAlias,`\t\t\t\tconst franchiseAlias = aliasByKey.get(aliasKey) || null;`);
// Preserve SQL, binding order, and INSERT OR IGNORE behavior; only change execution mechanism.
const expression = /\t\t\tawait database\n\t\t\t\t\.prepare\(\`\n\t\t\t\t\tINSERT OR IGNORE INTO cards[\s\S]*?\n\t\t\t\t\.run\(\);/g;
const matches=[...code.matchAll(expression)];
if(matches.length!==1) throw new Error(`Card INSERT: expected one match, found ${matches.length}. No files changed.`);
const oldInsert=matches[0][0];
const newInsert=oldInsert.replace('\t\t\tawait database','\t\t\tcardStatements.push(database').replace(/\n\t\t\t\t\.run\(\);$/, '\n\t\t\t);\n\t\t\tif (cardStatements.length >= CARD_BATCH_SIZE) await flushCardStatements();');
code=code.replace(oldInsert,newInsert);
swapOnce('final batch flush','\t\tconst checklistMeta =','\t\tawait flushCardStatements();\n\n\t\tconst checklistMeta =');
// Fail-safe: do not write if resulting code is malformed.
const testPath=path.resolve('src/routes/api/import/.setbound-fast-import-check.mjs');
try {
  fs.writeFileSync(testPath,code);
  execFileSync(process.execPath,['--check',testPath],{stdio:'pipe'});
} catch(e) {
  throw new Error('Generated file failed JavaScript syntax validation. No original modified. '+String(e.stderr||e.message));
} finally { if(fs.existsSync(testPath))fs.unlinkSync(testPath); }
const backup=location+'.before-fast-import.bak';
if(fs.existsSync(backup))throw new Error('Backup already exists: '+backup+'; move it before rerunning. No changes made.');
fs.copyFileSync(location,backup,fs.constants.COPYFILE_EXCL);
fs.writeFileSync(location,code);
console.log('Fast-import changes installed. Backup: '+path.relative(process.cwd(),backup));
console.log('Run npm run check && npm run build; test only on local D1 first.');
