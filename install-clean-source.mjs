import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.cwd();
const bundled = path.dirname(fileURLToPath(import.meta.url));
const files = {
  page: 'src/routes/admin/source-library/+page.svelte',
  api: 'src/routes/api/admin/source-library/+server.js',
  export: 'src/routes/api/admin/source-library/export/+server.js'
};
const target = k => path.join(root, files[k]);
for (const k of Object.keys(files)) if (!fs.existsSync(target(k))) throw Error(`Missing ${files[k]}; nothing changed.`);
const beforeApi = fs.readFileSync(target('api'),'utf8');
const beforeExport = fs.readFileSync(target('export'),'utf8');
const bundledPage = path.join(bundled,files.page);
if (!fs.existsSync(bundledPage)) throw Error('Installer package is incomplete: missing page file.');
function once(src,needle,value) { const n=src.split(needle).length-1; if(n!==1)throw Error(`Expected one occurrence (${n}): ${needle.slice(0,70)}. Nothing changed.`);return src.replace(needle,value); }
let api=once(beforeApi,'LIMIT 2500','LIMIT 10000');
api=once(api,"if (!urls.length || urls.length > 12 || urls.some(u => !siteUrl(u)))","if (!urls.length || urls.length > 12 || urls.some(u => !siteUrl(u)))");
api=once(api,"if (sourceCategory(url).kind!=='candidate' || entry.extractionStatus!=='ready')","if ((sourceCategory(url).kind!=='candidate' && entry.archiveParent!==true) || entry.extractionStatus!=='ready')");
let exp=once(beforeExport,'const MAX_ITEMS = 12;','const MAX_ITEMS = 20;');
exp=once(exp,'const MAX_ARCHIVE = 12_000_000;','const MAX_ARCHIVE = 28_000_000;');
exp=once(exp,"  files.push({ name: 'export-report.json', bytes: enc.encode(JSON.stringify({ report, failures }, null, 2)) });\n  return new Response(zip(files), { headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename=\"source-library-generated-csv.zip\"', 'cache-control': 'no-store', 'x-generated-urls': encodeURIComponent(JSON.stringify(report.map(item => item.pageUrl))) } });",`  const headers = { 'cache-control': 'no-store', 'x-generated-urls': encodeURIComponent(JSON.stringify(report.map(item => item.pageUrl))) };
  if (files.length === 1 && failures.length === 0) {
    return new Response(files[0].bytes, { headers: { ...headers, 'content-type':'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="' + files[0].name + '"' } });
  }
  files.push({ name: 'export-report.json', bytes: enc.encode(JSON.stringify({ report, failures }, null, 2)) });
  return new Response(zip(files), { headers: { ...headers, 'content-type':'application/zip', 'content-disposition':'attachment; filename="setbound-checklists.zip"' } });`);
// All replacements validated before any writes. No backups created, per request.
fs.writeFileSync(target('page'),fs.readFileSync(bundledPage));
fs.writeFileSync(target('api'),api);
fs.writeFileSync(target('export'),exp);
console.log('Installed cleaned parent-only Source Library. No backup files or database changes.');
