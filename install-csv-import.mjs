import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('src/routes/admin/import/+page.svelte');
const helper = path.resolve('src/lib/client/source-csv.js');
const supplied = path.resolve('src/lib/client/source-csv.js');
const backup = target + '.before-csv-import.bak';
const initial = fs.readFileSync(target, 'utf8');
const replacements = [
  ["<script>", "<script>\n\timport { parseSourceCsv } from '$lib/client/source-csv.js';"],
  ["throw new Error('Use a PDF, XLS, or XLSX checklist.');", "throw new Error('Use a CSV, PDF, XLS, or XLSX checklist.');"],
  ['accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"',
    'accept=".csv,.pdf,.xls,.xlsx,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'],
  ['PDF, XLS, or XLSX', 'CSV, PDF, XLS, or XLSX']
];
let updated = initial;
for (const [from, to] of replacements) {
  const count = updated.split(from).length - 1;
  if (count !== 1 && !(from === 'PDF, XLS, or XLSX' && count === 2)) throw new Error(`Expected one exact source anchor, found ${count}: ${from.slice(0, 70)}`);
  updated = updated.replaceAll(from, to);
}
// The source page also downloads remotely supplied files. Add CSV to that workflow separately.
const localStart = updated.indexOf('async function fileChanged');
const localEnd = updated.indexOf('function parsePasted', localStart);
if (localStart < 0 || localEnd < 0) throw new Error('Local upload flow changed; no files modified.');
const local = updated.slice(localStart, localEnd);
const localPdf = "if (ext === 'pdf') {";
if (!local.includes(localPdf)) throw new Error('Local PDF anchor missing; no files modified.');
updated = updated.slice(0, localStart) + local.replace(localPdf, "if (ext === 'csv') {\n\t\t\t	sourceKind = 'CSV';\n\t\t\t	status = 'Reading CSV…';\n\t\t\t	finishParse(await parseSourceCsv(file));\n\t\t	} else if (ext === 'pdf') {") + updated.slice(localEnd);
const remoteMarker = "} else if (ext === 'xls' || ext === 'xlsx') {";
const remoteStart = updated.indexOf('async function loadRemoteChecklist');
const remoteEnd = updated.indexOf('function finishParse');
if (remoteStart < 0 || remoteEnd < remoteStart) throw new Error('Remote import workflow changed; no files modified.');
const remote = updated.slice(remoteStart, remoteEnd);
if (!remote.includes(remoteMarker)) throw new Error('Remote import anchor absent; no files modified.');
const remoteUpdated = remote.replace(remoteMarker, "} else if (ext === 'csv') {\n\t\t\t\tsourceKind = 'CSV';\n\t\t\t\tfinishParse(await parseSourceCsv(file));\n\t\t\t" + remoteMarker);
updated = updated.slice(0, remoteStart) + remoteUpdated + updated.slice(remoteEnd);
if (!fs.existsSync(supplied)) throw new Error('Missing src/lib/client/source-csv.js. Extract src/ directory first.');
fs.writeFileSync(backup, initial);
fs.writeFileSync(target, updated);
console.log('CSV import enabled in existing /admin/import review screen. Backup:', backup);
