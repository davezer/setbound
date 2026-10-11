<script>
	let { data } = $props();

	const name = $derived(
		String(data.user.displayName || '').trim() ||
		String(data.user.email || '').split('@')[0] ||
		'Account'
	);
</script>

<svelte:head><title>Account — setbound</title></svelte:head>

<section class="shell page">
	<div class="eyebrow">Account</div>
	<h1>{name}</h1>

	<div class="layout">
		<div class="main">
			<section class="panel">
				<div class="label">Signed in as</div>
				<strong>{data.user.email}</strong>
			</section>

			<section class="links">
				<a href="/collection">
					<div>
						<div class="label">Collection</div>
						<strong>Your cards</strong>
						<span>View your sets, owned cards, and want list.</span>
					</div>
					<b>→</b>
				</a>

				{#if data.user.isAdmin}
					<a href="/admin" class="admin">
						<div>
							<div class="label">Admin</div>
							<strong>Admin console</strong>
							<span>Imports, cleanup, sets, subjects, odds, and product management.</span>
						</div>
						<b>→</b>
					</a>
				{/if}
			</section>
		</div>

		<aside>
			{#if data.user.isAdmin}
				<div class="admin-badge">Administrator</div>
				<p>This account has access to Setbound's admin tools.</p>
			{/if}

			<form method="POST" action="/auth/logout">
				<button>Sign out</button>
			</form>
		</aside>
	</div>
</section>

<style>
	.page{padding-top:4rem;padding-bottom:6rem}
	h1{font-family:var(--display);font-size:clamp(3.5rem,7vw,6rem);font-weight:500;letter-spacing:-.06em;line-height:.9;margin:.45rem 0 2rem}
	.layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:3rem;border-top:1px solid var(--line);padding-top:1.4rem}
	.panel{padding:1rem 0 1.5rem;border-bottom:1px solid var(--line)}
	.label{color:var(--blue);font-size:.62rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em;margin-bottom:.3rem}
	.links{display:grid}
	.links a{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.2rem 0;border-bottom:1px solid var(--line);color:inherit;text-decoration:none}
	.links strong,.links span{display:block}
	.links strong{font-size:1.1rem}
	.links span{margin-top:.2rem;color:var(--muted);font-size:.76rem}
	.links b{font-size:1.2rem}
	.links a:hover b{transform:translateX(3px)}
	.links b{transition:.15s ease}
	.admin{background:linear-gradient(90deg,transparent,rgba(64,121,140,.04))}
	aside{border-left:1px solid var(--line);padding-left:1.4rem}
	aside p{color:var(--muted);font-size:.76rem;line-height:1.5}
	.admin-badge{display:inline-flex;border-radius:999px;background:var(--ink);color:white;padding:.4rem .6rem;font-size:.64rem;font-weight:900}
	aside form{margin-top:1.5rem}
	aside button{border:1px solid var(--line-strong);background:white;border-radius:.65rem;padding:.65rem .8rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
	@media(max-width:720px){.layout{grid-template-columns:1fr}.layout aside{border-left:0;border-top:1px solid var(--line);padding:1.2rem 0 0}}
</style>
