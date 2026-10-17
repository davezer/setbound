<script>
	import { onMount } from 'svelte';
	let { product, onclose, onapplied } = $props();
	let busy = $state(true);
	let applying = $state(false);
	let error = $state('');
	let draft = $state(null);
	let releaseDate = $state('');
	let overview = $state('');
	let formats = $state([]);
	let images = $state([]);
	let selectedImage = $state('');
	let applyReleaseDate = $state(true);
	let applyOverview = $state(true);
	let applyFormats = $state(true);
	let applyImage = $state(true);

	onMount(load);

	async function load() {
		busy = true;
		error = '';
		try {
			const response = await fetch(`/api/admin/products/${product.id}/enrich-draft`);
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not build enrichment draft.');
			draft = result.enrichment;
			releaseDate = draft.releaseDate || product.release_date || '';
			overview = draft.overview || '';
			formats = (draft.formats || []).map((format) => ({ ...format }));
			images = draft.images || [];
			selectedImage = images[0]?.url || '';
			applyImage = Boolean(selectedImage);
		} catch (err) {
			error = err?.message || 'Could not build enrichment draft.';
		} finally {
			busy = false;
		}
	}

	async function apply() {
		if (!draft) return;
		applying = true;
		error = '';
		try {
			const response = await fetch('/api/admin/source-harvester/apply-enrichment', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					productSlug: product.slug,
					releaseDate,
					overview,
					formats,
					imageUrl: selectedImage,
					applyReleaseDate,
					applyOverview,
					applyFormats,
					applyImage: applyImage && Boolean(selectedImage)
				})
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Could not apply enrichment.');
			onapplied?.({ result, releaseDate, overview, formats, selectedImage });
			onclose?.();
		} catch (err) {
			error = err?.message || 'Could not apply enrichment.';
		} finally {
			applying = false;
		}
	}
</script>

<div class="backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose?.()}>
	<div class="modal" role="dialog" aria-modal="true" aria-label={`Enrich ${product.name}`}>
		<header>
			<div><div class="eyebrow">Product enrichment</div><h2>{product.name}</h2><p>Review the draft, tweak anything you want, then apply it directly to the product.</p></div>
			<button class="close" type="button" onclick={() => onclose?.()}>×</button>
		</header>
		<div class="body">
			{#if busy}
				<div class="loading">Building product details…</div>
			{:else if error && !draft}
				<div class="error">{error}</div><button class="secondary" type="button" onclick={load}>Try again</button>
			{:else if draft}
				<section><label class="check"><input type="checkbox" bind:checked={applyReleaseDate} /> Release date</label><input class="input" type="date" bind:value={releaseDate} /></section>
				<section><label class="check"><input type="checkbox" bind:checked={applyOverview} /> Setbound overview</label><textarea bind:value={overview}></textarea><small>Collector-facing copy only. Source names and box-format lists are intentionally excluded.</small></section>
				{#if formats.length}<section><label class="check"><input type="checkbox" bind:checked={applyFormats} /> Product configuration / box break</label><div class="format-grid">{#each formats as format, index}<label class="field"><span>{format.label}</span><textarea bind:value={formats[index].details}></textarea></label>{/each}</div></section>{/if}
				{#if images.length}<section><label class="check"><input type="checkbox" bind:checked={applyImage} /> Product artwork</label><div class="images">{#each images as image}<label class:selected={selectedImage === image.url}><input type="radio" name="enrichment-image" value={image.url} bind:group={selectedImage} /><img src={image.url} alt="" /></label>{/each}</div></section>{/if}
				{#if error}<div class="error">{error}</div>{/if}
			{/if}
		</div>
		<footer>{#if draft?.sourceUrl}<a href={draft.sourceUrl} target="_blank" rel="noreferrer">Open source page ↗</a>{/if}<div class="footer-actions"><button class="secondary" type="button" onclick={() => onclose?.()}>Cancel</button><button class="primary" type="button" onclick={apply} disabled={!draft || applying}>{applying ? 'Applying…' : 'Apply enrichment'}</button></div></footer>
	</div>
</div>

<style>
	.backdrop{position:fixed;inset:0;background:rgba(18,18,18,.5);z-index:1000;display:grid;place-items:center;padding:2rem}.modal{width:min(1040px,96vw);max-height:92vh;background:#fff;border-radius:1rem;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;box-shadow:0 24px 80px rgba(0,0,0,.25)}header{display:flex;justify-content:space-between;gap:2rem;padding:1.2rem 1.35rem;border-bottom:1px solid var(--line)}header h2{font-family:var(--serif);font-size:2rem;font-weight:500;margin:.25rem 0}header p{margin:0;color:var(--muted);font-size:.76rem}.close{border:0;background:transparent;font-size:1.4rem;cursor:pointer;align-self:start}.body{overflow:auto;padding:0 1.35rem}.body section{padding:1.1rem 0;border-bottom:1px solid var(--line);display:grid;gap:.7rem}.check{display:flex;align-items:center;gap:.5rem;font-size:.72rem;font-weight:850}.check input{width:16px;height:16px}textarea{min-height:120px;border:1px solid var(--line-strong);border-radius:.7rem;padding:.8rem;font:inherit;line-height:1.5;resize:vertical}small{color:var(--muted)}.format-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.field{display:grid;gap:.35rem}.field span{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.field textarea{min-height:110px}.images{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem}.images label{border:1px solid var(--line);border-radius:.7rem;overflow:hidden;cursor:pointer;position:relative;background:#fafafa}.images label.selected{outline:2px solid var(--blue)}.images input{position:absolute;top:.5rem;left:.5rem}.images img{display:block;width:100%;height:150px;object-fit:contain}.loading{padding:4rem;text-align:center;color:var(--muted)}.error{padding:.75rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.6rem;color:#8d3028}footer{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.35rem;border-top:1px solid var(--line);background:#fff}footer>a{color:var(--blue);font-size:.72rem;font-weight:850;text-decoration:none}.footer-actions{display:flex;gap:.5rem}.primary,.secondary{border:1px solid var(--line-strong);border-radius:.6rem;padding:.65rem .8rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.primary{background:var(--ink);border-color:var(--ink);color:#fff}.secondary{background:#fff}.primary:disabled{opacity:.5;cursor:not-allowed}@media(max-width:760px){.backdrop{padding:.5rem}.modal{max-height:97vh}.format-grid{grid-template-columns:1fr}.images{grid-template-columns:repeat(2,1fr)}footer{align-items:flex-start;flex-direction:column}.footer-actions{width:100%;justify-content:flex-end}}
</style>
