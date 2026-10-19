import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const paths = [
 'src/routes/admin/source-library/+page.svelte',
 'src/routes/api/admin/source-library/+server.js',
 'src/routes/api/admin/source-library/export/+server.js'
];
const files = paths.map(p => ({p, file:path.join(root,p), text:fs.readFileSync(path.join(root,p),'utf8')}));
const find = p => files.find(x=>x.p===p);
function once(s,before,after,label){
 const n=s.split(before).length-1;
 if(n!==1)throw Error(`${label}: expected one match; found ${n}. No changes made.`);
 return s.replace(before,after);
}
let page=find(paths[0]).text, api=find(paths[1]).text, exp=find(paths[2]).text;
if(page.includes('downloadedAt') || api.includes('export function PATCH') || exp.includes('x-generated-urls'))throw Error('Download tracking may already be installed. No changes made.');

// The ZIP response advertises only successfully generated CSV source URLs.
exp=once(exp,
"'cache-control': 'no-store' } });",
"'cache-control': 'no-store', 'x-generated-urls': encodeURIComponent(JSON.stringify(report.map(item => item.pageUrl))) } });",
'ZIP success header');

// A later quality recheck must not erase download history.
api=once(api,
"      await database.prepare(`INSERT INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at)",
"      const previous = await database.prepare('SELECT entry_json FROM source_harvester_cache WHERE page_url=? AND source=?').bind(url,SOURCE).first();\n      if (previous) { try { const prior=JSON.parse(previous.entry_json); if (prior.downloadedAt) entry.downloadedAt=prior.downloadedAt; } catch {} }\n      await database.prepare(`INSERT INTO source_harvester_cache (page_url,source,year,title,entry_json,scanned_at,updated_at)",
'preserve history on reinspection');

// Store status in existing entry_json, not a new schema. Allow undo.
api += `\n// Track CSV ZIP download attempts; never confuse them with published/imported sets.\nexport async function PATCH({ request, platform }) {\n  const body = await request.json().catch(() => ({}));\n  const urls = [...new Set(Array.isArray(body.urls) ? body.urls : [])];\n  if (!urls.length || urls.length > 12 || urls.some(u => !siteUrl(u)))\n    return json({ message:'Select 1–12 approved checklist URLs.' }, { status:400 });\n  if (typeof body.downloaded !== 'boolean') return json({message:'Invalid download status.'},{status:400});\n  const database = db(platform);\n  const changes = [];\n  for (const url of urls) {\n    const row = await database.prepare('SELECT entry_json FROM source_harvester_cache WHERE page_url=? AND source=?').bind(url,SOURCE).first();\n    if (!row) return json({message:'A checklist is no longer cached. Nothing changed.'},{status:409});\n    let entry;\n    try { entry=JSON.parse(row.entry_json); } catch { return json({message:'Invalid cache entry. Nothing changed.'},{status:409}); }\n    if (sourceCategory(url).kind!=='candidate' || entry.extractionStatus!=='ready')\n      return json({message:'Only CSV-ready master candidates may be marked downloaded.'},{status:409});\n    changes.push({url,entry});\n  }\n  const stamp = new Date().toISOString();\n  await database.batch(changes.map(({url,entry}) => {\n    if (body.downloaded) entry.downloadedAt=stamp;\n    else delete entry.downloadedAt;\n    return database.prepare(\"UPDATE source_harvester_cache SET entry_json=?,updated_at=datetime('now') WHERE page_url=? AND source=?\")\n      .bind(JSON.stringify(entry),url,SOURCE);\n  }));\n  return json({ok:true,updated:changes.length});\n}\n`;

