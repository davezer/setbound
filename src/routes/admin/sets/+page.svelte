<script>
	let { data, form } = $props();

	function imageUrl(product) {
		if (!product.image_key) return '';
		return `/media/set/${product.slug}?v=${encodeURIComponent(product.image_key)}`;
	}
</script>

<svelte:head><title>Manage sets — setbound</title></svelte:head>

<section class="shell page">
	<div class="top">
		<div><div class="eyebrow">Admin</div><h1>Manage sets</h1><p>Artwork and collector-facing set details.</p></div>
		<a href="/admin">← Admin</a>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<div class="list">
		{#each data.products as product}
			<article class="row">
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
					</div>
					<span>{product.release_date ? `Release: ${product.release_date}` : 'No release date yet'}</span>
				</div>

				<div class="actions">
					<form method="POST" action="?/visibility">
						<input type="hidden" name="product_id" value={product.id} />
						<input type="hidden" name="published" value={product.published ? '0' : '1'} />
						<button class:offline={product.published} class:golive={!product.published} class="visibility">
							{product.published ? 'Take offline' : 'Go live'}
						</button>
					</form>

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
							<button class="clear">Remove</button>
						</form>
					{/if}
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
.page{padding-top:3rem;padding-bottom:5rem}.top{display:flex;justify-content:space-between;gap:2rem;margin-bottom:2rem}.top h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.35rem 0 .5rem}.top p{margin:0;color:var(--muted)}.top>a{color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}.list{border-top:1px solid var(--line)}.row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;gap:1.2rem;padding:1rem 0;border-bottom:1px solid var(--line)}.preview{width:130px;aspect-ratio:16/9;border:1px solid var(--line);border-radius:.65rem;background:#f4f3f1;overflow:hidden;display:grid;place-items:center}.preview img{width:100%;height:100%;object-fit:cover}.preview span{color:var(--muted);font-size:.7rem;font-weight:900}.info{display:grid;gap:.25rem}.info>span{color:var(--muted);font-size:.7rem}.meta{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.title-line{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.status{display:inline-flex;padding:.18rem .4rem;border-radius:999px;font-size:.55rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.status.live{background:#edf7f1;color:#25734d}.status.draft{background:#f2f0ed;color:#766f67}.actions{display:flex;align-items:center;gap:.45rem}.upload,.clear,.edit,.visibility{display:inline-flex;border:1px solid var(--line-strong);background:#fff;border-radius:.6rem;padding:.52rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer;text-decoration:none;color:inherit}.visibility.golive{background:#182a20;color:#fff;border-color:#182a20}.visibility.offline{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}.upload input{display:none}.clear{color:#8d3028;border-color:#e3bbb6;background:#fff9f8}.edit{color:var(--blue)}.error{margin-bottom:1rem;padding:.8rem 1rem;background:#fff8f6;border:1px solid #efc4bc;border-radius:.7rem}@media(max-width:760px){.row{grid-template-columns:90px 1fr}.preview{width:90px}.actions{grid-column:1/-1;flex-wrap:wrap}}
</style>
