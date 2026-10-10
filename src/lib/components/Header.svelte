<script>
	import Logo from './Logo.svelte';
	import { page } from '$app/state';
	const user = $derived(page.data.user);
</script>

<header class="site-header">
	<div class="shell header-row">
		<Logo compact />
		<nav aria-label="Primary navigation">
			<a href="/sets">Sets</a>
			<a href="/search">Search</a>
			{#if user}
				<a href="/collection">Collection</a>
				<form method="POST" action="/auth/logout">
					<button type="submit" class="account">{user.displayName || user.email.split('@')[0]} <span>↗</span></button>
				</form>
			{:else}
				<a class="signin" href="/auth/login">Sign in</a>
			{/if}
		</nav>
	</div>
</header>

<style>
.site-header{position:sticky;top:0;z-index:30;border-bottom:1px solid var(--line);background:rgba(252,252,252,.94);backdrop-filter:blur(18px)}
.header-row{min-height:5.1rem;display:flex;align-items:center;justify-content:space-between;gap:2rem}
nav{display:flex;align-items:center;gap:.25rem}
nav a,.account{color:#4d494b;text-decoration:none;font:inherit;font-size:.86rem;font-weight:750;padding:.62rem .72rem;border-radius:.65rem;transition:background .15s ease,color .15s ease}
nav a:hover,.account:hover{color:var(--ink);background:#f1f0f0}
nav form{margin:0}.account{border:0;background:transparent;cursor:pointer}.account span{color:var(--blue)}.signin{border:1px solid var(--line-strong)}
@media(max-width:650px){.header-row{min-height:4.5rem;gap:.8rem}nav{gap:0}nav a,.account{padding:.5rem .45rem;font-size:.76rem}}
</style>
