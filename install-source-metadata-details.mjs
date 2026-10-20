import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),bundle=path.dirname(fileURLToPath(import.meta.url));
const targets=['src/routes/api/admin/products/source-metadata-details/+server.js','src/lib/components/CardsmithsMetadataModal.svelte'];
if(!fs.existsSync(path.join(root,'src/routes/api/admin/products/source-metadata/+server.js')))throw Error('Existing metadata API missing. No changes made.');
for(const rel of targets)if(!fs.existsSync(path.join(bundle,rel)))throw Error('Missing package file: '+rel);
if(!fs.existsSync(path.join(root,targets[1])))throw Error('Existing metadata modal missing. No changes made.');
if(fs.existsSync(path.join(root,targets[0]))&&fs.readFileSync(path.join(root,targets[0]),'utf8')!==fs.readFileSync(path.join(bundle,targets[0]),'utf8'))throw Error('Existing details route differs from package. No changes made.');
for(const rel of targets){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.copyFileSync(path.join(bundle,rel),path.join(root,rel));}
console.log('Updated Source metadata modal and added details route. No backup files created.');
