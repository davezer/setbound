import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('src/lib/client/known-pdf.js');
if (!fs.existsSync(target)) {
  console.error('Run this installer from the Setbound project root. Missing: ' + target);
  process.exit(1);
}
const original = fs.readFileSync(target, 'utf8');
const signature = 'Geometry-inferred modern Topps columns (no header required)';
if (original.includes(signature)) {
  console.log('Modern Topps geometry fix already installed. No changes made.');
  process.exit(0);
}
const from = '\tfunction findModernToppsColumns(rows) {';
const end = '\n\tfor (const page of pages) {';
const a = original.indexOf(from, original.indexOf('export async function parseToppsModernChecklistPdf'));
const b = original.indexOf(end, a);
const splitMarker = `\t\t\t\tfor (const item of rest) {
\t\t\t\t\tconst x = Number(item.x);`;
if (a < 0 || b < 0 || !original.slice(a,b).includes('return null;') || !original.includes(splitMarker)) {
  console.error('Current known-pdf.js does not match the expected modern Topps parser. Nothing changed.');
  process.exit(1);
}
const replacement = `\t// ${signature}.
\t// Reuse page-wide text start positions, not a different largest gap on every card.
\tfunction findModernToppsColumns(rows) {
\t\tfor (const row of rows) {
\t\t\tconst items = row.items.map(item => ({ ...item, value: text(item.text).toLowerCase() }));
\t\t\tconst name = items.find(item => /^(?:name|player(?: name)?|subject)$/.test(item.value));
\t\t\tconst team = items.find(item => /^(?:team|club|affiliation)$/.test(item.value));
\t\t\tconst rookie = items.find(item => /^(?:rookie|rc)$/.test(item.value));
\t\t\tif (name && team && Number(team.x) > Number(name.x) + 12) {
\t\t\t\treturn { team: Number(team.x), rookie: rookie && Number(rookie.x) > Number(team.x) ? Number(rookie.x) : null };
\t\t\t}
\t\t}
\t\t// Headerless PDFs: find consistently aligned NAME and TEAM starts.
\t\tconst starts = [];
\t\tlet candidates = 0;
\t\tfor (const row of rows) {
\t\t\tconst items = row.items;
\t\t\tif (items.length < 3 || !cardNumber(items[0].text)) continue;
\t\t\tconst meaningful = items.slice(1).filter(item => !/^(rookie|rc)$/i.test(text(item.text)));
\t\t\tif (meaningful.length < 2) continue;
\t\t\tcandidates++;
\t\t\tfor (const item of meaningful) {
\t\t\t\tconst x = Number(item.x);
\t\t\t\tif (!Number.isFinite(x) || x <= Number(items[0].x) + 20) continue;
\t\t\t\tlet cluster = starts.find(c => Math.abs(c.x - x) <= 4);
\t\t\t\tif (!cluster) { cluster = { x, hits: 0, rows: new Set() }; starts.push(cluster); }
\t\t\t\tif (!cluster.rows.has(row)) { cluster.rows.add(row); cluster.hits++; }
\t\t\t}
\t\t}
\t\tif (candidates < 6) return null;
\t\tconst reliable = starts.filter(c => c.hits >= Math.max(4, Math.ceil(candidates * 0.35)))
\t\t\t.sort((a,b) => a.x - b.x);
\t\tif (reliable.length < 2 || reliable[1].x - reliable[0].x < 35) return null;
\t\treturn { team: reliable[1].x, rookie: null };
\t}
`;
let modified = original.slice(0,a) + replacement + original.slice(b);
const old = `\t\t\t\tfor (const item of rest) {
\t\t\t\t\tconst x = Number(item.x);
\t\t\t\t\tif (columnPositions.rookie != null && x >= columnPositions.rookie - 4) rookieParts.push(item.text);
\t\t\t\t\telse if (x >= columnPositions.team - 4) teamParts.push(item.text);
\t\t\t\t\telse nameParts.push(item.text);
\t\t\t\t}`;
const neu = `\t\t\t\tfor (const item of rest) {
\t\t\t\t\tconst x = Number(item.x);
\t\t\t\t\tif (/^(?:rookie|rc)$/i.test(item.text)) rookieParts.push(item.text);
\t\t\t\t\telse if (columnPositions.rookie != null && x >= columnPositions.rookie - 4) rookieParts.push(item.text);
\t\t\t\t\telse if (x >= columnPositions.team - 4) teamParts.push(item.text);
\t\t\t\t\telse nameParts.push(item.text);
\t\t\t\t}`;
if (modified.split(old).length !== 2) {
  console.error('Cannot find expected column allocation block. Nothing changed.');
  process.exit(1);
}
modified = modified.replace(old,neu);
const backup = target + '.before-geometry-fix.bak';
if (fs.existsSync(backup)) {
  console.error('Backup already exists: ' + backup + '. Move it before installing.');
  process.exit(1);
}
fs.copyFileSync(target,backup,fs.constants.COPYFILE_EXCL);
fs.writeFileSync(target,modified);
console.log('Updated src/lib/client/known-pdf.js');
console.log('Backup saved alongside the file: +page? No; known-pdf.js.before-geometry-fix.bak');
console.log('Run npm run check, then PREPARE the MLS checklist again (do not resume old R2 snapshot).');
