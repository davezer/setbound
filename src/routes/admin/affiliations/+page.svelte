<script>
	let { data, form } = $props();

	let editing = $state(null);
	let creating = $state(false);
	let selected = $state([]);

	const allVisibleSelected = $derived(
		data.affiliations.length > 0 &&
		data.affiliations.every((item) => selected.includes(item.id))
	);

	function openEdit(item) {
		editing = {
			...item,
			aliasesText: item.aliases.join('\n')
		};
	}

	function toggle(id) {
		selected = selected.includes(id)
			? selected.filter((value) => value !== id)
			: [...selected, id];
	}

	function toggleAll() {
		selected = allVisibleSelected ? [] : data.affiliations.map((item) => item.id);
	}
</script>

<svelte:head><title>Affiliations — setbound admin</title></svelte:head>

<section class="shell page">
	<div class="hero">
		<div>
			<div class="eyebrow">Admin · Reference data</div>
			<h1>Teams & affiliations</h1>
			<p>Fix team names, leagues, sports, aliases, and affiliation types.</p>
		</div>

		<div class="hero-actions">
			<button onclick={() => creating = true}>Add affiliation</button>
			<a href="/admin">← Admin</a>
		</div>
	</div>

	{#if form?.message}<div class="error">{form.message}</div>{/if}

	<form class="search" method="GET">
		<input name="q" value={data.q} placeholder="Team, school, league, alias…" />
		<button>Search</button>
	</form>

	{#if selected.length}
		<form class="bulk" method="POST" action="?/bulk">
			{#each selected as id}<input type="hidden" name="affiliation_id" value={id} />{/each}

			<div class="bulk-title">
				<strong>{selected.length} selected</strong>
				<button type="button" class="link" onclick={() => selected = []}>Clear selection</button>
			</div>

			<label>
				<span>Sport</span>
				<select name="bulk_sport">
					<option value="unchanged">Leave unchanged</option>
					<option value="clear">Clear sport</option>
					{#each data.sports as sport}<option value={sport.id}>{sport.name}</option>{/each}
				</select>
			</label>

			<label>
				<span>League</span>
				<div class="league-fields">
					<select name="league_mode">
						<option value="unchanged">Leave unchanged</option>
						<option value="set">Set league</option>
						<option value="clear">Clear league</option>
					</select>
					<input name="bulk_league" placeholder="NFL, NCAA, MLB…" />
				</div>
			</label>

			<label>
				<span>Type</span>
				<select name="bulk_type">
					<option value="unchanged">Leave unchanged</option>
					<option value="team">Team</option>
					<option value="school">School</option>
					<option value="country">Country</option>
					<option value="organization">Organization</option>
					<option value="other">Other</option>
				</select>
			</label>

			<button class="apply">Apply to {selected.length}</button>
		</form>
	{/if}

	<div class="selection-row">
		<label class="select-all">
			<input type="checkbox" checked={allVisibleSelected} onchange={toggleAll} />
			<span>Select all {data.affiliations.length} shown</span>
		</label>

		{#if selected.length}
			<span>{selected.length} selected</span>
		{/if}
	</div>

	<div class="list">
		<div class="head">
			<span></span><span>Name</span><span>Sport</span><span>League</span><span>Type</span><span>Cards</span><span></span>
		</div>

		{#each data.affiliations as affiliation}
			<div class="row" class:selected={selected.includes(affiliation.id)}>
				<label class="check">
					<input
						type="checkbox"
						checked={selected.includes(affiliation.id)}
						onchange={() => toggle(affiliation.id)}
					/>
				</label>

				<div>
					<strong>{affiliation.name}</strong>
					{#if affiliation.aliases.length}<small>{affiliation.aliases.join(' · ')}</small>{/if}
				</div>

				<span>{affiliation.sport_name || '—'}</span>
				<span>{affiliation.league || '—'}</span>
				<span>{affiliation.type}</span>
				<strong>{affiliation.card_count.toLocaleString()}</strong>
				<button onclick={() => openEdit(affiliation)}>Edit</button>
			</div>
		{/each}
	</div>
</section>

{#if editing}
	<div class="backdrop" onclick={() => editing = null} role="presentation">
		<div class="modal" onclick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
			<div class="modal-head"><h2>Edit affiliation</h2><button onclick={() => editing = null}>×</button></div>

			<form method="POST" action="?/save">
				<input type="hidden" name="affiliation_id" value={editing.id} />

				<label><span>Name</span><input name="name" value={editing.name} required /></label>

				<div class="two">
					<label>
						<span>Sport</span>
						<select name="sport_id">
							<option value="">None</option>
							{#each data.sports as sport}<option value={sport.id} selected={sport.id === editing.sport_id}>{sport.name}</option>{/each}
						</select>
					</label>

					<label><span>League</span><input name="league" value={editing.league || ''} placeholder="NFL, NCAA, MLB…" /></label>
				</div>

				<label>
					<span>Type</span>
					<select name="type">
						<option value="team" selected={editing.type === 'team'}>Team</option>
						<option value="school" selected={editing.type === 'school'}>School</option>
						<option value="country" selected={editing.type === 'country'}>Country</option>
						<option value="organization" selected={editing.type === 'organization'}>Organization</option>
						<option value="other" selected={editing.type === 'other'}>Other</option>
					</select>
				</label>

				<label>
					<span>Aliases <em>one per line</em></span>
					<textarea name="aliases" rows="5">{editing.aliasesText}</textarea>
				</label>

				<div class="actions"><button type="button" class="cancel" onclick={() => editing = null}>Cancel</button><button class="save">Save</button></div>
			</form>
		</div>
	</div>
{/if}

{#if creating}
	<div class="backdrop" onclick={() => creating = false} role="presentation">
		<div class="modal" onclick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
			<div class="modal-head"><h2>Add affiliation</h2><button onclick={() => creating = false}>×</button></div>

			<form method="POST" action="?/create">
				<label><span>Name</span><input name="name" required /></label>
				<div class="two">
					<label><span>Sport</span><select name="sport_id"><option value="">None</option>{#each data.sports as sport}<option value={sport.id}>{sport.name}</option>{/each}</select></label>
					<label><span>League</span><input name="league" placeholder="NFL, NCAA, MLB…" /></label>
				</div>
				<label><span>Type</span><select name="type"><option value="team">Team</option><option value="school">School</option><option value="country">Country</option><option value="organization">Organization</option><option value="other">Other</option></select></label>
				<div class="actions"><button type="button" class="cancel" onclick={() => creating = false}>Cancel</button><button class="save">Create</button></div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page{padding-top:3.5rem;padding-bottom:6rem}.hero{display:flex;justify-content:space-between;gap:2rem}.hero h1{font-size:clamp(3rem,6vw,5rem);letter-spacing:-.06em;margin:.35rem 0}.hero p{margin:0;color:var(--muted)}.hero-actions{display:flex;gap:.5rem;align-items:flex-start}.hero-actions button,.hero-actions a{border:1px solid var(--line-strong);background:white;color:inherit;text-decoration:none;border-radius:.6rem;padding:.55rem .7rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}.search{display:flex;gap:.5rem;max-width:720px;margin:2rem 0 1rem}.search input{flex:1;border:1px solid var(--line-strong);border-radius:.65rem;padding:.7rem;font:inherit}.search button,.save,.apply{border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.7rem .85rem;font:inherit;font-weight:850;cursor:pointer}
	.bulk{position:sticky;top:5.5rem;z-index:20;display:grid;grid-template-columns:auto 180px minmax(260px,1fr) 170px auto;gap:.7rem;align-items:end;padding:.9rem;margin:1rem 0;border:1px solid var(--line-strong);border-radius:.9rem;background:rgba(252,252,252,.97);box-shadow:0 10px 35px rgba(20,18,16,.07);backdrop-filter:blur(12px)}.bulk-title{align-self:center;display:grid;gap:.15rem}.bulk-title strong{font-size:.82rem}.link{border:0;background:transparent;color:var(--blue);padding:0;text-align:left;font:inherit;font-size:.65rem;font-weight:850;cursor:pointer}.bulk label{display:grid;gap:.3rem}.bulk label>span{font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:var(--muted)}.bulk select,.bulk input{border:1px solid var(--line-strong);border-radius:.6rem;background:white;padding:.6rem;font:inherit;font-size:.72rem}.league-fields{display:grid;grid-template-columns:150px 1fr;gap:.4rem}
	.selection-row{display:flex;justify-content:space-between;align-items:center;min-height:2.6rem;color:var(--muted);font-size:.7rem}.select-all{display:flex;align-items:center;gap:.45rem;cursor:pointer}.select-all input,.check input{width:16px;height:16px}
	.list{border:1px solid var(--line);border-radius:.9rem;overflow:hidden}.head,.row{display:grid;grid-template-columns:38px 1.5fr .7fr .7fr .7fr 90px 70px;gap:1rem;align-items:center}.head{background:#fafafa;padding:.65rem .9rem;border-bottom:1px solid var(--line);font-size:.59rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900}.row{padding:.78rem .9rem;border-bottom:1px solid var(--line);font-size:.76rem}.row.selected{background:#faf8f4}.row small{display:block;color:var(--muted);margin-top:.15rem}.row button{border:1px solid var(--line-strong);background:white;border-radius:.5rem;padding:.4rem .5rem;font:inherit;font-size:.67rem;font-weight:850;cursor:pointer}.check{display:grid;place-items:center}.error{margin-top:1rem;padding:.7rem;border:1px solid #efc2bb;background:#fff8f7;color:#8d3028;border-radius:.65rem}
	.backdrop{position:fixed;inset:0;z-index:100;background:rgba(20,18,16,.45);display:grid;place-items:center;padding:1rem}.modal{width:min(620px,100%);background:white;border-radius:1rem;padding:1.2rem}.modal-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:1rem;border-bottom:1px solid var(--line)}.modal-head h2{margin:0}.modal-head button{width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:white;cursor:pointer}.modal form{display:grid;gap:.85rem;padding-top:1rem}.modal label{display:grid;gap:.3rem}.modal label>span{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.modal em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:500}.modal input,.modal select,.modal textarea{border:1px solid var(--line-strong);border-radius:.65rem;padding:.65rem .7rem;font:inherit}.two{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.actions{display:flex;justify-content:flex-end;gap:.5rem;padding-top:.5rem}.cancel{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.65rem .8rem;font:inherit;font-weight:850;cursor:pointer}
	@media(max-width:1150px){.bulk{grid-template-columns:1fr 1fr}.bulk-title,.apply{grid-column:1/-1}.league-fields{grid-template-columns:1fr 1fr}.head{display:none}.row{grid-template-columns:34px 1fr 1fr 70px}.row>:nth-child(4),.row>:nth-child(5),.row>:nth-child(6){grid-column:3}}@media(max-width:620px){.hero{flex-direction:column}.bulk{grid-template-columns:1fr}.bulk>*{grid-column:1!important}.league-fields,.two{grid-template-columns:1fr}.row{grid-template-columns:30px 1fr 60px}.row>:not(:first-child):not(:nth-child(2)):not(:last-child){grid-column:2}}
</style>
