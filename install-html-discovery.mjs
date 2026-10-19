import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const pagePath = path.join(root,'src/routes/admin/source-library/+page.svelte');
const endpointPath = path.join(root,'src/routes/api/admin/source-library/discover/+server.js');
const bundledEndpoint = path.join(root,'src/routes/api/admin/source-library/discover/+server.js');
const page = fs.readFileSync(pagePath,'utf8');
const start = page.indexOf(' async function catalogStep(reset = false) {');
const end = page.indexOf(' async function inspectVisible(){',start);
if(start < 0 || end < start || page.indexOf(' async function catalogStep(reset = false) {',start+1)!==-1) throw Error('Expected catalogStep anchor not found exactly once. No changes.');
const oldPanelStart = page.indexOf('<div class="panel discovery">');
const oldPanelEnd = page.indexOf(' <div class="panel"><label for="urls">',oldPanelStart);
if(oldPanelStart<0 || oldPanelEnd<oldPanelStart || page.indexOf('<div class="panel discovery">',oldPanelStart+1)!==-1) throw Error('Expected discovery panel not found exactly once. No changes.');
const oldVars = 'let discoveryQueue = $state([]), discoveryBusy = $state(false), discoveredPages = $state(0), newPages = $state(0), discoveryScanned = $state(0);';
if(page.split(oldVars).length!==2) throw Error('Expected discovery state not found exactly once. No changes.');
const fn = ` async function catalogStep(reset = false) {
   if (discoveryBusy) return;
   discoveryBusy = true; error = ''; note = '';
   try {
     const next = reset ? 1 : discoveryNextPage;
     if (!next) { note = 'Catalog scan is complete.'; return; }
     const r = await fetch('/api/admin/source-library/discover', {
       method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ reset, nextPage:next, totalPages:discoveryTotalPages })
     });
     const j = await r.json();
     if (!r.ok) throw new Error(j.message || 'Catalog discovery failed.');
     if (reset) { discoveredPages=0; newPages=0; discoveryScanned=0; }
     discoveryScanned += j.pagesScanned || 0;
     discoveredPages += j.links || 0;
     newPages += j.added || 0;
     discoveryTotalPages = j.totalPages || discoveryTotalPages;
     discoveryNextPage = j.nextPage;
     note = 'Scanned ' + discoveryScanned + ' archive pages · ' + discoveredPages + ' links seen · ' + newPages + ' new entries. ' + (discoveryNextPage ? 'Next page: '+discoveryNextPage+'.' : 'Archive scan complete.');
     const list = await fetch('/api/admin/source-library');
     if (list.ok) entries = (await list.json()).entries || [];
   } catch(e) { error = e?.message || 'Catalog discovery failed. You can retry the same page.'; }
   finally { discoveryBusy = false; }
 }
`;
const panel = `<div class="panel discovery"><strong>Catalog discovery</strong><p>Find releases from the published archive, three pages per scan. Results are cached as uninspected sources and existing reviews are preserved.</p><div class="tools"><button type="button" onclick={() => catalogStep(true)} disabled={discoveryBusy || busy}>{discoveryBusy ? 'Scanning…' : 'Start archive scan'}</button><button type="button" class="secondary" onclick={() => catalogStep(false)} disabled={discoveryBusy || busy || !discoveryNextPage}>Scan next 3 pages {discoveryNextPage ? '(' + discoveryNextPage + ')' : ''}</button><button type="button" class="secondary" onclick={inspectVisible} disabled={busy || discoveryBusy || !showing.some(x=>x.discoveredOnly)}>Inspect next 12 visible ({showing.filter(x=>x.discoveredOnly).length})</button></div><small>{discoveryScanned} archive pages scanned · {discoveredPages} links seen · {newPages} new entries · {discoveryNextPage ? 'next page '+discoveryNextPage : 'scan complete'}. Discovered links must be inspected before CSV export.</small></div>\n`;
let updated = page.slice(0,start)+fn+page.slice(end);
const p1 = updated.indexOf('<div class="panel discovery">');
const p2 = updated.indexOf(' <div class="panel"><label for="urls">',p1);
if (p1<0 || p2<0) throw Error('Panel disappeared during update. No changes.');
updated = updated.slice(0,p1)+panel+updated.slice(p2);
updated=updated.replace(oldVars,"let discoveryNextPage = $state(1), discoveryTotalPages = $state(180), discoveryBusy = $state(false), discoveredPages = $state(0), newPages = $state(0), discoveryScanned = $state(0);");
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backup = pagePath+'.before-html-discovery-'+stamp+'.bak';
fs.copyFileSync(pagePath,backup);
fs.writeFileSync(pagePath,updated);
console.log('Source Library archive discovery UI installed. Existing endpoint file remains in place. Backup:',backup);
