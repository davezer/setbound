import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const apiPath=path.join(root,'src/routes/api/admin/source-library/+server.js');
const pagePath=path.join(root,'src/routes/admin/source-library/+page.svelte');
const api=fs.readFileSync(apiPath,'utf8');
const page=fs.readFileSync(pagePath,'utf8');
const changes=[];
function change(text,oldValue,newValue,label){
 const n=text.split(oldValue).length-1;
 if(n!==1)throw new Error(`Expected one ${label} anchor; found ${n}. No files changed.`);
 return text.replace(oldValue,newValue);
}
let nextApi=api;
nextApi=change(nextApi,`const normalize = (value) => String(value || '').trim();`,`const normalize = (value) => String(value || '').trim();

// Follow only validated HTTPS checklist redirects on the same approved host.
async function checklistResponse(fetchFn, start) {
  let current = start;
  const seen = new Set();
  for (let attempt=0; attempt<4; attempt++) {
    if (!siteUrl(current) || seen.has(current)) throw new Error('Redirect destination is not an approved checklist URL.');
    seen.add(current);
    const response = await fetchFn(current, { redirect:'manual', headers:{ accept:'text/html', 'user-agent':'Setbound checklist catalog/1.0' } });
    if ([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');
      if (!location) throw new Error('Redirect did not include a destination.');
      const destination=new URL(location,current).href;
      if (!siteUrl(destination)) throw new Error('Redirect destination is outside approved checklist pages.');
      current=destination;
      continue;
    }
    if (!response.ok || !String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))
      throw new Error('Page returned HTTP '+response.status+' or non-HTML content.');
    const declaredLength=Number(response.headers.get('content-length')||0);
    if(declaredLength>1_200_000)throw new Error('Source HTML exceeds the inspection limit.');
    const html=await response.text();
    if(html.length>1_200_000)throw new Error('Source HTML exceeds the inspection limit.');
    return { html, resolvedUrl:current };
  }
  throw new Error('Too many checklist redirects.');
}`, 'API fetch helper');
nextApi=change(nextApi,`      const response = await fetch(url, {redirect:'manual', headers:{accept:'text/html', 'user-agent':'Setbound checklist catalog/1.0'}});
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) throw new Error(\`Page returned HTTP \${response.status} or non-HTML content.\`);
      const html = (await response.text()).slice(0, 1200000);`,`      const {html, resolvedUrl} = await checklistResponse(fetch, url);`, 'API redirect fetch');
nextApi=change(nextApi,`      const links = downloadLinks(html,url);`,`      const links = downloadLinks(html,resolvedUrl);`, 'API link base');
nextApi=change(nextApi,`        csvUrl:links.csv,pdfUrl:links.pdf, csvButton:`,`        resolvedUrl, csvUrl:links.csv,pdfUrl:links.pdf, csvButton:`, 'API resolved URL');
nextApi=change(nextApi,`    } catch(e) { results.push({pageUrl:url,ok:false,error:e?.message || 'Page could not be inspected.'}); }`,`    } catch(e) {
      const reason=e?.message || 'Page could not be inspected.';
      const old=await database.prepare('SELECT entry_json FROM source_harvester_cache WHERE page_url = ? AND source = ?').bind(url,SOURCE).first();
      if(old){
        let prior;
        try{prior=JSON.parse(old.entry_json);}catch{prior={pageUrl:url,name:new URL(url).pathname.split('/').filter(Boolean).at(-1)};}
        // Preserve a previously successful extraction if a later network request fails.
        if(prior.extractionStatus!=='ready'){
          const entry={...prior,extractionStatus:'attention',verifiedMaster:false,extractionReason:reason,checkedAt:new Date().toISOString()};
          await database.prepare('UPDATE source_harvester_cache SET entry_json = ?, updated_at = datetime(\'now\') WHERE page_url = ? AND source = ?').bind(JSON.stringify(entry),url,SOURCE).run();
        }
      }
      results.push({pageUrl:url,ok:false,extractionStatus:'attention',error:reason});
    }`, 'API error handling');

let nextPage=page;
nextPage=change(nextPage,` let excluded = $derived(entries.filter(x=>x.sourceKind==='format').length);`,` let excluded = $derived(entries.filter(x=>x.sourceKind==='format').length);
 let attention = $derived(entries.filter(x=>x.sourceKind==='candidate' && x.extractionStatus==='attention').length);
 let cachedTotal = $derived(entries.length);`, 'dashboard counters');
nextPage=change(nextPage,`(statusFilter === 'unavailable' && x.extractionStatus === 'unavailable')`,`(statusFilter === 'unavailable' && x.extractionStatus === 'unavailable') || (statusFilter === 'attention' && x.extractionStatus === 'attention')`, 'attention filter');
nextPage=change(nextPage,`<option value="unavailable">No usable table</option>`,`<option value="unavailable">No usable table</option><option value="attention">Needs attention</option>`, 'filter option');
nextPage=change(nextPage,`{excluded} format pages excluded. Earlier inspections require a one-time quality recheck.`,`{excluded} format pages excluded · {attention} need attention · {cachedTotal} cached source records in D1. Scan counters track this browser session only; your cached catalog is preserved.`, 'status wording');
nextPage=change(nextPage,`x.extractionStatus==='unavailable' ? \`No usable card table: \${x.extractionReason || 'Extraction returned no rows'}\` : 'Awaiting extraction check'`,`x.extractionStatus==='unavailable' ? \`No usable card table: \${x.extractionReason || 'Extraction returned no rows'}\` : x.extractionStatus==='attention' ? \`Needs attention: \${x.extractionReason || 'Inspection failed'}\` : 'Awaiting extraction check'`, 'row status');
// Save after all matches have been validated. Never overwrite source files before validation.
for(const [p,content] of [[apiPath,nextApi],[pagePath,nextPage]]){
 const backup=p+'.before-source-cleanup-'+Date.now()+'.bak';
 fs.copyFileSync(p,backup);
 changes.push([p,content,backup]);
}
try{for(const [p,content] of changes)fs.writeFileSync(p,content);}catch(e){for(const [p,,backup] of changes)fs.copyFileSync(backup,p);throw e;}
console.log('Installed Source Library cleanup. Backups:', changes.map(x=>x[2]).join(', '));
