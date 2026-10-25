import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=process.cwd();
if(!fs.existsSync(path.join(root,'package.json')) || !fs.existsSync(path.join(root,'src','routes','mixer','+page.svelte')))throw Error('Run this installer from the Setbound project root.');
const assets=['src/lib/server/breaker-aliases.js','src/routes/api/breaker/names/+server.js','src/lib/components/BreakerNameExport.svelte','src/routes/admin/breaker-aliases/+page.server.js','src/routes/admin/breaker-aliases/+page.svelte','migrations/20261025_breaker_name_aliases.sql'];
for(const name of assets){const source=path.join(here,'setbound-alias-payload',name);if(!fs.existsSync(source))throw Error(`Installer payload is missing: ${name}`);}
for(const name of assets){const dest=path.join(root,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(here,'setbound-alias-payload',name),dest);console.log('Updated '+name);}
const users=path.join(root,'src/routes/admin/users/+page.svelte');
let page=fs.readFileSync(users,'utf8');
const marker='<!-- SETBOUND_BREAKER_ALIAS_LINK_V1 -->';
if(!page.includes(marker)){
 const anchor='<div class="hero">';
 if(!page.includes(anchor))throw Error('Cannot add aliases navigation: admin/users layout differs. Add a link manually to /admin/breaker-aliases.');
 page=page.replace(anchor,`${marker}\n<p style="margin:.8rem 0"><a href="/admin/breaker-aliases">Review breaker aliases →</a></p>\n${anchor}`);
 fs.writeFileSync(users,page);
}
console.log('Breaker aliases installed. Run npm run check && npm run build, then apply D1 migrations.');