page=once(page,
"let statusFilter = $state('ready');",
"let statusFilter = $state('ready');\n let downloadFilterLabel = 'Not yet downloaded';",
'filter state');
page=once(page,
"let readyVisible = $derived(showing.filter(x => x.sourceKind==='candidate' && x.extractionStatus==='ready'));",
"let readyVisible = $derived(showing.filter(x => x.sourceKind==='candidate' && x.extractionStatus==='ready' && !x.downloadedAt));",
'readyVisible');
page=once(page,
"(statusFilter === 'ready' && x.extractionStatus === 'ready')",
"(statusFilter === 'ready' && x.extractionStatus === 'ready' && !x.downloadedAt) || (statusFilter === 'downloaded' && x.extractionStatus === 'ready' && !!x.downloadedAt)",
'status filter');
page=once(page,
"let masterCount = $derived(entries.filter(x=>x.sourceKind==='candidate' && x.extractionStatus==='ready').length);",
"let masterCount = $derived(entries.filter(x=>x.sourceKind==='candidate' && x.extractionStatus==='ready').length);\n let downloadedCount = $derived(entries.filter(x=>x.sourceKind==='candidate' && x.extractionStatus==='ready' && !!x.downloadedAt).length);",
'download count');
page=once(page,
" async function downloadFifty(){",
` async function saveDownloaded(urls, downloaded=true){\n   if(!urls.length)return;\n   const r=await fetch('/api/admin/source-library',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({urls,downloaded})});\n   if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.message||'Could not save download history.');}\n   await refreshSources();\n   if(downloaded)chosen=chosen.filter(x=>!urls.some(u=>x===u+'|csv-generated'));\n }\n function generatedUrls(response){\n   const header=response.headers.get('x-generated-urls');\n   if(!header)throw Error('ZIP was generated but did not include a success manifest header. Download history was not updated.');\n   return JSON.parse(decodeURIComponent(header));\n }\n async function undoDownload(){\n   const urls=[...new Set(generatedSelected.map(v=>v.slice(0,-14)))].slice(0,12);\n   if(!urls.length){note='Select a downloaded CSV first.';return;}\n   busy=true;error='';\n   try{await saveDownloaded(urls,false);chosen=chosen.filter(x=>!urls.some(u=>x===u+'|csv-generated'));note='Reset '+urls.length+' CSV download status(es).';}\n   catch(e){error=e?.message||'Could not reset download status.';}finally{busy=false;}\n }\n async function downloadFifty(){`,
'helper insertion');
page=once(page,
"       download('source-library-csv-'+String(i/10+1).padStart(2,'0')+'.zip',await r.blob());\n       done+=segment.length;bulkProgress='Downloaded '+done+'/'+urls.length+' selected CSV sources';",
"       const succeeded=generatedUrls(r);\n       download('source-library-csv-'+String(i/10+1).padStart(2,'0')+'.zip',await r.blob());\n       await saveDownloaded(succeeded);\n       done+=succeeded.length;bulkProgress='Generated '+done+'/'+urls.length+' CSVs and marked them downloaded';",
'bulk download');
page=once(page,
"     download('source-library-generated-csv.zip',await response.blob());\n     note='Generated CSV ZIP downloaded. Review export-report.json and every checklist before importing.';",
"     const succeeded=generatedUrls(response);\n     download('source-library-generated-csv.zip',await response.blob());\n     await saveDownloaded(succeeded);\n     note='CSV ZIP generated; '+succeeded.length+' source(s) marked downloaded. Review export-report.json before importing.';",
'single download');
page=once(page,
"{masterCount} CSV-ready · {awaiting}",
"{masterCount} CSV-ready · {downloadedCount} downloaded · {awaiting}",
'counter');
page=once(page,
'<option value="ready">CSV ready</option>',
'<option value="ready">Not yet downloaded</option><option value="downloaded">Downloaded</option>',
'filter choices');
page=once(page,
'<button type="button" class="secondary" disabled={busy || discoveryBusy} onclick={recheckPrevious}>',
'<button type="button" class="secondary" disabled={busy || bulkBusy || !generatedSelected.length || statusFilter !== \'downloaded\'} onclick={undoDownload}>Mark selected as not downloaded</button><button type="button" class="secondary" disabled={busy || discoveryBusy} onclick={recheckPrevious}>',
'undo button');
page=once(page,
" : 'Awaiting extraction check'} · cached {x.scannedAt || x.checkedAt || '—'}</small>",
" : 'Awaiting extraction check'} · {x.downloadedAt ? 'Downloaded '+new Date(x.downloadedAt).toLocaleString() : 'Not downloaded'} · cached {x.scannedAt || x.checkedAt || '—'}</small>",
'row status');

const outputs=[page,api,exp];
const backup=path.join(root,'.setbound-source-download-backups-'+Date.now());
fs.mkdirSync(backup,{recursive:true});
files.forEach(({p,text})=>{const dest=path.join(backup,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);});
try{files.forEach((f,i)=>fs.writeFileSync(f.file,outputs[i]));}
catch(e){files.forEach(f=>fs.writeFileSync(f.file,f.text));throw e;}
console.log('Downloaded/not-downloaded tracking installed. Backup:',backup);
console.log('Run npm run check && npm run build. No D1 migration.');
