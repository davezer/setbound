<script>
	let { data, form } = $props();
</script>
<svelte:head><title>Edit {data.product.name} — setbound admin</title></svelte:head>
<section class="shell page">
	<div class="crumb"><a href="/admin">Admin</a><span>/</span><a href="/admin/sets">Sets</a></div>
	<div class="eyebrow">{data.product.sport_name} · {data.product.manufacturer_name} · {data.product.year}</div>
	<h1>{data.product.name}</h1>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<form method="POST" class="editor">
		<label>Release date<input class="input" name="release_date" type="date" value={data.product.release_date || ''} /></label>
		<label>Product notes<textarea name="product_notes" placeholder="Optional short note collectors should see…">{data.product.product_notes || ''}</textarea></label>
		<button>Save metadata</button>
	</form>
</section>
<style>
.page{padding-top:3rem;padding-bottom:6rem}.crumb{display:flex;gap:.45rem;color:var(--muted);font-size:.76rem;margin-bottom:2rem}.crumb a{color:inherit}h1{font-size:clamp(2.5rem,5vw,4.5rem);letter-spacing:-.055em;margin:.4rem 0 2rem}.editor{max-width:760px;display:grid;gap:1.2rem}.editor label{display:grid;gap:.4rem;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}textarea{min-height:140px;border:1px solid var(--line-strong);border-radius:.7rem;padding:.8rem;font:inherit;resize:vertical}.editor button{justify-self:start;border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.7rem .9rem;font:inherit;font-weight:850;cursor:pointer}.error{margin-bottom:1rem;padding:.8rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem}
</style>
