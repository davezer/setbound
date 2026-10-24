import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const pathTo=p=>path.join(root,p);
const patches=[];
function patch(file,oldText,newText){const full=pathTo(file);if(!fs.existsSync(full))throw Error('Missing '+file);const content=patches.find(x=>x.file===file)?.content??fs.readFileSync(full,'utf8');if(content.includes(newText))return;const count=content.split(oldText).length-1;if(count!==1)throw Error(file+': expected one source anchor, found '+count);const next=content.replace(oldText,newText);const at=patches.findIndex(x=>x.file===file);if(at>=0)patches[at].content=next;else patches.push({file,content:next});}
const endpoint='src/routes/api/admin/products/parallel-metadata/+server.js';
if(fs.existsSync(pathTo(endpoint)))throw Error('Parallel endpoint already exists. Stop to avoid overwriting custom changes.');
const endpointSource=fs.readFileSync(new URL('./parallel-endpoint.js',import.meta.url),'utf8');
// Public display uses the existing checklist_details.parallels_json, no migration.
const page='src/routes/sets/[slug]/+page.svelte';
patch(page,'\n\t<section class="browser">',`
  {#if data.checklists.some(c=>c.parallels?.length)}
    <details class="parallel-guide">
      <summary><span><strong>Parallels & variations</strong><small>Names and print runs by checklist</small></span><span>Explore ↗</span></summary>
      <div class="parallel-inner">
        {#each data.checklists.filter(c=>c.parallels?.length) as checklist (checklist.id)}
          <div class="parallel-group"><h3>{checklist.name} <small>{checklist.parallels.length} parallels</small></h3>
            <div class="parallel-items">{#each checklist.parallels as item,i (i)}
              <div><strong>{typeof item==='string'?item:(item.name||item.label||'Parallel')}</strong><span>{typeof item==='string'?'':(item.number||item.serial_number||item.print_run||'Unnumbered')}</span>{#if typeof item==='object'&&item.availability}<small>{item.availability}</small>{/if}</div>
            {/each}</div>
          </div>
        {/each}
      </div>
    </details>
  {/if}
\t<section class="browser">`);
patch(page,'\n</style>',`
  .parallel-guide{margin:1.7rem 0;border-block:1px solid var(--line);padding:1rem 0}.parallel-guide>summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer;list-style:none}.parallel-guide>summary::-webkit-details-marker{display:none}.parallel-guide>summary strong{display:block;font-family:var(--display);font-size:1.25rem}.parallel-guide>summary small{display:block;color:var(--muted);font-size:.76rem;margin-top:.2rem}.parallel-guide>summary>span:last-child{color:var(--blue);font-size:.77rem;font-weight:800}.parallel-inner{padding:1.2rem 0 .2rem}.parallel-group{margin-bottom:1.3rem}.parallel-group h3{font-size:1rem;margin:0 0 .5rem}.parallel-group h3 small{color:var(--muted);font-size:.72rem;font-weight:400;margin-left:.5rem}.parallel-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 1.5rem}.parallel-items>div{display:flex;align-items:baseline;gap:.6rem;border-bottom:1px solid var(--line);padding:.55rem 0;font-size:.78rem}.parallel-items>div strong{flex:1;font-weight:650}.parallel-items>div span{font-weight:800;white-space:nowrap}.parallel-items>div small{color:var(--muted);font-size:.65rem}@media(max-width:850px){.parallel-items{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.parallel-items{grid-template-columns:1fr}}
</style>`);
const admin='src/routes/admin/sets/+page.svelte';
// Keep this separate from source metadata because selecting thousands for automatic apply would be unsafe.
patch(admin,"\tlet metadataSelectedIds = $state([]);",`\tlet parallelResults = $state([]);
  let parallelBusy = $state(false);
  let parallelStop = $state(false);
  let parallelProgress = $state('');
  let parallelModalOpen = $state(false);
  let parallelSelectedIds = $state([]);
  const readyParallel = $derived(parallelResults.filter(x=>x.ok&&x.proposals?.length&&x.approved));
  async function scanParallels(){
    if(parallelBusy||!parallelSelectedIds.length)return;
    parallelResults=[];parallelBusy=true;parallelStop=false;parallelModalOpen=true;
    const ids=[...parallelSelectedIds];
    for(let i=0;i<ids.length;i++){
      if(parallelStop)break;
      const product=products.find(x=>Number(x.id)===ids[i]);if(!product)continue;
      parallelProgress='Scanning '+(i+1)+' / '+ids.length+': '+product.name;
      try{const r=await fetch('/api/admin/products/parallel-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',productId:product.id})});const j=await r.json();
        if(!r.ok)throw Error(j.message||'Could not extract parallel guide.');
        parallelResults=[...parallelResults,{id:product.id,name:product.name,...j,approved:false}];
      }catch(e){parallelResults=[...parallelResults,{id:product.id,name:product.name,ok:false,error:e?.message||'Scan failed',approved:false}];}
    }
    parallelBusy=false;parallelProgress='Scanned '+parallelResults.length+' of '+ids.length+' products.';
  }
  async function applyParallels(){
    if(parallelBusy||!readyParallel.length)return;
    if(!confirm('Apply reviewed parallel definitions to '+readyParallel.length+' products? Existing curated parallel data will not be overwritten.'))return;
    parallelBusy=true;parallelStop=false;
    for(let i=0;i<readyParallel.length;i++){
      if(parallelStop)break;const row=readyParallel[i];parallelProgress='Saving '+(i+1)+' / '+readyParallel.length+': '+row.name;
      try{const r=await fetch('/api/admin/products/parallel-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,confirmed:true})});const j=await r.json();if(!r.ok)throw Error(j.message||'Save failed');parallelResults=parallelResults.map(x=>x.id===row.id?{...x,approved:false,saved:j.saved}:x);}
      catch(e){parallelResults=parallelResults.map(x=>x.id===row.id?{...x,approved:false,error:e?.message}:x);}
    }
    parallelBusy=false;parallelProgress='Parallel save pass finished.';
  }
\tlet metadataSelectedIds = $state([]);`);
patch(admin,'<button class="edit" type="button" onclick={() => sourceMetadataProduct = product}>Source metadata</button>',`<button class="edit" type="button" onclick={() => {parallelSelectedIds=[Number(product.id)];scanParallels();}}>Parallels</button>
                    <button class="edit" type="button" onclick={() => sourceMetadataProduct = product}>Source metadata</button>`);
