<script>
	let { data } = $props();

	function joinedDate(value) {
		if (!value) return '—';
		return new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleDateString();
	}
</script>

<svelte:head><title>Users — Setbound admin</title></svelte:head>

<section class="shell page">
	<div class="crumb"><a href="/admin">Admin</a><span>/</span>Users</div>

	<div class="hero">
		<div>
			<div class="eyebrow">Community</div>
			<h1>Users</h1>
			<p>Registrations and collection activity across Setbound.</p>
		</div>
	</div>

	<div class="stats">
		<div><span>Registered users</span><strong>{data.stats.total.toLocaleString()}</strong></div>
		<div><span>Joined in last 7 days</span><strong>{data.stats.last7Days.toLocaleString()}</strong></div>
		<div><span>Admins</span><strong>{data.stats.admins.toLocaleString()}</strong></div>
	</div>

	<form class="search" method="GET">
		<label><span>Find a user</span><input class="input" name="q" value={data.q} placeholder="Email or display name…" /></label>
		<button type="submit">Search</button>
		{#if data.q}<a href="/admin/users">Clear</a>{/if}
	</form>

	<div class="result-count">{data.users.length.toLocaleString()} user{data.users.length === 1 ? '' : 's'} shown</div>

	<div class="table-wrap">
		<table>
			<thead><tr><th>User</th><th>Joined</th><th>Owned</th><th>Wanted</th><th>Tracked</th><th>Role</th></tr></thead>
			<tbody>
				{#each data.users as user}
					<tr>
						<td><strong>{user.display_name || 'No display name'}</strong><span>{user.email}</span></td>
						<td>{joinedDate(user.created_at)}</td>
						<td>{user.owned_count.toLocaleString()}</td>
						<td>{user.wanted_count.toLocaleString()}</td>
						<td>{user.tracked_count.toLocaleString()}</td>
						<td>{#if user.is_admin}<span class="role admin">Admin</span>{:else}<span class="role">Collector</span>{/if}</td>
					</tr>
				{/each}
				{#if !data.users.length}<tr><td colspan="6" class="empty">No users matched your search.</td></tr>{/if}
			</tbody>
		</table>
	</div>
</section>

<style>
	.page{padding-top:3rem;padding-bottom:5rem}.crumb{display:flex;gap:.45rem;color:var(--muted);font-size:.74rem}.crumb a{color:inherit}.hero{padding:1.8rem 0;border-bottom:1px solid var(--line)}h1{margin:.35rem 0 .45rem;font-size:clamp(3rem,7vw,5.4rem);line-height:.9;letter-spacing:-.06em}.hero p{margin:0;color:var(--muted)}
	.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;padding:1rem 0}.stats div{padding:1rem;border:1px solid var(--line);border-radius:.85rem;background:white}.stats span{display:block;color:var(--muted);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.stats strong{display:block;margin-top:.2rem;font-size:1.9rem;letter-spacing:-.04em}
	.search{display:flex;gap:.65rem;align-items:end;padding:1rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.search label{display:grid;gap:.3rem;min-width:min(420px,100%)}.search label>span{font-size:.59rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.search button,.search a{height:42px;display:inline-grid;place-items:center;padding:0 .85rem;border:1px solid var(--line);border-radius:.65rem;background:white;color:inherit;text-decoration:none;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}.search button{background:var(--ink);color:white;border-color:var(--ink)}
	.result-count{padding:.8rem 0;color:var(--muted);font-size:.7rem}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:.9rem;background:white}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:.8rem .9rem;border-bottom:1px solid var(--line)}th{background:#faf9f7;color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}td{font-size:.76rem}tbody tr:last-child td{border-bottom:0}td strong,td span{display:block}td>span:not(.role){margin-top:.12rem;color:var(--muted);font-size:.67rem}.role{display:inline-block;padding:.23rem .4rem;border-radius:999px;background:#f0efed;font-size:.58rem;font-weight:900}.role.admin{background:rgba(64,121,140,.12);color:var(--blue)}.empty{text-align:center;color:var(--muted);padding:2rem}
	@media(max-width:700px){.stats{grid-template-columns:1fr}.search{align-items:stretch;flex-direction:column}.search label{min-width:0}}
</style>
