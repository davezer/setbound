import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd=process.cwd();
const bundleRoot=path.dirname(fileURLToPath(import.meta.url));
const relative={page:'src/routes/admin/import-bulk/+page.svelte',server:'src/routes/admin/import-bulk/+page.server.js',library:'src/routes/admin/source-library/+page.svelte',admin:'src/routes/admin/+page.svelte'};
const at=(key)=>path.join(cwd,relative[key]);
const source=(key)=>path.join(bundleRoot,relative[key]);
for(const key of ['page','server']){
  if(!fs.existsSync(source(key)))throw Error('Missing bundled file: '+relative[key]);
  if(fs.existsSync(at(key)))throw Error('Bulk importer already exists: '+relative[key]+'. No files changed.');
}
for(const key of ['library','admin']){
  if(!fs.existsSync(at(key)))throw Error('Required existing file missing: '+relative[key]+'. No files changed.');
}
const library=fs.readFileSync(at('library'),'utf8');
const admin=fs.readFileSync(at('admin'),'utf8');
if(!library.includes('href="/admin/import-studio"')||!admin.includes('href="/admin/import"'))throw Error('Navigation anchors changed. No files changed.');
const backup=path.join(cwd,'.setbound-import-backups-'+Date.now());
fs.mkdirSync(backup,{recursive:true});
fs.writeFileSync(path.join(backup,'source-library.svelte'),library);
fs.writeFileSync(path.join(backup,'admin.svelte'),admin);
const created=[];
try{
  for(const key of ['page','server']){
    fs.mkdirSync(path.dirname(at(key)),{recursive:true});
    fs.copyFileSync(source(key),at(key));created.push(at(key));
  }
  fs.writeFileSync(at('library'),library.replaceAll('href="/admin/import-studio"','href="/admin/import-bulk"'));
  fs.writeFileSync(at('admin'),admin.replace('href="/admin/import"','href="/admin/import-bulk"'));
  console.log('Bulk importer installed: /admin/import-bulk. Existing importer retained. Backup:',backup);
}catch(err){
  for(const file of created){try{fs.unlinkSync(file)}catch{}}
  fs.writeFileSync(at('library'),library);fs.writeFileSync(at('admin'),admin);
  throw err;
}
