<script>
	let { data, form } = $props();
</script>

<svelte:head><title>Set artwork — setbound</title></svelte:head>

<section class="shell page">
	<div class="top">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Set artwork</h1>
			<p>Add product or box art to make the public Sets library easier to scan.</p>
		</div>
		<a href="/sets">View sets ↗</a>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<div class="list">
		{#each data.products as product}
			<article class="row">
				<div class="preview">
					{#if product.image_key}
						<img src={`/media/set/${product.slug}`} alt="" />
					{:else}
						<div class="empty-preview"><span>{product.year}</span></div>
					{/if}
				</div>

				<div class="info">
					<div class="meta">{product.sport_name} · {product.manufacturer_name} · {product.year}</div>
					<strong>{product.name}</strong>
					<span>{product.image_key ? 'Artwork added' : 'No artwork yet'}</span>
				</div>

				<div class="actions">
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
							<button class="clear" onclick={(event) => {
								if (!confirm(`Remove artwork from ${product.year} ${product.name}?`)) event.preventDefault();
							}}>Remove</button>
						</form>
					{/if}
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:5rem}
	.top{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;margin-bottom:2rem}
	.top h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.35rem 0 .5rem}
	.top p{margin:0;color:var(--muted)}
	.top>a{font-size:.76rem;font-weight:850;color:var(--blue);text-decoration:none;margin-top:.5rem}
	.list{border-top:1px solid var(--line)}
	.row{display:grid;grid-template-columns:130px minmax(0,1fr) auto;align-items:center;gap:1.25rem;padding:1rem 0;border-bottom:1px solid var(--line)}
	.preview{width:130px;aspect-ratio:16/9;border:1px solid var(--line);border-radius:.65rem;background:#f4f3f1;overflow:hidden}
	.preview img{width:100%;height:100%;object-fit:contain;padding:.4rem;box-sizing:border-box}
	.empty-preview{height:100%;display:grid;place-items:center;color:var(--muted);font-size:.72rem;font-weight:900}
	.info{display:grid;gap:.25rem;min-width:0}
	.info strong{font-size:1rem}
	.info>span{color:var(--muted);font-size:.72rem}
	.meta{color:var(--blue);font-size:.64rem;font-weight:900;text-transform:uppercase;letter-spacing:.09em}
	.actions{display:flex;align-items:center;gap:.55rem}
	.upload,.clear{display:inline-flex;border:1px solid var(--line-strong);background:white;border-radius:.6rem;padding:.55rem .7rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	.upload:hover{border-color:var(--ink)}
	.upload input{display:none}
	.clear{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}
	.error{margin-bottom:1rem;padding:.8rem 1rem;border:1px solid #efc4bc;background:#fff8f6;border-radius:.7rem}
	@media(max-width:700px){.row{grid-template-columns:90px 1fr}.preview{width:90px}.actions{grid-column:1/-1}.top{display:block}.top>a{display:inline-block;margin-top:1rem}}
</style>
