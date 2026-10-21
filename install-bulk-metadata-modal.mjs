import fs from 'node:fs';
const file = 'src/routes/admin/sets/+page.svelte';
if (!fs.existsSync(file)) throw Error('Run this from the Setbound project root.');
const original = fs.readFileSync(file, 'utf8');
let source = original;
function replaceExact(before, after, label) {
  const found = source.split(before).length - 1;
  if (found !== 1) throw Error(`${label}: expected one exact source anchor; found ${found}. No files changed.`);
  source = source.replace(before, after);
}
if (source.includes('SETBOUND_BULK_METADATA_MODAL_V2')) throw Error('This upgrade is already installed. No files changed.');
replaceExact("\tlet metadataError = $state('');", "\tlet metadataError = $state('');\n\tlet metadataModalOpen = $state(false); // SETBOUND_BULK_METADATA_MODAL_V2", 'state');
replaceExact("\t\tmetadataResults=[];metadataBusy=true;metadataStop=false;metadataError='';", "\t\tmetadataResults=[];metadataBusy=true;metadataStop=false;metadataError='';metadataModalOpen=true;", 'open modal on preview');
replaceExact("\t\t\t\tconst date=!!first.releaseDate&&!first.existingDate;", "\t\t\t\tconst images=second.hasImage?[]:[...new Set(second.images||[])];\n\t\t\t\tconst date=!!first.releaseDate&&!first.existingDate;", 'image candidates');
replaceExact("status:date||desc||fields.length?'ready':'unchanged',approved:date||desc||fields.length>0,date,desc,fields,releaseDate:first.releaseDate,overview:second.overview||'',formats:second.formats||{},sourceUrl:second.sourceUrl", "status:date||desc||fields.length||images.length?'ready':'unchanged',approved:!!(date||desc||fields.length),date,desc,fields,images,image:'',releaseDate:first.releaseDate,overview:second.overview||'',formats:second.formats||{},sourceUrl:second.sourceUrl", 'store image candidates');
replaceExact("if(!confirm('Save selected empty metadata for '+rows.length+' sets?\\n\\nExisting descriptions, images and custom box details will be preserved. Image selection remains manual.'))return;", "if(!confirm('Save approved metadata for '+rows.length+' sets?\\n\\nSelected source images will be downloaded to R2. Existing artwork, descriptions, and custom box details will not be replaced.'))return;", 'confirmation');
replaceExact("if(row.desc||row.fields.length){const r=await fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,applyOverview:row.desc,overview:row.overview,formats:row.fields}),signal:AbortSignal.timeout(25000)});", "if(row.desc||row.fields.length||row.image){const r=await fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,applyOverview:row.desc,overview:row.overview,formats:row.fields,imageUrl:row.image||''}),signal:AbortSignal.timeout(25000)});", 'save selected image');
replaceExact("products=products.map(p=>Number(p.id)===row.id?{...p,release_date:row.date?row.releaseDate:p.release_date,has_product_details:row.desc?1:p.has_product_details}:p);", "products=products.map(p=>Number(p.id)===row.id?{...p,release_date:row.date?row.releaseDate:p.release_date,has_product_details:row.desc?1:p.has_product_details,image_key:resultImageKey||p.image_key}:p);", 'reflect saved images');
replaceExact("if(row.desc||row.fields.length||row.image){const r=await fetch", "let resultImageKey='';\n\t\t\t\tif(row.desc||row.fields.length||row.image){const r=await fetch", 'result image variable');
replaceExact("if(!r.ok)throw Error(j.message||'Details save failed.');}", "if(!r.ok)throw Error(j.message||'Details save failed.');resultImageKey=j.imageKey||'';}", 'store image response');
replaceExact("<p>Exact parent matches only. Previews release dates, original descriptions and box details without saving. Images stay manual. Source requests run one set at a time.</p>", "<p>Review release dates, descriptions, box details and product images in a full-size window. Nothing saves without approval.</p>\n\t\t{#if metadataResults.length}<button type=\"button\" onclick={()=>metadataModalOpen=true}>Open metadata review ({metadataResults.length})</button>{/if}", 'bulk panel description');
// Remove the original inline review/progress. Put all result and save controls into the modal.
const metaPanel=source.indexOf('<strong>Bulk parent metadata</strong>');
const resultStart=source.indexOf('\n\t\t{#if metadataProgress}',metaPanel);
const panelEnd=source.indexOf('</details>',resultStart);
if(metaPanel<0||resultStart<0||panelEnd<0)throw Error('Original metadata review block not found. No files changed.');
source=source.slice(0,resultStart)+'\n\t\t</div>\n\t\t'+source.slice(panelEnd);
const markup=`\n{#if metadataModalOpen}\n  <div class="bulk-meta-overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!metadataBusy&&!metadataApplying)metadataModalOpen=false}}>
    <section class="bulk-meta-dialog" role="dialog" aria-modal="true" aria-label="Bulk parent metadata review" tabindex="-1">
      <header class="bulk-meta-head">
        <div><h2>Review parent metadata</h2><p>{metadataResults.length} reviewed · {readyMetadata.length} approved · {metadataSelectedIds.length} selected</p></div>
        <button type="button" aria-label="Close review" onclick={()=>metadataModalOpen=false}>✕</button>
      </header>
      <div class="bulk-meta-toolbar">
        <button type="button" onclick={()=>metadataResults=metadataResults.map(x=>x.status==='ready'?{...x,approved:true}:x)} disabled={metadataBusy||metadataApplying}>Select all proposals</button>
        <button type="button" onclick={()=>metadataResults=metadataResults.map(x=>({...x,approved:false}))} disabled={metadataBusy||metadataApplying}>Deselect all</button>
        {#if metadataBusy||metadataApplying}<button type="button" onclick={()=>metadataStop=true} disabled={metadataStop}>Stop after current set</button>{/if}
      </div>
      {#if metadataProgress}<p class="bulk-meta-progress" role="status">{metadataProgress}</p>{/if}
      {#if metadataError}<p role="alert" class="error">{metadataError}</p>{/if}
      <div class="bulk-meta-results">
        {#each metadataResults as row (row.id)}
          <article class="bulk-meta-item">
            <div class="bulk-meta-item-head">
              {#if row.status==='ready'}
                <label><input type="checkbox" checked={row.approved} disabled={metadataBusy||metadataApplying} onchange={e=>metadataResults=metadataResults.map(x=>x.id===row.id?{...x,approved:e.currentTarget.checked}:x)}/><strong>{row.name}</strong></label>
              {:else}<strong>{row.name}</strong>{/if}
              <span>{row.status}</span>
            </div>
            {#if row.status==='ready'}
              <p>{row.date?'Release date: '+row.releaseDate+' · ':''}{row.desc?'Description · ':''}{row.fields.length} box breakdown(s) · {row.images.length} image candidate(s) · <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a></p>
              {#if row.desc}<p class="bulk-meta-description">{row.overview}</p>{/if}
              {#each row.fields as key}<p class="bulk-meta-spec"><strong>{key.replaceAll('_',' ')}:</strong> {row.formats[key]}</p>{/each}
              {#if row.images.length}
                <div class="bulk-meta-images">
                  <label class:chosen={!row.image}>
                    <input type="radio" name={'image-'+row.id} checked={!row.image} disabled={metadataBusy||metadataApplying} onchange={()=>metadataResults=metadataResults.map(x=>x.id===row.id?{...x,image:''}:x)}/>
                    <span>No image</span>
                  </label>
                  {#each row.images as url}
                    <label class:chosen={row.image===url}>
                      <input type="radio" name={'image-'+row.id} checked={row.image===url} disabled={metadataBusy||metadataApplying} onchange={()=>metadataResults=metadataResults.map(x=>x.id===row.id?{...x,image:url,approved:true}:x)}/>
                      <img src={url} alt={'Source candidate for '+row.name} loading="lazy"/>
                    </label>
                  {/each}
                </div>
                <p class="bulk-meta-note">Only select artwork you've verified belongs to this release. Existing product images are never replaced.</p>
              {/if}
            {:else if row.status==='error'}<p class="error">{row.error}</p>{/if}
          </article>
        {/each}
        {#if metadataBusy}<p>Checking sources one product at a time…</p>{/if}
      </div>
      <footer class="bulk-meta-footer">
        <span>{readyMetadata.length} approved for saving</span>
        <button type="button" onclick={()=>metadataModalOpen=false} disabled={metadataApplying}>Close</button>
        <button type="button" class="bulk-meta-save" onclick={metadataApply} disabled={metadataBusy||metadataApplying||!readyMetadata.length}>{metadataApplying?'Saving…':'Approve and save ('+readyMetadata.length+')'}</button>
      </footer>
    </section>
  </div>
{/if}
`;
replaceExact('{#if cleanupProduct}',markup+'\n{#if cleanupProduct}','modal insertion');
const css=`\n/* SETBOUND_BULK_METADATA_MODAL_V2 */\n.bulk-meta-overlay{position:fixed;inset:0;background:#1119;z-index:1500;display:grid;place-items:center;padding:1rem}\n.bulk-meta-dialog{width:min(1050px,100%);max-height:94vh;min-height:50vh;background:white;border-radius:1rem;display:flex;flex-direction:column;overflow:hidden;color:#171717}\n.bulk-meta-head,.bulk-meta-toolbar,.bulk-meta-footer{display:flex;gap:.65rem;align-items:center;justify-content:space-between;padding:.85rem 1.1rem;border-bottom:1px solid #e5e5e5;flex-wrap:wrap}\n.bulk-meta-head h2{font-size:1.35rem;margin:0}.bulk-meta-head p,.bulk-meta-progress{font-size:.75rem;color:#666;margin:.2rem 0 0}\n.bulk-meta-head button,.bulk-meta-toolbar button,.bulk-meta-footer button{cursor:pointer;border:1px solid #ddd;background:#f6f6f6;border-radius:.5rem;padding:.52rem .75rem;font:inherit;font-size:.76rem;font-weight:800}\n.bulk-meta-progress{padding:.4rem 1.1rem}.bulk-meta-results{padding:1rem;overflow:auto;flex:1;display:grid;gap:.8rem;align-content:start}\n.bulk-meta-item{border:1px solid #ddd;border-radius:.7rem;padding:1rem;display:grid;gap:.55rem}\n.bulk-meta-item-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}.bulk-meta-item-head label{display:flex;align-items:center;gap:.5rem}.bulk-meta-item-head span{color:#777;font-size:.7rem}\n.bulk-meta-item p{font-size:.78rem;line-height:1.5;margin:0}.bulk-meta-description{color:#333}.bulk-meta-spec{white-space:pre-line}.bulk-meta-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:.6rem}\n.bulk-meta-images label{display:grid;gap:.3rem;padding:.5rem;border:1px solid #ddd;border-radius:.6rem;min-height:135px;cursor:pointer;align-content:start}.bulk-meta-images label.chosen{border-color:#111;background:#fafafa}\n.bulk-meta-images label img{max-width:100%;width:100%;height:125px;object-fit:contain}.bulk-meta-note{color:#666}.bulk-meta-footer{border-top:1px solid #e5e5e5;border-bottom:0}.bulk-meta-footer .bulk-meta-save{background:#191919;color:white}.bulk-meta-footer button:disabled{opacity:.4}\n@media(max-width:600px){.bulk-meta-dialog{max-height:96vh}.bulk-meta-overlay{padding:.4rem}.bulk-meta-results{padding:.65rem}}\n`;
replaceExact('</style>',css+'</style>','modal styling');
fs.writeFileSync(file,source);
console.log('Installed bulk metadata review modal with manually selected source images. No backups or migrations.');
