<script>
	let { data, form } = $props();

	let openRename = $state(null);
	let openMerge = $state(null);
</script>

<svelte:head><title>Subject cleanup — setbound admin</title></svelte:head>

<section class="shell page">
	<div class="topline">
		<div>
			<div class="eyebrow">Admin</div>
			<h1>Subject cleanup</h1>
			<p>Fix parser-created names without touching the actual checklist rows by hand.</p>
		</div>

		<a href="/admin">← Admin</a>
	</div>

	<form method="GET" class="search-form">
		<label>
			<span>Find subject</span>
			<input
				class="input"
				name="q"
				value={data.q}
				placeholder="Ohtani, Yankees/, Japan…"
			/>
		</label>

		<button>Search</button>

		{#if data.q}
			<a href="/admin/subjects">Clear</a>
		{/if}
	</form>

	{#if form?.message}
		<div class="error">{form.message}</div>
	{/if}

	<div class="helper">
		<strong>Rename</strong> fixes one subject in place.
		<strong>Merge</strong> moves every card from a bad subject into an existing good subject and then deletes the bad one.
	</div>

	<div class="subject-list">
		{#each data.subjects as subject}
			<article class="subject-row">
				<div class="subject-main">
					<div class="name-line">
						<strong>{subject.name}</strong>
						<span>#{subject.id}</span>
					</div>

					<div class="counts">
						<span>{subject.card_count.toLocaleString()} cards</span>
						<span>{subject.set_count.toLocaleString()} sets</span>
						<span>{subject.subject_type}</span>
					</div>

					{#if subject.affiliations.length}
						<div class="context">
							<span class="context-label">Affiliations</span>
							{subject.affiliations.join(' · ')}
						</div>
					{/if}

					{#if subject.products.length}
						<div class="context">
							<span class="context-label">Seen in</span>
							{subject.products.join(' · ')}
						</div>
					{/if}
				</div>

				<div class="actions">
					<button
						class="secondary"
						onclick={() => {
							openMerge = null;
							openRename = openRename === subject.id ? null : subject.id;
						}}
					>
						Rename
					</button>

					<button
						class="secondary"
						onclick={() => {
							openRename = null;
							openMerge = openMerge === subject.id ? null : subject.id;
						}}
					>
						Merge
					</button>
				</div>

				{#if openRename === subject.id}
					<form method="POST" action="?/rename" class="edit-panel">
						<input type="hidden" name="subject_id" value={subject.id} />

						<label>
							<span>Correct name</span>
							<input class="input" name="name" value={subject.name} required />
						</label>

						<button class="save">Save rename</button>
					</form>
				{/if}

				{#if openMerge === subject.id}
					<form
						method="POST"
						action="?/merge"
						class="edit-panel merge-panel"
						onsubmit={(event) => {
							if (!confirm(`Merge “${subject.name}” into the subject you entered?\n\nEvery card currently attached to “${subject.name}” will be moved. This cannot be automatically undone.`)) {
								event.preventDefault();
							}
						}}
					>
						<input type="hidden" name="subject_id" value={subject.id} />

						<label>
							<span>Merge into existing subject</span>
							<input
								class="input"
								name="target_name"
								placeholder="Exact existing name, e.g. Shohei Ohtani"
								required
							/>
						</label>

						<button class="merge">Merge subjects</button>
					</form>
				{/if}
			</article>
		{/each}

		{#if data.subjects.length === 0}
			<div class="empty">No subjects matched “{data.q}”.</div>
		{/if}
	</div>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:6rem}
	.topline{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem}
	.topline h1{font-size:clamp(2.7rem,5vw,4.6rem);letter-spacing:-.055em;margin:.35rem 0 .55rem}
	.topline p{margin:0;color:var(--muted)}
	.topline>a{margin-top:.45rem;color:var(--blue);font-size:.76rem;font-weight:850;text-decoration:none}
	.search-form{display:grid;grid-template-columns:1fr auto auto;gap:.6rem;align-items:end;margin:2rem 0 1rem}
	.search-form label{display:grid;gap:.35rem}
	.search-form label span{font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
	.search-form button,.search-form>a{height:44px;display:grid;place-items:center;border:1px solid var(--line-strong);border-radius:.65rem;background:white;padding:0 .85rem;font:inherit;font-size:.74rem;font-weight:850;text-decoration:none;color:inherit;cursor:pointer}
	.search-form button{background:var(--ink);color:white;border-color:var(--ink)}
	.helper{padding:.9rem 0 1.2rem;color:var(--muted);font-size:.78rem;border-bottom:1px solid var(--line)}
	.helper strong{color:var(--ink)}
	.subject-list{border-bottom:1px solid var(--line)}
	.subject-row{display:grid;grid-template-columns:1fr auto;gap:1rem;padding:1rem 0;border-top:1px solid var(--line)}
	.subject-main{min-width:0}
	.name-line{display:flex;align-items:baseline;gap:.55rem}
	.name-line strong{font-size:.92rem}
	.name-line span{color:var(--muted);font-size:.65rem}
	.counts{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:.25rem;color:var(--muted);font-size:.7rem}
	.context{margin-top:.38rem;color:var(--muted);font-size:.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.context-label{color:var(--blue);font-weight:850;margin-right:.4rem}
	.actions{display:flex;gap:.4rem}
	.secondary,.save,.merge{border:1px solid var(--line-strong);border-radius:.55rem;background:white;padding:.5rem .65rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}
	.edit-panel{grid-column:1/-1;display:grid;grid-template-columns:1fr auto;gap:.6rem;align-items:end;padding:.8rem;background:#f8f8f7;border-radius:.7rem}
	.edit-panel label{display:grid;gap:.3rem}
	.edit-panel label span{font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
	.save{background:var(--ink);color:white;border-color:var(--ink);height:44px}
	.merge{background:#fff8f7;color:#8d3028;border-color:#e4bab4;height:44px}
	.error{margin:1rem 0;padding:.8rem 1rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem;color:#8d3028}
	.empty{text-align:center;padding:4rem 1rem;color:var(--muted)}
	@media(max-width:700px){
		.topline{display:block}
		.topline>a{display:inline-block;margin-top:1rem}
		.search-form{grid-template-columns:1fr auto}
		.search-form>a{grid-column:1/-1}
		.subject-row{grid-template-columns:1fr}
		.actions{justify-content:flex-start}
		.edit-panel{grid-template-columns:1fr}
	}
</style>
