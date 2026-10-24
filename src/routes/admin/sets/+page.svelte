<script>
	import ChecklistCleanupModal from '$lib/components/ChecklistCleanupModal.svelte';
  import { parseSourceCsv } from '$lib/client/source-csv.js';
  import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
	import CardsmithsMetadataModal from '$lib/components/CardsmithsMetadataModal.svelte'; // SETBOUND_CARDSMITHS_METADATA_V1
	let { data, form } = $props();

	let products = $state([...data.products]);
	let sportFilter = $state('All sports');
	let yearFilter = $state('All years');
	let manufacturerFilter = $state('All manufacturers');
	let statusFilter = $state('All');
	let enrichmentFilter = $state('All enrichment');
	let query = $state('');
	let deleting = $state(null);
	// SETBOUND_BULK_DELETE_V1
	let selectedDeleteIds = $state([]);
	let bulkDeleteBusy = $state(false);
	let bulkDeleteProgress = $state('');
	const selectedDeleteProducts = $derived(products.filter(p => selectedDeleteIds.includes(Number(p.id))));
	const visibleDeleteIds = $derived(visible.map(p => Number(p.id)));
	function changeDeleteSelection(id, checked) {
		const next = new Set(selectedDeleteIds);
		if (checked) next.add(id); else next.delete(id);
		selectedDeleteIds = [...next];
	}
	function selectVisibleForDelete() {
		selectedDeleteIds = [...new Set([...selectedDeleteIds, ...visibleDeleteIds])];
	}
	async function deleteSelectedImports() {
		if (bulkDeleteBusy || deleting !== null) return;
		const selected = [...selectedDeleteProducts];
		if (!selected.length) return;
		const live = selected.filter(p => Boolean(p.published)).length;
		const cardCount = selected.reduce((sum,p) => sum + Number(p.card_count || 0), 0);
		const confirmed = prompt(
			'DELETE ' + selected.length + ' IMPORTS PERMANENTLY?\n\n' +
			selected.length + ' products, ' + cardCount.toLocaleString() + ' cards, and their checklists, sources and artwork will be deleted.\n' +
			(live ? 'WARNING: ' + live + ' selected sets are LIVE.\n' : '') +
			'Collection records associated with these sets may also be lost.\n' +
			'This cannot be undone. Type DELETE ' + selected.length + ' to proceed.'
		);
		if (confirmed !== 'DELETE ' + selected.length) return;
		bulkDeleteBusy = true;
		message = '';
		let completed = 0;
		try {
			for (const item of selected) {
				bulkDeleteProgress = 'Deleting ' + (completed + 1) + ' of ' + selected.length + ': ' + item.name;
				const response = await fetch('/api/admin/products/' + encodeURIComponent(item.id), { method: 'DELETE' });
				const result = await response.json().catch(() => ({}));
				if (!response.ok || result.ok !== true || Number(result.deleted?.id) !== Number(item.id)) {
					throw Error((result.message || 'Delete failed') + ' (' + item.name + ').');
				}
				products = products.filter(p => Number(p.id) !== Number(item.id));
				selectedDeleteIds = selectedDeleteIds.filter(id => id !== Number(item.id));
				selectedOfflineIds = selectedOfflineIds.filter(id => id !== Number(item.id));
				completed++;
			}
			message = 'Deleted ' + completed + ' selected import(s).';
		} catch (error) {
			message = 'Deleted ' + completed + ' of ' + selected.length + ' before stopping. ' + (error?.message || 'Unknown error') + ' Remaining selections were preserved.';
		} finally {
			bulkDeleteBusy = false;
			bulkDeleteProgress = '';
		}
	}

	// SETBOUND_MANAGE_BULK_V1: independent selections for publication and metadata.
	let selectedPublishIds = $state([]);
	let publishing = $state(false);
	const visibleDraftIds = $derived(visible.filter(p => !p.published).map(p => Number(p.id)));
	const selectedDraftIds = $derived(selectedPublishIds.filter(id => products.some(p => Number(p.id)===id && !p.published)));
	let parallelResults = $state([]);
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
	let metadataSelectedIds = $state([]);
	let metadataResults = $state([]);
	let metadataBusy = $state(false);
	let metadataApplying = $state(false);
	let metadataStop = $state(false);
	let metadataProgress = $state('');
	let metadataError = $state('');
	let metadataModalOpen = $state(false); // SETBOUND_BULK_METADATA_MODAL_V2
	const visibleMetadataIds = $derived(visible.map(p => Number(p.id)));
	const readyMetadata = $derived(metadataResults.filter(row => row.status === 'ready' && row.approved));
	function updateSet(ids, id, checked) { const next=new Set(ids);checked?next.add(id):next.delete(id);return [...next]; }
	async function publishSelected() {
		const ids=[...selectedDraftIds];
		if(!ids.length || publishing)return;
		if(!confirm('Publish '+ids.length+' selected DRAFT sets now?\n\nThese pages will become public. No cards or metadata will be changed.'))return;
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
		metadataResults=[];metadataBusy=true;metadataStop=false;metadataError='';metadataModalOpen=true;
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
				const images=second.hasImage?[]:[...new Set(second.images||[])];
				const date=!!first.releaseDate&&!first.existingDate;
				const desc=!!second.overview&&!second.existingOverview;
				metadataResults=[...metadataResults,{id:p.id,name:p.name,status:date||desc||fields.length||images.length?'ready':'unchanged',approved:!!(date||desc||fields.length),date,desc,fields,images,image:'',releaseDate:first.releaseDate,overview:second.overview||'',formats:second.formats||{},sourceUrl:second.sourceUrl}];
			}catch(e){metadataResults=[...metadataResults,{id:p.id,name:p.name,status:'error',error:e?.message||'Lookup failed',approved:false}];}
		}
		metadataBusy=false;metadataProgress='Reviewed '+metadataResults.length+' of '+ids.length+' sets.';
	}
	async function metadataApply() {
		const rows=[...readyMetadata];
		if(metadataApplying||!rows.length)return;
		if(!confirm('Save approved metadata for '+rows.length+' sets?\n\nSelected source images will be downloaded to R2. Existing artwork, descriptions, and custom box details will not be replaced.'))return;
		metadataApplying=true;metadataStop=false;metadataError='';
		let saved=0, failed=0;
		for(let i=0;i<rows.length;i++){
			if(metadataStop)break;
			const row=rows[i];metadataProgress='Saving '+(i+1)+' / '+rows.length+': '+row.name;
			try {
				if(row.date){const r=await fetch('/api/admin/products/source-metadata',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,releaseDate:true,formats:[]}),signal:AbortSignal.timeout(25000)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Release date save failed.');}
				let resultImageKey='';
				if(row.desc||row.fields.length||row.image){const r=await fetch('/api/admin/products/source-metadata-details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',productId:row.id,applyOverview:row.desc,overview:row.overview,formats:row.fields,imageUrl:row.image||''}),signal:AbortSignal.timeout(25000)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Details save failed.');resultImageKey=j.imageKey||'';}
				products=products.map(p=>Number(p.id)===row.id?{...p,release_date:row.date?row.releaseDate:p.release_date,has_product_details:row.desc?1:p.has_product_details,has_enrichment:(row.desc||row.fields.length)?1:p.has_enrichment,image_key:resultImageKey||p.image_key}:p);
				metadataResults=metadataResults.map(x=>x.id===row.id?{...x,status:'saved',approved:false}:x);saved++;
			}catch(e){metadataResults=metadataResults.map(x=>x.id===row.id?{...x,status:'error',error:e?.message||'Save failed',approved:false}:x);failed++;}
		}
		metadataProgress='Saved '+saved+'; '+failed+' failed. Existing metadata preserved.';
		metadataApplying=false;
	}

	let toggling = $state(null);
	let message = $state('');
	let cleanupProduct = $state(null);
  // SETBOUND_CHECKLIST_REPLACER_V1
  let replacementProduct = $state(null);
  let replacementFileName = $state('');
  let replacementCards = $state([]);
  let replacementPreview = $state(null);
  let replacementBusy = $state(false);
  let replacementError = $state('');
  function closeReplacement() { if(replacementBusy)return;replacementProduct=null;replacementCards=[];replacementPreview=null;replacementError='';replacementFileName=''; }
  async function chooseReplacement(event){
    const file=event.currentTarget.files?.[0];if(!file)return;
    replacementBusy=true;replacementError='';replacementPreview=null;replacementCards=[];replacementFileName=file.name;
    try{
      const ext=file.name.split('.').pop().toLowerCase();
      const parsed=ext==='csv'?await parseSourceCsv(file):['xlsx','xls'].includes(ext)?await extractSpreadsheetChecklist(file):null;
      if(!parsed?.cards?.length)throw Error('Choose a valid CSV, XLS, or XLSX checklist.');
      replacementCards=parsed.cards;
      await previewReplacement();
    }catch(e){replacementError=e?.message||'Unable to read checklist.';}
    finally{replacementBusy=false;}
  }
  async function previewReplacement(){
    const r=await fetch('/api/admin/products/'+replacementProduct.id+'/replace-checklist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'preview',cards:replacementCards,sourceFilename:replacementFileName})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Preview failed.');replacementPreview=j;
  }
  async function applyReplacement(){
    if(!replacementPreview?.canApply||replacementBusy)return;
    if(!confirm('Replace the checklist cards for '+replacementProduct.name+'? Existing product details and artwork will stay. Unmatched untracked card rows will be deleted.'))return;
    replacementBusy=true;replacementError='';
    try{
      const r=await fetch('/api/admin/products/'+replacementProduct.id+'/replace-checklist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'apply',cards:replacementCards,sourceFilename:replacementFileName,confirmation:'REPLACE CHECKLIST'})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||'Replacement failed.');
      closeReplacement();location.reload();
    }catch(e){replacementError=e?.message||'Unable to replace checklist.';}
    finally{replacementBusy=false;}
  }

	let sourceMetadataProduct = $state(null);
	// SETBOUND_BULK_OFFLINE_V1
	let selectedOfflineIds = $state([]);
	let bulkOfflineBusy = $state(false);
	const liveSetIds = $derived(products.filter(p => Boolean(p.published)).map(p => Number(p.id)));
	const visibleLiveIds = $derived(visible.filter(p => Boolean(p.published)).map(p => Number(p.id)));
	const selectedLiveIds = $derived(selectedOfflineIds.filter(id => liveSetIds.includes(id)));
	function changeOfflineSelection(id, checked) {
		const next = new Set(selectedOfflineIds);
		checked ? next.add(id) : next.delete(id);
		selectedOfflineIds = [...next];
	}
	function selectVisibleLive() {
		selectedOfflineIds = [...new Set([...selectedLiveIds, ...visibleLiveIds])];
	}
	function selectAllLive() { selectedOfflineIds = [...liveSetIds]; }
	async function takeSelectedOffline() {
		const ids = [...selectedLiveIds];
		if (!ids.length || bulkOfflineBusy) return;
		if (!confirm(`Take ${ids.length} selected LIVE set(s) offline?\n\nNo cards, images, metadata or collection data will be deleted. You can republish them individually later.`)) return;
		bulkOfflineBusy = true;
		message = '';
		try {
			const formData = new FormData();
			formData.set('product_ids', JSON.stringify(ids));
			const response = await fetch('?/bulkOffline', { method: 'POST', body: formData });
			if (!response.ok) throw new Error(`Bulk update failed (HTTP ${response.status}). No changes are confirmed.`);
			const idSet = new Set(ids);
			products = products.map(p => idSet.has(Number(p.id)) ? { ...p, published: 0 } : p);
			selectedOfflineIds = selectedOfflineIds.filter(id => !idSet.has(id));
			message = `Offline request completed for ${ids.length} selected set(s). Refresh the page to confirm status.`;
		} catch (error) { message = error?.message || 'Could not take selected sets offline.'; }
		finally { bulkOfflineBusy = false; }
	}


	let backfillBusy = $state(false);
	let backfillProgress = $state(null);
	let backfillIssues = $state([]);
	let lastFailedProductIds = $state([]);

	const toppsReadyCount = $derived(
		products.filter((product) => Boolean(product.has_topps_backfill)).length
	);

	const sports = $derived(['All sports', ...[...new Set(products.map((p) => p.sport_name).filter(Boolean))].sort()]);
	const years = $derived(['All years', ...[...new Set(products.map((p) => String(p.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a))]);
	const manufacturers = $derived(['All manufacturers', ...[...new Set(products.map((p) => p.manufacturer_name).filter(Boolean))].sort()]);

	const visible = $derived(
		products.filter((product) => {
			const q = query.trim().toLowerCase();

			return (
				(sportFilter === 'All sports' || product.sport_name === sportFilter) &&
				(yearFilter === 'All years' || String(product.year) === yearFilter) &&
				(manufacturerFilter === 'All manufacturers' || product.manufacturer_name === manufacturerFilter) &&
				(
					statusFilter === 'All' ||
					(statusFilter === 'Live' && Boolean(product.published)) ||
					(statusFilter === 'Draft' && !product.published)
				) &&
				(
					enrichmentFilter === 'All enrichment' ||
					(enrichmentFilter === 'Enriched' && Boolean(product.has_enrichment)) ||
					(enrichmentFilter === 'Needs enrichment' && !product.has_enrichment) ||
					(enrichmentFilter === 'Needs photo' && !product.image_key) ||
					(enrichmentFilter === 'Ready to go live' && !product.published &&
						Boolean(product.has_enrichment) && Boolean(product.image_key) &&
						Number(product.card_count || 0) > 0)
				) &&
				(
					!q ||
					`${product.name} ${product.manufacturer_name} ${product.sport_name} ${product.year}`
						.toLowerCase()
						.includes(q)
				)
			);
		})
	);

	function imageUrl(product) {
		if (!product.image_key) return '';
		return `/media/set/${product.slug}?v=${encodeURIComponent(product.image_key)}`;
	}

	function resetFilters() {
		sportFilter = 'All sports';
		yearFilter = 'All years';
		manufacturerFilter = 'All manufacturers';
		statusFilter = 'All';
		enrichmentFilter = 'All enrichment';
		query = '';
	}


	function readableApiError(value, fallback) {
		if (!value) return fallback;
		if (typeof value === 'string') return value;
		try {
			if (typeof value.message === 'string') return value.message;
			if (typeof value.error === 'string') return value.error;
			if (value.error && typeof value.error.message === 'string') return value.error.message;
			return JSON.stringify(value);
		} catch {
			return fallback;
		}
	}

	async function runToppsBackfill(targets, label = 'Topps backfill') {
		if (!targets.length) {
			message = 'No Topps products need this backfill.';
			return;
		}

		backfillBusy = true;
		message = '';
		backfillIssues = [];
		lastFailedProductIds = [];
		backfillProgress = {
			total: targets.length,
			processed: 0,
			harvested: 0,
			cached: 0,
			unmatched: 0,
			failed: 0
		};

		try {
			for (let offset = 0; offset < targets.length; offset += 8) {
				const batch = targets.slice(offset, offset + 8);
				const response = await fetch('/api/admin/topps-launch-backfill', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ mode: 'backfill', productIds: batch.map((product) => product.id) })
				});
				const result = await response.json();
				if (!response.ok) throw new Error(readableApiError(result.message || result.error || result, 'Topps metadata batch failed.'));

				for (const row of result.results || []) {
					const product = products.find((item) => Number(item.id) === Number(row.productId));
					if (row.status === 'harvested') {
						backfillProgress.harvested += 1;
						if (product) product.has_topps_backfill = 1;
					} else if (row.status === 'cached') {
						backfillProgress.cached += 1;
						if (product) product.has_topps_backfill = 1;
					} else if (row.status === 'unmatched') {
						backfillProgress.unmatched += 1;
						backfillIssues.push({ productId: row.productId, product: product?.name || 'Product ' + row.productId, status: 'Unmatched', reason: row.reason || 'No safe launch match.', candidate: row.candidate || null });
					} else if (row.status === 'failed') {
						backfillProgress.failed += 1;
						lastFailedProductIds = [...lastFailedProductIds, Number(row.productId)];
						backfillIssues.push({ productId: row.productId, product: product?.name || 'Product ' + row.productId, status: 'Failed', reason: row.reason || 'Launch detail failed.', candidate: row.candidate || null });
					}
				}

				products = [...products];
				backfillIssues = [...backfillIssues];
				backfillProgress.processed += batch.length;
				backfillProgress = { ...backfillProgress };
			}

			message = label + ' complete: ' + backfillProgress.harvested + ' harvested · ' + backfillProgress.cached + ' already cached · ' + backfillProgress.unmatched + ' unmatched · ' + backfillProgress.failed + ' failed.';
		} catch (error) {
			message = error?.message || 'Topps enrichment backfill failed.';
		} finally {
			backfillBusy = false;
		}
	}

	async function backfillToppsVisible() {
		const targets = visible.filter(
			(product) => String(product.manufacturer_name || '').toLowerCase() === 'topps'
		);
		if (!targets.length) {
			message = 'All visible Topps products with available backfill are already cached.';
			return;
		}
		if (!confirm('Backfill Topps enrichment metadata for ' + targets.length + ' visible product' + (targets.length === 1 ? '' : 's') + '?\\n\\nThis harvests and caches metadata only. It does not overwrite product details.')) return;
		await runToppsBackfill(targets, 'Topps backfill');
	}

	async function retryFailedTopps() {
		const failedIds = new Set(lastFailedProductIds.map(Number));
		const targets = products.filter((product) => failedIds.has(Number(product.id)));
		if (!targets.length) {
			message = 'There are no failed Topps backfill products to retry.';
			return;
		}
		await runToppsBackfill(targets, 'Topps failed retry');
	}

	async function toggleVisibility(product) {
		const nextPublished = product.published ? 0 : 1;
		toggling = product.id;
		message = '';

		try {
			const body = new FormData();
			body.set('product_id', String(product.id));
			body.set('published', String(nextPublished));

			const response = await fetch('?/visibility', {
				method: 'POST',
				body
			});

			if (!response.ok) {
				throw new Error('Could not update set visibility.');
			}

			product.published = nextPublished;
			products = [...products];
		} catch (error) {
			message = error?.message || 'Could not update set visibility.';
		} finally {
			toggling = null;
		}
	}

	async function deleteImport(product) {
		const label = `${product.year} ${product.name}`;

		if (!confirm(
			`DELETE ENTIRE IMPORT?\n\n${label}\n\n` +
			`This permanently removes the product, all ${Number(product.card_count || 0).toLocaleString()} cards, ` +
			`${Number(product.checklist_count || 0).toLocaleString()} checklists, source record, metadata, and uploaded artwork.\n\n` +
			`This cannot be undone.`
		)) return;

		deleting = product.id;
		message = '';

		try {
			const response = await fetch(`/api/admin/products/${product.id}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Could not delete import.');
			}

			products = products.filter((item) => item.id !== product.id);
		} catch (error) {
			message = error?.message || 'Could not delete import.';
		} finally {
			deleting = null;
		}
	}
</script>

<svelte:head><title>Manage sets — setbound</title></svelte:head>

<section class="shell page">
	<div class="top">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Manage sets</h1>
			<p>Review drafts, manage artwork, and control which sets are public.</p>
		</div>
		<a href="/admin">← Admin</a>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}
	{#if message}<div class="error">{message}</div>{/if}

	<div class="filters">
		<label class="search">
			<span>Find product</span>
			<input class="input" bind:value={query} placeholder="Chrome, Artifacts, Bowman…" />
		</label>

		<label>
			<span>Sport</span>
			<select class="input" bind:value={sportFilter}>
				{#each sports as sport}<option>{sport}</option>{/each}
			</select>
		</label>

		<label>
			<span>Year</span>
			<select class="input" bind:value={yearFilter}>
				{#each years as year}<option>{year}</option>{/each}
			</select>
		</label>

		<label>
			<span>Manufacturer</span>
			<select class="input" bind:value={manufacturerFilter}>
				{#each manufacturers as manufacturer}<option>{manufacturer}</option>{/each}
			</select>
		</label>

		<label>
			<span>Status</span>
			<select class="input" bind:value={statusFilter}>
				<option>All</option>
				<option>Live</option>
				<option>Draft</option>
			</select>
		</label>

		<label>
			<span>Enrichment</span>
			<select class="input" bind:value={enrichmentFilter}>
				<option>All enrichment</option>
				<option>Enriched</option>
				<option>Needs enrichment</option>
				<option>Needs photo</option>
				<option>Ready to go live</option>
			</select>
		</label>

		<button class="reset" onclick={resetFilters}>Clear</button>
	</div>

	<div class="filter-summary backfill-summary"><div><strong>{visible.length.toLocaleString()}</strong> <span>of {products.length.toLocaleString()} sets</span></div><span class="topps-ready-summary">Filter, select and manage your imported checklists.</span></div>


	<div class="bulk-workspace">
		<details class="batch-panel">
			<summary><span><strong>Publish drafts</strong><small>{selectedDraftIds.length} selected</small></span><span class="batch-chevron">⌄</span></summary>
			<div class="batch-content">
<div class="offline-tools-actions">
			<button type="button" onclick={()=>selectedPublishIds=[...new Set([...selectedPublishIds,...visibleDraftIds])]} disabled={publishing||!visibleDraftIds.length}>Select visible drafts ({visibleDraftIds.length})</button>
			<button type="button" onclick={()=>selectedPublishIds=products.filter(p=>!p.published).map(p=>Number(p.id))} disabled={publishing}>Select all drafts</button>
			<button type="button" onclick={()=>selectedPublishIds=[]} disabled={publishing||!selectedPublishIds.length}>Clear</button>
			<button type="button" onclick={publishSelected} disabled={publishing||!selectedDraftIds.length}>{publishing?'Publishing…':'Go live ('+selectedDraftIds.length+')'}</button>
		</div>
		<p>Uses separate checkboxes from bulk delete and bulk offline. Only selected drafts are published.</p></div>
		</details>
		<details class="batch-panel">
			<summary><span><strong>Take sets offline</strong><small>{selectedLiveIds.length} selected · {liveSetIds.length} live</small></span><span class="batch-chevron">⌄</span></summary>
			<div class="batch-content">
<div class="offline-tools-actions">
			<button type="button" onclick={selectVisibleLive} disabled={bulkOfflineBusy || !visibleLiveIds.length}>Select visible live ({visibleLiveIds.length})</button>
			<button type="button" onclick={selectAllLive} disabled={bulkOfflineBusy || !liveSetIds.length}>Select all live ({liveSetIds.length})</button>
			<button type="button" onclick={() => selectedOfflineIds = []} disabled={bulkOfflineBusy || !selectedLiveIds.length}>Clear selection</button>
			<button class="offline-danger" type="button" onclick={takeSelectedOffline} disabled={bulkOfflineBusy || !selectedLiveIds.length}>{bulkOfflineBusy ? 'Taking offline…' : `Take ${selectedLiveIds.length} offline`}</button>
		</div>
		<p>Select visible respects the search and filters. Select all live includes sets hidden by filters. Only explicitly selected LIVE sets are changed.</p></div>
		</details>
		<details class="batch-panel">
			<summary><span><strong>Bulk parent metadata</strong><small>{metadataSelectedIds.length} selected · {readyMetadata.length} ready</small></span><span class="batch-chevron">⌄</span></summary>
			<div class="batch-content">
<div class="offline-tools-actions">
			<button type="button" onclick={()=>metadataSelectedIds=[...new Set([...metadataSelectedIds,...visibleMetadataIds])]} disabled={metadataBusy||metadataApplying}>Select visible ({visibleMetadataIds.length})</button>
			<button type="button" onclick={()=>metadataSelectedIds=products.map(p=>Number(p.id))} disabled={metadataBusy||metadataApplying}>Select all sets</button>
			<button type="button" onclick={()=>metadataSelectedIds=[]} disabled={metadataBusy||metadataApplying}>Clear</button>
			<button type="button" onclick={metadataPreview} disabled={metadataBusy||metadataApplying||!metadataSelectedIds.length}>{metadataBusy?'Checking…':'Preview parent metadata ('+metadataSelectedIds.length+')'}</button>
			{#if metadataBusy||metadataApplying}<button type="button" onclick={()=>metadataStop=true} disabled={metadataStop}>Stop after current set</button>{/if}
		</div>
		<p>Review release dates, descriptions, box details and product images in a full-size window. Nothing saves without approval.</p>
		{#if metadataResults.length}<button type="button" onclick={()=>metadataModalOpen=true}>Open metadata review ({metadataResults.length})</button>{/if}
		</div>
		</details>
		<details class="batch-panel danger-panel">
			<summary><span><strong>Delete imports</strong><small>{selectedDeleteProducts.length} selected</small></span><span class="batch-chevron">⌄</span></summary>
			<div class="batch-content">
<div class="bulk-delete-actions">
			<button type="button" onclick={selectVisibleForDelete} disabled={bulkDeleteBusy || !visible.length}>Select visible ({visible.length})</button>
			<button type="button" onclick={() => selectedDeleteIds = []} disabled={bulkDeleteBusy || !selectedDeleteIds.length}>Clear selection</button>
			<button type="button" class="delete-selected" onclick={deleteSelectedImports} disabled={bulkDeleteBusy || deleting !== null || !selectedDeleteProducts.length}>{bulkDeleteBusy ? 'Deleting…' : 'Delete selected (' + selectedDeleteProducts.length + ')'}</button>
		</div>
		<p>Only checked imports will be deleted. Selection is separate from bulk visibility. Deletion is permanent and requires typed confirmation.</p>
		{#if bulkDeleteProgress}<p role="status">{bulkDeleteProgress}</p>{/if}</div>
		</details>
	</div>
	<p class="selection-hint">Row checkboxes: publish · metadata · delete · offline. Open a bulk tool above to select visible sets or act on your selection.</p>

	<div class="list">
		{#each visible as product (product.id)}
			<article class="row">
				<div class="bulk-choice" title="Select for bulk publication"><input type="checkbox" aria-label={'Select '+product.name+' for bulk go live'} checked={selectedPublishIds.includes(Number(product.id))} disabled={!!product.published||publishing} onchange={e=>selectedPublishIds=updateSet(selectedPublishIds,Number(product.id),e.currentTarget.checked)} /></div>
				<div class="bulk-choice" title="Select for bulk metadata"><input type="checkbox" aria-label={'Select '+product.name+' for bulk metadata'} checked={metadataSelectedIds.includes(Number(product.id))} disabled={metadataBusy||metadataApplying} onchange={e=>metadataSelectedIds=updateSet(metadataSelectedIds,Number(product.id),e.currentTarget.checked)} /></div>
				<div class="bulk-choice bulk-delete-choice">
					<label title="Select for permanent deletion"><input type="checkbox" aria-label={'Select ' + product.name + ' for permanent deletion'} checked={selectedDeleteIds.includes(Number(product.id))} disabled={bulkDeleteBusy} onchange={(event) => changeDeleteSelection(Number(product.id), event.currentTarget.checked)} /></label>
				</div>
				<div class="bulk-choice">
					<input type="checkbox" aria-label={`Select ${product.name} for bulk offline`} checked={selectedLiveIds.includes(Number(product.id))} disabled={!product.published || bulkOfflineBusy} onchange={(event) => changeOfflineSelection(Number(product.id), event.currentTarget.checked)} />
				</div>
				<div class="preview">
					{#if product.image_key}
						<img src={imageUrl(product)} alt="" />
					{:else}
						<span>{product.year}</span>
					{/if}
				</div>

				<div class="info">
					<div class="meta">{product.sport_name} · {product.manufacturer_name} · {product.year}</div>
					<div class="title-line">
						<strong>{product.name}</strong>
						{#if product.published}
							<span class="status live">Live</span>
						{:else}
							<span class="status draft">Draft</span>
						{/if}
						{#if product.has_topps_backfill}
							<span class="status topps-ready" title="Cached first-party Topps launch metadata is ready for enrichment">Topps ready</span>
						{/if}
						{#if product.has_product_details}
							<span class="status enriched">Enriched ✓</span>
						{/if}
					</div>

					<div class="details">
						<span>{product.release_date ? `Release: ${product.release_date}` : 'No release date yet'}</span>
						<span>{Number(product.card_count || 0).toLocaleString()} cards</span>
						<span>{Number(product.checklist_count || 0).toLocaleString()} checklists</span>
					</div>
				</div>

				<div class="actions">
					<button
						class:offline={product.published}
						class:golive={!product.published}
						class="visibility"
						disabled={toggling === product.id}
						onclick={() => toggleVisibility(product)}
					>
						{toggling === product.id
							? 'Saving…'
							: product.published
								? 'Take offline'
								: 'Go live'}
					</button>

					<button class="edit" type="button" onclick={() => cleanupProduct = product}>Clean checklist data</button>
          <button class="edit" type="button" onclick={() => {replacementProduct=product;replacementPreview=null;replacementCards=[];replacementError='';replacementFileName='';}}>Replace checklist</button>
					<button class="edit" type="button" onclick={() => {parallelSelectedIds=[Number(product.id)];scanParallels();}}>Parallels</button>
                    <button class="edit" type="button" onclick={() => sourceMetadataProduct = product}>Source metadata</button>
					<a class="edit" href={`/admin/sets/preview/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer">Preview ↗</a>
					<a class="edit" href={`/admin/product/${product.id}`}>Edit details</a>

					<form method="POST" action="?/upload" enctype="multipart/form-data">
						<input type="hidden" name="product_id" value={product.id} />
						<label class="upload">
							<input
								type="file"
								name="image"
								accept="image/jpeg,image/png,image/webp,image/avif"
								required
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							/>
							{product.image_key ? 'Replace image' : 'Add image'}
						</label>
					</form>

					{#if product.image_key}
						<form method="POST" action="?/clear">
							<input type="hidden" name="product_id" value={product.id} />
							<button class="clear">Remove image</button>
						</form>
					{/if}

					<button
						class="delete"
						disabled={deleting === product.id}
						onclick={() => deleteImport(product)}
					>
						{deleting === product.id ? 'Deleting…' : 'Delete import'}
					</button>
				</div>
			</article>
		{/each}

		{#if visible.length === 0}
			<div class="empty">No sets match those filters.</div>
		{/if}
	</div>
</section>


{#if replacementProduct}
<div class="setbound-replace-scrim" role="presentation" onclick={e=>{if(e.target===e.currentTarget)closeReplacement()}}>
  <div class="setbound-replace-dialog" role="dialog" aria-modal="true" aria-label="Replace checklist" tabindex="-1">
    <div class="setbound-replace-head"><div><div class="eyebrow">Replace checklist</div><h2>{replacementProduct.year} {replacementProduct.name}</h2><p>Only checklist sections and card rows change. Artwork, product details and URL stay.</p></div><button type="button" onclick={closeReplacement} disabled={replacementBusy}>×</button></div>
    <label>Replacement file <input type="file" accept=".csv,.xls,.xlsx" disabled={replacementBusy} onchange={chooseReplacement}/></label>
    {#if replacementBusy}<p>Checking replacement…</p>{/if}
    {#if replacementError}<p class="setbound-replace-error" role="alert">{replacementError}</p>{/if}
    {#if replacementPreview}
      {@const r = replacementPreview.report}
      <div class="setbound-replace-stats"><span><b>{r.existingCards}</b> existing cards</span><span><b>{r.replacementCards}</b> replacement cards</span><span><b>{r.matchedCards}</b> safely matched</span><span><b>{r.removedCards}</b> removed</span><span><b>{r.addedCards}</b> added</span><span><b>{r.existingSections} → {r.replacementSections}</b> sections</span></div>
      {#if r.unmatchedTrackedCards}<p class="setbound-replace-error">{r.unmatchedTrackedCards} owned/wanted card records cannot be safely matched. This replacement is blocked.</p>{/if}
      {#if r.blockedOddsSections.length}<p class="setbound-replace-error">Removed sections have linked pack odds: {r.blockedOddsSections.join(', ')}. Replacement blocked to protect odds data.</p>{/if}
      {#if replacementPreview.canApply}<button type="button" class="setbound-replace-confirm" disabled={replacementBusy} onclick={applyReplacement}>Confirm checklist replacement</button>{/if}
    {/if}
  </div>
</div>
{/if}
<div style="margin:1rem auto;max-width:1420px;padding:0 1.25rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
  <strong style="font-size:.8rem">Parallel metadata:</strong>
  <button type="button" onclick={()=>parallelSelectedIds=visible.filter(p=>p.published).map(p=>Number(p.id))}>Select all visible live ({visible.filter(p=>p.published).length})</button>
  <button type="button" onclick={()=>parallelSelectedIds=[]}>Clear</button>
  <button type="button" onclick={scanParallels} disabled={parallelBusy||!parallelSelectedIds.length}>Review parallels for {parallelSelectedIds.length} sets</button>
  <span style="font-size:.75rem;color:var(--muted)">Runs one product at a time; review before saving.</span>
</div>
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
{#if metadataModalOpen}
  <div class="bulk-meta-overlay" role="presentation" onclick={e=>{if(e.target===e.currentTarget&&!metadataBusy&&!metadataApplying)metadataModalOpen=false}}>
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

{#if cleanupProduct}
	<ChecklistCleanupModal product={cleanupProduct} onclose={() => cleanupProduct = null} />
{/if}
{#if sourceMetadataProduct}
	<CardsmithsMetadataModal product={sourceMetadataProduct} onclose={() => sourceMetadataProduct = null} onapplied={(result) => { products = products.map(p => Number(p.id) === Number(result.productId) ? { ...p, release_date: result.releaseDate || p.release_date } : p); message = 'Source metadata saved.'; }} />
{/if}

<style>
	.page{padding-top:3rem;padding-bottom:5rem}
	.offline-tools{display:grid;gap:.65rem;border:1px solid var(--line-strong);border-radius:.85rem;padding:1rem;margin:1rem 0 1.25rem;background:#faf9f7}
	.offline-tools-heading,.offline-tools-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.55rem}
	.offline-tools-heading span{font-size:.75rem;color:var(--muted)}
	.offline-tools-actions button{border:1px solid var(--line-strong);background:white;border-radius:.55rem;padding:.52rem .68rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.offline-tools-actions button.offline-danger{background:#8d3028;border-color:#8d3028;color:#fff}
	.offline-tools-actions button:disabled{opacity:.45;cursor:not-allowed}
	.offline-tools p{font-size:.72rem;color:var(--muted);margin:0}
	.bulk-delete-tools{display:grid;gap:.65rem;border:1px solid #e3bbb6;border-radius:.85rem;padding:1rem;margin:1rem 0 1.25rem;background:#fff9f8}
	.bulk-delete-tools>div:first-child,.bulk-delete-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.65rem}
	.bulk-delete-tools>div:first-child span{font-size:.75rem;color:var(--muted)}
	.bulk-delete-actions button{border:1px solid var(--line-strong);background:white;border-radius:.55rem;padding:.52rem .68rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.bulk-delete-actions .delete-selected{background:#8d3028;border-color:#8d3028;color:white}
	.bulk-delete-actions button:disabled{opacity:.45;cursor:not-allowed}
	.bulk-delete-tools p{font-size:.72rem;color:var(--muted);margin:0}
	.bulk-delete-choice input{accent-color:#8d3028}
	.bulk-choice{display:flex;justify-content:center;align-items:center}
	.bulk-choice input{width:18px;height:18px;accent-color:#8d3028}
	.top{display:flex;justify-content:space-between;gap:2rem;margin-bottom:2rem}
	.top h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.35rem 0 .5rem}
	.top p{margin:0;color:var(--muted)}
	.top>a{color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}
	.filters{display:grid;grid-template-columns:minmax(240px,1.35fr) repeat(5,minmax(120px,.6fr)) auto;gap:.6rem;align-items:end;padding:1rem 0 1.1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
	.filters label{display:grid;gap:.35rem}
	.filters label span{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.reset{height:44px;border:1px solid var(--line-strong);border-radius:.65rem;background:white;padding:0 .85rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.filter-summary{display:flex;gap:.35rem;align-items:baseline;padding:.8rem 0;color:var(--muted);font-size:.72rem}
	.filter-summary strong{color:var(--ink)}
	.backfill-summary{justify-content:space-between}
	.backfill{border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:.65rem;padding:.58rem .8rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.backfill:disabled{opacity:.55;cursor:not-allowed}
	.retry-failed{border:1px solid var(--line-strong);background:#fff;border-radius:.65rem;padding:.58rem .8rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.backfill-panel{display:flex;justify-content:space-between;gap:1rem;margin:0 0 .8rem;padding:.7rem .85rem;border:1px solid var(--line);border-radius:.65rem;background:#faf9f7;color:var(--muted);font-size:.7rem}
	.backfill-panel strong{color:var(--ink)}
	.list{border-top:1px solid var(--line)}
	.row{display:grid;grid-template-columns:22px 22px 130px minmax(300px,1fr) auto;align-items:center;gap:1.2rem;padding:1rem 0;border-bottom:1px solid var(--line)}
	.preview{width:130px;aspect-ratio:16/9;border:1px solid var(--line);border-radius:.65rem;background:#f4f3f1;overflow:hidden;display:grid;place-items:center}
	.preview img{width:100%;height:100%;object-fit:cover}
	.preview span{color:var(--muted);font-size:.7rem;font-weight:900}
	.info{display:grid;gap:.25rem;min-width:0}
	.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
	.title-line{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
	.title-line strong{font-size:.92rem}
	.details{display:flex;gap:.7rem;flex-wrap:wrap;color:var(--muted);font-size:.7rem}
	.status{display:inline-flex;padding:.18rem .4rem;border-radius:999px;font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
	.status.live{background:#edf7f1;color:#25734d}
	.status.draft{background:#f2f0ed;color:#766f67}
	.status.topps-ready{background:#eef6ef;color:#21613f;border:1px solid #cfe4d5}
	.status.enriched{background:#eef4ff;color:#234f8f;border:1px solid #c9d8ef}
	.topps-ready-summary{color:#25734d;font-weight:800}
	.edit.topps-enrich{background:#182a20;color:#fff;border-color:#182a20}
	.backfill-issues{margin:.7rem 0 1rem;border:1px solid var(--line);border-radius:.7rem;background:#fff}
	.backfill-issues summary{padding:.75rem .9rem;font-size:.72rem;font-weight:850;cursor:pointer}
	.issue-list{border-top:1px solid var(--line);padding:.25rem .9rem .75rem}
	.issue-row{display:grid;gap:.2rem;padding:.65rem 0;border-bottom:1px solid var(--line);font-size:.7rem}
	.issue-row:last-child{border-bottom:0}
	.issue-row small{color:var(--muted)}
	.actions{display:flex;align-items:center;justify-content:flex-end;gap:.4rem;flex-wrap:wrap;max-width:520px}
	.upload,.clear,.edit,.visibility,.delete{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer;text-decoration:none;color:inherit;white-space:nowrap}
	.visibility.golive{background:#182a20;color:#fff;border-color:#182a20}
	.visibility.offline{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.visibility:disabled,.delete:disabled{opacity:.55;cursor:not-allowed}
	.upload input{display:none}
	.clear{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.edit{color:var(--blue)}
	.delete{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.error{margin-bottom:1rem;padding:.8rem 1rem;background:#fff8f6;border:1px solid #efc4bc;border-radius:.7rem}
	.empty{text-align:center;color:var(--muted);padding:4rem 1rem}
	@media(max-width:1100px){
		.filters{grid-template-columns:repeat(3,1fr)}
		.filters .search{grid-column:span 2}
		.row{grid-template-columns:22px 22px 100px 1fr}
		.preview{width:100px}
		.actions{grid-column:1/-1;justify-content:flex-start;max-width:none}
	}
	@media(max-width:700px){
		.top{display:block}
		.top>a{display:inline-block;margin-top:1rem}
		.filters{grid-template-columns:1fr}
		.filters .search{grid-column:auto}
		.row{grid-template-columns:22px 22px 80px 1fr}
		.preview{width:80px}
	}

	/* SETBOUND_MANAGE_COMPACT_V2 */
	.bulk-workspace{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem;margin:1rem 0 .5rem}
	.batch-panel{min-width:0;border:1px solid var(--line-strong);border-radius:.7rem;background:#faf9f7}
	.batch-panel summary{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.85rem;cursor:pointer;list-style:none}
	.batch-panel summary::-webkit-details-marker{display:none}
	.batch-panel summary>span:first-child{display:grid;gap:.2rem;min-width:0}
	.batch-panel summary strong{font-size:.77rem}
	.batch-panel summary small{color:var(--muted);font-size:.65rem}
	.batch-chevron{font-size:1.1rem;color:var(--muted)}
	.batch-panel[open] .batch-chevron{transform:rotate(180deg)}
	.batch-panel[open]{grid-column:span 2}
	.batch-content{padding:.15rem .85rem .85rem;border-top:1px solid var(--line);display:grid;gap:.65rem;min-width:0}
	.batch-content p{margin:0;font-size:.7rem;color:var(--muted)}
	.batch-content .offline-tools-actions,.batch-content .bulk-delete-actions{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
	.batch-content button{border:1px solid var(--line-strong);border-radius:.5rem;padding:.48rem .65rem;background:#fff;color:var(--ink);font:inherit;font-size:.7rem;font-weight:800;cursor:pointer}
	.batch-content button:disabled{opacity:.42;cursor:not-allowed}
	.batch-content .offline-danger,.batch-content .delete-selected{color:#fff;background:#8d3028;border-color:#8d3028}
	.danger-panel{background:#fff9f8;border-color:#e3bbb6}
	.selection-hint{font-size:.68rem;color:var(--muted);margin:.4rem 0 .8rem}
	/* Explicitly allocate room for all four selection boxes, thumbnail, info and actions. */
	.list .row{display:grid;grid-template-columns:repeat(4,22px) 92px minmax(180px,1fr) minmax(275px,auto);align-items:center;gap:.65rem;padding:.85rem 0}
	.list .bulk-choice{min-width:0;align-self:center}
	.list .preview{width:92px;height:70px;aspect-ratio:auto}
	.list .preview img{display:block;max-width:100%;width:100%;height:100%;object-fit:contain}
	.list .info{min-width:0;overflow-wrap:anywhere}
	.list .title-line strong{font-size:.85rem}
	.list .actions{grid-column:7;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:.35rem;max-width:460px;min-width:0}
	.list .actions .upload,.list .actions .clear,.list .actions .edit,.list .actions .visibility,.list .actions .delete{padding:.43rem .55rem;font-size:.66rem;line-height:1.3}
	@media(max-width:1250px){
		.bulk-workspace{grid-template-columns:repeat(2,minmax(0,1fr))}
		.batch-panel[open]{grid-column:span 2}
		.list .row{grid-template-columns:repeat(4,22px) 86px minmax(0,1fr)}
		.list .preview{width:86px;height:66px}
		.list .actions{grid-column:5/-1;justify-content:flex-start;max-width:none}
	}
	@media(max-width:640px){
		.bulk-workspace{grid-template-columns:minmax(0,1fr)}
		.batch-panel[open]{grid-column:span 1}
		.list .row{grid-template-columns:repeat(4,22px) minmax(0,1fr);gap:.5rem}
		.list .preview{grid-column:1/3;grid-row:2;width:76px;height:58px}
		.list .info{grid-column:3/-1;grid-row:2}
		.list .actions{grid-column:1/-1}
	}

/* SETBOUND_BULK_METADATA_MODAL_V2 */
.bulk-meta-overlay{position:fixed;inset:0;background:#1119;z-index:1500;display:grid;place-items:center;padding:1rem}
.bulk-meta-dialog{width:min(1050px,100%);max-height:94vh;min-height:50vh;background:white;border-radius:1rem;display:flex;flex-direction:column;overflow:hidden;color:#171717}
.bulk-meta-head,.bulk-meta-toolbar,.bulk-meta-footer{display:flex;gap:.65rem;align-items:center;justify-content:space-between;padding:.85rem 1.1rem;border-bottom:1px solid #e5e5e5;flex-wrap:wrap}
.bulk-meta-head h2{font-size:1.35rem;margin:0}.bulk-meta-head p,.bulk-meta-progress{font-size:.75rem;color:#666;margin:.2rem 0 0}
.bulk-meta-head button,.bulk-meta-toolbar button,.bulk-meta-footer button{cursor:pointer;border:1px solid #ddd;background:#f6f6f6;border-radius:.5rem;padding:.52rem .75rem;font:inherit;font-size:.76rem;font-weight:800}
.bulk-meta-progress{padding:.4rem 1.1rem}.bulk-meta-results{padding:1rem;overflow:auto;flex:1;display:grid;gap:.8rem;align-content:start}
.bulk-meta-item{border:1px solid #ddd;border-radius:.7rem;padding:1rem;display:grid;gap:.55rem}
.bulk-meta-item-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}.bulk-meta-item-head label{display:flex;align-items:center;gap:.5rem}.bulk-meta-item-head span{color:#777;font-size:.7rem}
.bulk-meta-item p{font-size:.78rem;line-height:1.5;margin:0}.bulk-meta-description{color:#333}.bulk-meta-spec{white-space:pre-line}.bulk-meta-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:.6rem}
.bulk-meta-images label{display:grid;gap:.3rem;padding:.5rem;border:1px solid #ddd;border-radius:.6rem;min-height:135px;cursor:pointer;align-content:start}.bulk-meta-images label.chosen{border-color:#111;background:#fafafa}
.bulk-meta-images label img{max-width:100%;width:100%;height:125px;object-fit:contain}.bulk-meta-note{color:#666}.bulk-meta-footer{border-top:1px solid #e5e5e5;border-bottom:0}.bulk-meta-footer .bulk-meta-save{background:#191919;color:white}.bulk-meta-footer button:disabled{opacity:.4}
@media(max-width:600px){.bulk-meta-dialog{max-height:96vh}.bulk-meta-overlay{padding:.4rem}.bulk-meta-results{padding:.65rem}}

.setbound-replace-scrim{position:fixed;inset:0;background:rgba(10,22,33,.58);z-index:200;display:grid;place-items:center;padding:1rem}.setbound-replace-dialog{width:min(680px,100%);max-height:92vh;overflow:auto;background:white;border-radius:1rem;padding:1.5rem;box-shadow:0 20px 70px rgba(0,0,0,.25)}.setbound-replace-head{display:flex;justify-content:space-between;gap:1rem;margin-bottom:1.4rem}.setbound-replace-head h2{margin:.3rem 0;font-size:1.4rem}.setbound-replace-head p{font-size:.8rem;color:var(--muted)}.setbound-replace-head button{align-self:start;border:0;background:var(--soft);border-radius:.4rem;padding:.35rem .65rem;cursor:pointer}.setbound-replace-dialog label{display:grid;gap:.5rem}.setbound-replace-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin:1.2rem 0}.setbound-replace-stats span{border:1px solid var(--line);padding:.7rem;border-radius:.5rem;font-size:.76rem}.setbound-replace-stats b{display:block;font-size:1.3rem}.setbound-replace-error{color:#a12525;font-size:.8rem}.setbound-replace-confirm{background:var(--ink);color:#fff;border:0;padding:.8rem 1rem;border-radius:.5rem;font-weight:800;cursor:pointer}@media(max-width:540px){.setbound-replace-stats{grid-template-columns:repeat(2,1fr)}}
</style>
