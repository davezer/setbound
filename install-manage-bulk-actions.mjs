import fs from 'node:fs';

const page = 'src/routes/admin/sets/+page.svelte';
const server = 'src/routes/admin/sets/+page.server.js';
function once(s, anchor, replacement, file) {
  const n=s.split(anchor).length-1;
  if(n!==1)throw Error(`Expected exactly one anchor in ${file}; found ${n}: ${anchor.slice(0,70)}. No files changed.`);
  return s.replace(anchor,replacement);
}
const originalPage=fs.readFileSync(page,'utf8');
const originalServer=fs.readFileSync(server,'utf8');
if(originalPage.includes('SETBOUND_MANAGE_BULK_V1') || originalServer.includes('SETBOUND_MANAGE_BULK_V1'))throw Error('Bulk controls already installed. No files changed.');

const state = `
	// SETBOUND_MANAGE_BULK_V1: independent selections for publication and metadata.
	let selectedPublishIds = $state([]);
	let publishing = $state(false);
	const visibleDraftIds = $derived(visible.filter(p => !p.published).map(p => Number(p.id)));
	const selectedDraftIds = $derived(selectedPublishIds.filter(id => products.some(p => Number(p.id)===id && !p.published)));
	let metadataSelectedIds = $state([]);
	let metadataResults = $state([]);
	let metadataBusy = $state(false);
	let metadataApplying = $state(false);
	let metadataStop = $state(false);
	let metadataProgress = $state('');
	let metadataError = $state('');
	const visibleMetadataIds = $derived(visible.map(p => Number(p.id)));
	const readyMetadata = $derived(metadataResults.filter(row => row.status === 'ready' && row.approved));
	function updateSet(ids, id, checked) { const next=new Set(ids);checked?next.add(id):next.delete(id);return [...next]; }
	async function publishSelected() {
		const ids=[...selectedDraftIds];
		if(!ids.length || publishing)return;
		if(!confirm('Publish '+ids.length+' selected DRAFT sets now?\\n\\nThese pages will become public. No cards or metadata will be changed.'))return;
		publishing=true;message='';
		try {
			const fd=new FormData();fd.set('product_ids',JSON.stringify(ids));
			const r=await fetch('?/bulkOnline',{method:'POST',body:fd});
			const j=await r.json().catch(()=>({}));
			if(!r.ok || j.type==='failure' || j.type==='error')throw Error(j.message||'Publication failed (HTTP '+r.status+').');
			const changed=new Set(ids);
			products=products.map(p => changed.has(Number(p.id))?{...p,published:1}:p);
			selectedPublishIds=selectedPublishIds.filter(id=>!changed.has(id));
			message='Publication request completed for '+ids.length+' selected set(s). Refresh to verify publication status.';
		}catch(e){message=e?.message||'Could not publish selected sets.';}
		finally{publishing=false;}
	}
	async function metadataPreview() {
		if(metadataBusy || metadataApplying || !metadataSelectedIds.length)return;
		metadataResults=[];metadataBusy=true;metadataStop=false;metadataError='';
		const ids=[...metadataSelectedIds];
		for(let i=0;i<ids.length;i++){
			if(metadataStop)break;
			const p=products.find(item=>Number(item.id)===ids[i]);if(!p)continue;
			metadataProgress='Checking '+(i+1)+' / '+ids.length+': '+p.name;
			try {
				const requestFor=(path)=>fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',productId:p.id}),signal:AbortSignal.timeout(20000)});
				const [a,b]=await Promise.all([requestFor('/api/admin/products/source-metadata'),requestFor('/api/admin/products/source-metadata-details')]);
				const first=await a.json().catch(()=>({})),second=await b.json().catch(()=>({}));
				if(!a.ok||!b.ok)throw Error(first.message||second.message||'Source lookup failed.');
				const fields=Object.entries(second.formats||{}).filter(([key,value])=>value && (!second.existingFormats?.[key] || second.existingFormats[key].startsWith('Listed as a '))).map(([key])=>key);
				const date=!!first.releaseDate&&!first.existingDate;
				const desc=!!second.overview&&!second.existingOverview;
				metadataResults=[...metadataResults,{id:p.id,name:p.name,status:date||desc||fields.length?'ready':'unchanged',approved:date||desc||fields.length>0,date,desc,fields,releaseDate:first.releaseDate,overview:second.overview||'',formats:second.formats||{},sourceUrl:second.sourceUrl}];
			}catch(e){metadataResults=[...metadataResults,{id:p.id,name:p.name,status:'error',error:e?.message||'Lookup failed',approved:false}];}
		}
		metadataBusy=false;metadataProgress='Reviewed '+metadataResults.length+' of '+ids.length+' sets.';
	}
	async function metadataApply() {
		const rows=[...readyMetadata];
		if(metadataApplying||!rows.length)return;
		if(!confirm('Save selected empty metadata for '+rows.length+' sets?\\n\\nExisting descriptions, images and custom box details will be preserved. Image selection remains manual.'))return;
		metadataApplying=true;metadataStop=false;metadataError='';
		let saved=0, failed=0;
		for(let i=0;i<rows.length;i++){
			if(metadataStop)break;
			const row=rows[i];metadataProgress='Saving '+(i+1)+' / '+rows.length+': '+row.name;
			try {
				if(row.date){const r=await fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,releaseDate:true,formats:[]}),signal:AbortSignal.timeout(25000)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Release date save failed.');}
				if(row.desc||row.fields.length){const r=await fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,applyOverview:row.desc,overview:row.overview,formats:row.fields}),signal:AbortSignal.timeout(25000)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Details save failed.');}
				products=products.map(p=>Number(p.id)===row.id?{...p,release_date:row.date?row.releaseDate:p.release_date,has_product_details:row.desc?1:p.has_product_details}:p);
				metadataResults=metadataResults.map(x=>x.id===row.id?{...x,status:'saved',approved:false}:x);saved++;
			}catch(e){metadataResults=metadataResults.map(x=>x.id===row.id?{...x,status:'error',error:e?.message||'Save failed',approved:false}:x);failed++;}
		}
		metadataProgress='Saved '+saved+'; '+failed+' failed. Existing metadata preserved.';
		metadataApplying=false;
	}
`;
const markup = `
	<!-- SETBOUND_MANAGE_BULK_V1 -->
	<div class="offline-tools" aria-label="Bulk go live">
		<div class="offline-tools-heading"><strong>Bulk go live</strong><span>{selectedDraftIds.length} drafts selected</span></div>
		<div class="offline-tools-actions">
			<button type="button" onclick={()=>selectedPublishIds=[...new Set([...selectedPublishIds,...visibleDraftIds])]} disabled={publishing||!visibleDraftIds.length}>Select visible drafts ({visibleDraftIds.length})</button>
			<button type="button" onclick={()=>selectedPublishIds=products.filter(p=>!p.published).map(p=>Number(p.id))} disabled={publishing}>Select all drafts</button>
			<button type="button" onclick={()=>selectedPublishIds=[]} disabled={publishing||!selectedPublishIds.length}>Clear</button>
			<button type="button" onclick={publishSelected} disabled={publishing||!selectedDraftIds.length}>{publishing?'Publishing…':'Go live ('+selectedDraftIds.length+')'}</button>
		</div>
		<p>Uses separate checkboxes from bulk delete and bulk offline. Only selected drafts are published.</p>
	</div>
	<div class="offline-tools" aria-label="Bulk source metadata">
		<div class="offline-tools-heading"><strong>Bulk parent metadata</strong><span>{metadataSelectedIds.length} selected · {readyMetadata.length} ready to apply</span></div>
		<div class="offline-tools-actions">
			<button type="button" onclick={()=>metadataSelectedIds=[...new Set([...metadataSelectedIds,...visibleMetadataIds])]} disabled={metadataBusy||metadataApplying}>Select visible ({visibleMetadataIds.length})</button>
			<button type="button" onclick={()=>metadataSelectedIds=products.map(p=>Number(p.id))} disabled={metadataBusy||metadataApplying}>Select all sets</button>
			<button type="button" onclick={()=>metadataSelectedIds=[]} disabled={metadataBusy||metadataApplying}>Clear</button>
			<button type="button" onclick={metadataPreview} disabled={metadataBusy||metadataApplying||!metadataSelectedIds.length}>{metadataBusy?'Checking…':'Preview parent metadata ('+metadataSelectedIds.length+')'}</button>
			{#if metadataBusy||metadataApplying}<button type="button" onclick={()=>metadataStop=true} disabled={metadataStop}>Stop after current set</button>{/if}
		</div>
		<p>Exact parent matches only. Previews release dates, original descriptions and box details without saving. Images stay manual. Source requests run one set at a time.</p>
		{#if metadataProgress}<p role="status">{metadataProgress}</p>{/if}
		{#if metadataError}<p class="error">{metadataError}</p>{/if}
		{#if metadataResults.length}
			<div style="display:grid;gap:.55rem;max-height:400px;overflow:auto">
				{#each metadataResults as row (row.id)}
					<div style="padding:.6rem;border:1px solid #ddd;border-radius:.5rem">
						{#if row.status==='ready'}<label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" checked={row.approved} disabled={metadataApplying||metadataBusy} onchange={e=>metadataResults=metadataResults.map(x=>x.id===row.id?{...x,approved:e.currentTarget.checked}:x)}/><strong>{row.name}</strong></label>
							<small>{row.date?'Release date: '+row.releaseDate+' · ':''}{row.desc?'Description · ':''}{row.fields.length+' box breakdown(s)'} · <a href={row.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a></small>
							{#if row.desc}<p style="font-size:.76rem">{row.overview}</p>{/if}
							{#each row.fields as key}<p style="font-size:.74rem;white-space:pre-line"><strong>{key.replaceAll('_',' ')}:</strong> {row.formats[key]}</p>{/each}
						{:else}<strong>{row.name}</strong> <small>· {row.status==='error'?row.error:row.status}</small>{/if}
					</div>
				{/each}
			</div>
			<div class="offline-tools-actions"><button type="button" onclick={()=>metadataResults=metadataResults.map(x=>x.status==='ready'?{...x,approved:true}:x)} disabled={metadataBusy||metadataApplying}>Select all proposed metadata</button><button type="button" onclick={()=>metadataResults=metadataResults.map(x=>({...x,approved:false}))} disabled={metadataBusy||metadataApplying}>Deselect</button><button type="button" onclick={metadataApply} disabled={metadataBusy||metadataApplying||!readyMetadata.length}>{metadataApplying?'Saving…':'Approve and save ('+readyMetadata.length+')'}</button></div>
		{/if}
	</div>
`;
let newPage=once(originalPage,'\tlet toggling = $state(null);',state+'\n\tlet toggling = $state(null);',page);
newPage=once(newPage,'\t<div class="bulk-delete-tools" aria-label="Bulk delete imports">',markup+'\n\t<div class="bulk-delete-tools" aria-label="Bulk delete imports">',page);
newPage=once(newPage,'\t\t\t\t<div class="bulk-choice bulk-delete-choice">',`\t\t\t\t<div class="bulk-choice" title="Select for bulk publication"><input type="checkbox" aria-label={'Select '+product.name+' for bulk go live'} checked={selectedPublishIds.includes(Number(product.id))} disabled={!!product.published||publishing} onchange={e=>selectedPublishIds=updateSet(selectedPublishIds,Number(product.id),e.currentTarget.checked)} /></div>
\t\t\t\t<div class="bulk-choice" title="Select for bulk metadata"><input type="checkbox" aria-label={'Select '+product.name+' for bulk metadata'} checked={metadataSelectedIds.includes(Number(product.id))} disabled={metadataBusy||metadataApplying} onchange={e=>metadataSelectedIds=updateSet(metadataSelectedIds,Number(product.id),e.currentTarget.checked)} /></div>
\t\t\t\t<div class="bulk-choice bulk-delete-choice">`,page);
// A named form action matches the existing bulkOffline implementation; validates IDs before D1 update.
const action = `
	// SETBOUND_MANAGE_BULK_V1
	bulkOnline: async ({ request, platform }) => {
		const form = await request.formData();
		let ids;
		try { ids=JSON.parse(String(form.get('product_ids')||'[]')); }
		catch { return fail(400,{message:'Invalid selection.'}); }
		if(!Array.isArray(ids)||ids.length<1||ids.length>1000||!ids.every(id=>Number.isSafeInteger(id)&&id>0)||new Set(ids).size!==ids.length) return fail(400,{message:'Select 1 to 1000 unique drafts.'});
		const database=db(platform),statements=[];
		for(let i=0;i<ids.length;i+=75){const chunk=ids.slice(i,i+75);statements.push(database.prepare("UPDATE products SET published=1,updated_at=datetime('now') WHERE published=0 AND id IN ("+chunk.map(()=>'?').join(',')+')').bind(...chunk));}
		const result=await database.batch(statements);
		return {ok:true,publishedCount:result.reduce((n,r)=>n+Number(r.meta?.changes||0),0)};
	},
`;
const newServer=once(originalServer,'\t// SETBOUND_BULK_OFFLINE_V1:',action+'\n\t// SETBOUND_BULK_OFFLINE_V1:',server);
// All checks and replacements complete before either write.
fs.writeFileSync(page,newPage);
fs.writeFileSync(server,newServer);
console.log('Installed Manage Sets bulk metadata review and Go Live. No backups or migrations.');
