<script>
	let { data, form } = $props();
</script>

<svelte:head><title>Edit {data.product.name} — setbound admin</title></svelte:head>

<section class="shell page">
	<div class="crumb">
		<a href="/admin">Admin</a><span>/</span><a href="/admin/sets">Sets</a>
	</div>

	<div class="eyebrow">{data.product.sport_name} · {data.product.manufacturer_name} · {data.product.year}</div>
	<h1>{data.product.name}</h1>

	<p class="lede">
		Only fill in the sections that apply to this product. Empty sections never appear on the public set page.
	</p>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<form method="POST" class="editor">
		<section class="section">
			<div class="section-title">
				<div class="eyebrow">Basics</div>
				<h2>Product info</h2>
			</div>

			<label>
				Release date
				<input class="input" name="release_date" type="date" value={data.product.release_date || ''} />
			</label>

			<label>
				Overview
				<textarea
					name="product_notes"
					placeholder="Short description of the set. Keep this to a sentence or two."
				>{data.product.product_notes || ''}</textarea>
			</label>
		</section>

		<section class="section">
			<div class="section-title">
				<div class="eyebrow">Configurations</div>
				<h2>Box & pack breakdowns</h2>
				<p>These render as the clean fact sections under the product hero.</p>
			</div>

			<div class="format-grid">
				{#each data.formats as format}
					<label class="format-field">
						<span>{format.label}</span>
						<textarea
							name={`format_${format.key}`}
							placeholder={`Optional — add ${format.label.toLowerCase()} details…`}
						>{format.details}</textarea>
					</label>
				{/each}
			</div>
		</section>

		<div class="save-row">
			<button>Save metadata</button>
			<a href={`/sets/${data.product.slug}`} target="_blank" rel="noreferrer">View set ↗</a>
		</div>
	</form>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}
	.crumb{display:flex;gap:.45rem;color:var(--muted);font-size:.76rem;margin-bottom:2rem}
	.crumb a{color:inherit}
	h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.4rem 0 .65rem}
	.lede{max-width:720px;margin:0 0 2rem;color:var(--muted);line-height:1.55}
	.editor{max-width:1100px;display:grid;gap:2.5rem}
	.section{display:grid;gap:1.1rem;padding-top:1.2rem;border-top:1px solid var(--line)}
	.section-title h2{margin:.25rem 0 0;font-size:1.35rem}
	.section-title p{margin:.35rem 0 0;color:var(--muted);font-size:.78rem}
	label{display:grid;gap:.4rem;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
	textarea{min-height:110px;border:1px solid var(--line-strong);border-radius:.7rem;padding:.8rem;font:inherit;resize:vertical;text-transform:none;letter-spacing:0;font-weight:500;line-height:1.5}
	.format-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
	.format-field textarea{min-height:130px}
	.save-row{display:flex;align-items:center;gap:1rem}
	.save-row button{border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.75rem 1rem;font:inherit;font-weight:850;cursor:pointer}
	.save-row a{color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}
	.error{margin-bottom:1rem;padding:.8rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem}
	@media(max-width:760px){.format-grid{grid-template-columns:1fr}}
</style>