patch(admin,'\n{#if metadataModalOpen}',`
{#if parallelModalOpen}
<div class="bulk-meta-overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!parallelBusy)parallelModalOpen=false}}>
 <section class="bulk-meta-dialog" role="dialog" aria-modal="true" aria-label="Review parallel definitions" tabindex="-1">
  <header class="bulk-meta-head"><div><h2>Parallel definitions</h2><p>Preview first. Existing parallel definitions remain untouched.</p></div><button type="button" disabled={parallelBusy} onclick={()=>parallelModalOpen=false}>✕</button></header>
  <div class="bulk-meta-toolbar"><button onclick={()=>parallelResults=parallelResults.map(x=>({...x,approved:!!x.ok&&!!x.proposals?.length}))} disabled={parallelBusy}>Approve all matched</button><button onclick={()=>parallelResults=parallelResults.map(x=>({...x,approved:false}))} disabled={parallelBusy}>Deselect all</button>{#if parallelBusy}<button onclick={()=>parallelStop=true}>Stop after current</button>{/if}</div>
  <p role="status">{parallelProgress}</p>
  <div class="bulk-meta-results">{#each parallelResults as item (item.id)}<article class="bulk-meta-item">
    <strong>{item.name}</strong>
    {#if item.error}<p>{item.error}</p>{:else}<p>{item.entries} source entries · {item.proposals?.length||0} matched checklist sections · {item.unmatchedCount} unmatched entries</p>
      {#each item.proposals||[] as match}<p><b>{match.checklistName}</b> — {match.parallels.length} parallels: {match.parallels.slice(0,8).map(p=>p.name+' '+p.number).join(', ')}{match.parallels.length>8?' …':''}</p>{/each}
      {#if item.unmatchedCount}<p>Skipped ambiguous source sections. No guessed mappings.</p>{/if}
      {#if item.saved!==undefined}<p>Saved in {item.saved} sections.</p>{:else if item.proposals?.length}<label><input type="checkbox" checked={item.approved} onchange={e=>parallelResults=parallelResults.map(x=>x.id===item.id?{...x,approved:e.currentTarget.checked}:x)}/> Approve matched sections</label>{/if}
    {/if}
  </article>{/each}</div>
  <div class="bulk-meta-toolbar"><button type="button" disabled={parallelBusy||!readyParallel.length} onclick={applyParallels}>Save {readyParallel.length} approved products</button></div>
 </section>
</div>
{/if}
{#if metadataModalOpen}`);
// Add select all live shortcut adjacent to existing metadata selection heading / controls.
const anchor='\tlet metadataSelectedIds = $state([]);';
// Rather than hijack existing metadata selection, add a parallel bulk control near the manage list.
const marker='<div class="actions">';
// For bulk select, inject controls before list heading via a stable existing metadata UI anchor.
const common='<section class="shell page">';
// Avoid brittle markup injections; use a global admin footer toolbar in this page.
patch(admin,'\n{#if parallelModalOpen}',`
<div style="margin:1rem auto;max-width:1420px;padding:0 1.25rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
  <strong style="font-size:.8rem">Parallel metadata:</strong>
  <button type="button" onclick={()=>parallelSelectedIds=visible.filter(p=>p.published).map(p=>Number(p.id))}>Select all visible live ({visible.filter(p=>p.published).length})</button>
  <button type="button" onclick={()=>parallelSelectedIds=[]}>Clear</button>
  <button type="button" onclick={scanParallels} disabled={parallelBusy||!parallelSelectedIds.length}>Review parallels for {parallelSelectedIds.length} sets</button>
  <span style="font-size:.75rem;color:var(--muted)">Runs one product at a time; review before saving.</span>
</div>
{#if parallelModalOpen}`);
for(const p of patches){fs.mkdirSync(path.dirname(pathTo(p.file)),{recursive:true});fs.writeFileSync(pathTo(p.file),p.content,'utf8');}
fs.mkdirSync(path.dirname(pathTo(endpoint)),{recursive:true});fs.writeFileSync(pathTo(endpoint),endpointSource,'utf8');
console.log('Added reviewed parallel metadata workflow. No migration, no card or odds changes.');
