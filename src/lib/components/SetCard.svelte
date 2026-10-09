<script>
	let { set } = $props();

	const imageSrc = $derived(set.image_key ? `/media/set/${set.slug}` : null);
</script>

<a class="set-card" href={`/sets/${set.slug}`}>
	<div class="art" class:has-image={!!imageSrc}>
		{#if imageSrc}
			<img src={imageSrc} alt={`${set.year} ${set.name}`} loading="lazy" />
		{:else}
			<div class="fallback" aria-hidden="true">
				<div class="mark">
					<i></i><i></i><i></i><i></i>
				</div>
				<span>{set.sport_name}</span>
			</div>
		{/if}

		<div class="art-top">
			<span>{set.sport_name}</span>
			<span>{set.year}</span>
		</div>
	</div>

	<div class="body">
		<div class="brand">{set.manufacturer_name}</div>
		<h3>{set.name}</h3>

		<div class="meta">
			<span><strong>{Number(set.card_count || 0).toLocaleString()}</strong> cards</span>
			<span><strong>{set.checklist_count || 0}</strong> checklists</span>
		</div>

		<div class="foot">
			<span>Open checklist</span>
			<span class="arrow">→</span>
		</div>
	</div>
</a>

<style>
	.set-card {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 1.05rem;
		background: white;
		text-decoration: none;
		color: inherit;
		transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
	}

	.set-card:hover {
		transform: translateY(-3px);
		border-color: #bbb8bd;
		box-shadow: 0 16px 44px rgba(18,16,14,.08);
	}

	.art {
		position: relative;
		aspect-ratio: 16 / 8.4;
		overflow: hidden;
		background: #f2f1ef;
	}

	.art.has-image {
		background: #eceae6;
	}

	.art img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
		object-position: center;
		padding: 0;
		transition: transform .25s ease;
	}

	.set-card:hover .art img {
		transform: scale(1.025);
	}

	.art-top {
		position: absolute;
		inset: .8rem .85rem auto;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}

	.art-top span {
		background: rgba(252,252,252,.9);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(18,16,14,.08);
		border-radius: 999px;
		padding: .35rem .55rem;
		font-size: .62rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .08em;
	}

	.fallback {
		height: 100%;
		position: relative;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg,#f8f7f5 0%,#f0efec 100%);
	}

	.fallback > span {
		position: absolute;
		left: 1rem;
		bottom: .8rem;
		color: #8b878b;
		font-size: .65rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .13em;
	}

	.mark {
		display: flex;
		align-items: flex-end;
		gap: 7px;
		transform: scale(1.05);
	}

	.mark i {
		display: block;
		width: 25px;
		border-radius: 0 14px 4px 4px;
		background: #12100e;
	}

	.mark i:nth-child(1) { height: 73px; }
	.mark i:nth-child(2) { height: 62px; background: #ee964b; }
	.mark i:nth-child(3) { height: 51px; background: #40798c; }
	.mark i:nth-child(4) { height: 40px; background: #7f7b82; }

	.body {
		padding: 1.05rem 1.1rem 1rem;
	}

	.brand {
		color: var(--blue);
		font-size: .65rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .12em;
	}

	h3 {
		font-size: 1.3rem;
		line-height: 1.12;
		letter-spacing: -.03em;
		margin: .55rem 0 1.5rem;
	}

	.meta {
		display: flex;
		gap: 1.15rem;
		color: var(--muted);
		font-size: .72rem;
	}

	.meta strong {
		color: var(--ink);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 1rem;
		padding-top: .85rem;
		border-top: 1px solid var(--line);
		font-size: .72rem;
		font-weight: 850;
	}

	.arrow {
		font-size: 1rem;
		transition: transform .16s ease;
	}

	.set-card:hover .arrow {
		transform: translateX(3px);
	}
</style>
