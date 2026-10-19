import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const page = path.join(root, 'src/routes/admin/source-library/+page.svelte');
const endpoint = path.join(root, 'src/routes/api/admin/source-library/export/+server.js');
const supplied = path.join(root, 'src/routes/api/admin/source-library/export/+server.js');
try {
  if (!existsSync(page)) throw new Error('Cannot find src/routes/admin/source-library/+page.svelte.');
  if (!existsSync(supplied)) throw new Error('Expected src/routes/api/admin/source-library/export/+server.js. Extract the ZIP with folders intact.');
  const source = readFileSync(page, 'utf8');
  if (source.includes('async function generateCsvZip(')) {
    console.log('Already installed. No files changed.'); process.exit(0);
  }
  const anchor = ' function toggle(id){';
  const buttonAnchor = '<a href="/admin/import-studio">Review/import downloaded CSV ↗</a>';
  if (!source.includes(anchor)) throw new Error('Source Library page changed: selection helper anchor not found. No files changed.');
  if (!source.includes(buttonAnchor)) throw new Error('Source Library page changed: import link anchor not found. No files changed.');
  const helper = ` async function generateCsvZip(){
   const urls=[...new Set(chosen.filter(v=>v.endsWith('|csv-generated')).map(v=>v.slice(0,-14)))];
   if(!urls.length){error='Select a Generate CSV checkbox first.';return;}
   busy=true;error='';note='';
   try {
     const response=await fetch('/api/admin/source-library/export',{
       method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({urls})
     });
     if(!response.ok){const result=await response.json();throw new Error([result.message,...(result.failures||[]).map(x=>x.reason)].filter(Boolean).join(' · '));}
     download('source-library-generated-csv.zip',await response.blob());
     note='Generated CSV ZIP downloaded. Review export-report.json and every checklist before importing.';
   }catch(e){error=e?.message||'CSV generation failed.';}finally{busy=false;}
 }
`;
  let updated = source.replace(anchor, helper + anchor);
  updated = updated.replace(buttonAnchor, `<button class="secondary" type="button" onclick={generateCsvZip} disabled={busy||!chosen.some(x=>x.endsWith('|csv-generated'))}>Generate selected CSV ({chosen.filter(x=>x.endsWith('|csv-generated')).length})</button>${buttonAnchor}`);
  const label = `{#each ['csv','pdf'] as format}<label>`;
  if (!updated.includes(label)) throw new Error('File-selection anchor not found. No files changed.');
  const original = `</label>{/each}</div></article>`;
  if (!updated.includes(original)) throw new Error('File-row anchor not found. No files changed.');
  updated = updated.replace(original, `</label>{/each}{#if x.csvButton && !x.csvUrl}<label><input type="checkbox" checked={chosen.includes(x.pageUrl+'|csv-generated')} disabled={busy} onchange={()=>toggle(x.pageUrl+'|csv-generated')}/>Generate CSV from page (experimental)</label>{/if}</div></article>`);
  const suffix = '.backup-before-generated-csv';
  if (!existsSync(page+suffix)) copyFileSync(page,page+suffix);
  writeFileSync(page,updated);
  console.log('Installed Source Library generated CSV controls. Backend file is already at its correct src/ path.');
  console.log('Run npm run check and npm run build.');
}catch(e){console.error('Installation aborted: '+e.message);process.exitCode=1;}
