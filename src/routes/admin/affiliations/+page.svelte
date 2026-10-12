<script>
	let { data, form } = $props();

	let editing = $state(null);
	let creating = $state(false);

	function openEdit(item) {
		editing = {
			...item,
			aliasesText: item.aliases.join('\n')
		};
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

	<div class="list">
		<div class="head"><span>Name</span><span>Sport</span><span>League</span><span>Type</span><span>Cards</span><span></span></div>

		{#each data.affiliations as affiliation}
			<div class="row">
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
	.page{padding-top:3.5rem;padding-bottom:6rem}.hero{display:flex;justify-content:space-between;gap:2rem}.hero h1{font-size:clamp(3rem,6vw,5rem);letter-spacing:-.06em;margin:.35rem 0}.hero p{margin:0;color:var(--muted)}.hero-actions{display:flex;gap:.5rem;align-items:flex-start}.hero-actions button,.hero-actions a{border:1px solid var(--line-strong);background:white;color:inherit;text-decoration:none;border-radius:.6rem;padding:.55rem .7rem;font:inherit;font-size:.7rem;font-weight:850;cursor:pointer}.search{display:flex;gap:.5rem;max-width:720px;margin:2rem 0 1rem}.search input{flex:1;border:1px solid var(--line-strong);border-radius:.65rem;padding:.7rem;font:inherit}.search button,.save{border:0;background:var(--ink);color:white;border-radius:.65rem;padding:.7rem .85rem;font:inherit;font-weight:850;cursor:pointer}
	.list{border:1px solid var(--line);border-radius:.9rem;overflow:hidden}.head,.row{display:grid;grid-template-columns:1.5fr .7fr .7fr .7fr 90px 70px;gap:1rem;align-items:center}.head{background:#fafafa;padding:.65rem .9rem;border-bottom:1px solid var(--line);font-size:.59rem;text-transform:uppercase;letter-spacing:.08em;font-weight:900}.row{padding:.78rem .9rem;border-bottom:1px solid var(--line);font-size:.76rem}.row small{display:block;color:var(--muted);margin-top:.15rem}.row button{border:1px solid var(--line-strong);background:white;border-radius:.5rem;padding:.4rem .5rem;font:inherit;font-size:.67rem;font-weight:850;cursor:pointer}.error{margin-top:1rem;padding:.7rem;border:1px solid #efc2bb;background:#fff8f7;color:#8d3028;border-radius:.65rem}
	.backdrop{position:fixed;inset:0;z-index:100;background:rgba(20,18,16,.45);display:grid;place-items:center;padding:1rem}.modal{width:min(620px,100%);background:white;border-radius:1rem;padding:1.2rem}.modal-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:1rem;border-bottom:1px solid var(--line)}.modal-head h2{margin:0}.modal-head button{width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:white;cursor:pointer}.modal form{display:grid;gap:.85rem;padding-top:1rem}.modal label{display:grid;gap:.3rem}.modal label>span{font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.modal em{font-style:normal;text-transform:none;letter-spacing:0;font-weight:500}.modal input,.modal select,.modal textarea{border:1px solid var(--line-strong);border-radius:.65rem;padding:.65rem .7rem;font:inherit}.two{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.actions{display:flex;justify-content:flex-end;gap:.5rem;padding-top:.5rem}.cancel{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.65rem .8rem;font:inherit;font-weight:850;cursor:pointer}
	@media(max-width:850px){.head{display:none}.row{grid-template-columns:1fr 1fr 70px}.row>:nth-child(2),.row>:nth-child(3),.row>:nth-child(4){font-size:.68rem}.row>:nth-child(5){grid-column:2}}@media(max-width:620px){.hero{flex-direction:column}.two{grid-template-columns:1fr}.row{grid-template-columns:1fr 60px}.row>:not(:first-child):not(:last-child){grid-column:1}}
</style>
