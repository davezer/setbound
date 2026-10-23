<script>
	import SetCard from '$lib/components/SetCard.svelte';

	let { data } = $props();

	function yearRange(category) {
		if (!category.first_year) return '';
		if (category.first_year === category.latest_year) return String(category.latest_year);
		return `${category.first_year}–${category.latest_year}`;
	}
</script>

<!-- SEO-PASS:setbound -->
<svelte:head>
	<title>Sports Card Checklists by Sport | Setbound</title>
	<meta
		name="description"
		content="Browse sports card checklists by sport, including baseball, football, basketball, wrestling and more."
	/>
	<meta name="robots" content="index,follow" />
	<link rel="canonical" href="https://setbound.app/sets" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Sports Card Checklists by Sport | Setbound" />
	<meta
		property="og:description"
		content="Choose a sport and browse complete card checklists by year and manufacturer."
	/>
	<meta property="og:url" content="https://setbound.app/sets" />
</svelte:head>

<section class="shell page">
	<header class="hero">
		<div>
			<div class="eyebrow">Set library</div>
			<h1>Browse checklists</h1>
			<p>Start with a sport, then narrow the library by year, manufacturer or set name.</p>
		</div>

		<div class="total">
			<strong>{data.categories.reduce((sum, category) => sum + category.set_count, 0).toLocaleString()}</strong>
			<span>published sets</span>
		</div>
	</header>

	<section class="category-grid">
		{#each data.categories as category}
			<a class="category" href={`/sets/sport/${category.slug}`}>
				<div class="category-art">
					{#if category.previews.length}
						<div class="art-stack" class:single={category.previews.length === 1}>
							{#each category.previews as product}
								<div class="mini-art">
									<img
										src={`/media/set/${product.slug}?v=${encodeURIComponent(product.image_key)}`}
										alt=""
										loading="lazy"
									/>
								</div>
							{/each}
						</div>
					{:else}
						<div class="category-fallback">
							<span>{category.name}</span>
						</div>
					{/if}
				</div>

				<div class="category-body">
					<div class="category-top">
						<div>
							<div class="eyebrow">{yearRange(category)}</div>
							<h2>{category.name}</h2>
						</div>
						<span class="arrow">→</span>
					</div>

					<div class="stats">
						<span><strong>{category.set_count.toLocaleString()}</strong> sets</span>
						<span><strong>{category.card_count.toLocaleString()}</strong> cards</span>
					</div>
				</div>
			</a>
		{/each}
	</section>

	{#if data.latest.length}
		<section class="latest">
			<div class="section-head">
				<div>
					<div class="eyebrow">Recently added</div>
					<h2>Latest checklists</h2>
				</div>
			</div>

			<div class="set-grid">
				{#each data.latest as set}
					<SetCard {set} />
				{/each}
			</div>
		</section>
	{/if}
</section>

<style>
	.page{padding-top:4rem;padding-bottom:6rem}
	.hero{display:flex;justify-content:space-between;align-items:end;gap:2rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
	.hero h1{font-family:var(--display);font-size:clamp(3.5rem,8vw,6.8rem);font-weight:500;letter-spacing:-.065em;line-height:.88;margin:.4rem 0 .8rem}
	.hero p{max-width:620px;margin:0;color:var(--muted);font-size:.95rem;line-height:1.55}
	.total{text-align:right;flex:0 0 auto}.total strong,.total span{display:block}.total strong{font-size:2.2rem;letter-spacing:-.04em}.total span{color:var(--muted);font-size:.7rem}
	.category-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding-top:1.4rem}
	.category{display:grid;grid-template-columns:minmax(190px,.85fr) 1.15fr;min-height:260px;overflow:hidden;border:1px solid var(--line);border-radius:1rem;background:#fff;color:inherit;text-decoration:none;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
	.category:hover{transform:translateY(-3px);border-color:var(--line-strong);box-shadow:0 16px 44px rgba(18,16,14,.07)}
	.category-art{min-width:0;background:var(--soft);overflow:hidden}
	.art-stack{height:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:#ddd}
	.art-stack.single{grid-template-columns:1fr}
	.mini-art{min-width:0;overflow:hidden}.mini-art img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}.category:hover .mini-art img{transform:scale(1.025)}
	.category-fallback{height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#faf9f6,#f0efeb)}.category-fallback span{font-family:var(--display);font-size:2rem;color:#9a9690}
	.category-body{display:flex;flex-direction:column;justify-content:space-between;padding:1.25rem}
	.category-top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.category h2{font-family:var(--display);font-weight:500;font-size:clamp(2rem,3.5vw,3.1rem);letter-spacing:-.05em;line-height:.95;margin:.35rem 0}.arrow{font-size:1.25rem;transition:transform .16s ease}.category:hover .arrow{transform:translateX(4px)}
	.stats{display:flex;gap:1.1rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.7rem}.stats strong{color:var(--ink)}
	.latest{margin-top:4.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}.section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:1rem}.section-head h2{font-family:var(--display);font-size:2.5rem;font-weight:500;letter-spacing:-.045em;margin:.35rem 0 0}
	.set-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
	@media(max-width:1050px){.category-grid{grid-template-columns:1fr}.category{grid-template-columns:minmax(210px,.7fr) 1.3fr}.set-grid{grid-template-columns:repeat(2,1fr)}}
	@media(max-width:650px){.hero{align-items:flex-start;flex-direction:column}.total{text-align:left}.category{grid-template-columns:1fr;min-height:0}.category-art{height:180px}.set-grid{grid-template-columns:1fr}}
</style>
