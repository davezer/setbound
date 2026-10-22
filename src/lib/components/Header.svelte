<script>
	import Logo from './Logo.svelte';
	import { page } from '$app/state';

	const user = $derived(page.data.accountUser);

	const accountLabel = $derived.by(() => {
		if (!user) return '';

		const displayName = String(user.displayName || '').trim();
		if (displayName) return displayName;

		const email = String(user.email || '').trim();
		if (email) return email.split('@')[0];

		return 'Account';
	});
</script>

<header class="site-header">
	<div class="shell header-row">
		<Logo compact />

		<nav aria-label="Primary navigation">
			<a href="/sets">Sets</a>
			<a href="/search">Search</a>
			<a href="/mixer">Mixer</a>

			{#if user}
				<a href="/collection">Collection</a>
				<a class="account" href="/account">
					{accountLabel}
					<span>↗</span>
				</a>
			{:else}
				<a class="signin" href="/auth/login">Sign in</a>
			{/if}
		</nav>
	</div>
</header>

<style>
	.site-header{position:sticky;top:0;z-index:30;border-bottom:1px solid var(--line);background:rgba(255,255,255,.96);backdrop-filter:blur(18px)}
	.header-row{min-height:5.1rem;display:flex;align-items:center;justify-content:space-between;gap:2rem}
	nav{display:flex;align-items:center;gap:.25rem}
	nav a,.account{color:var(--ink);text-decoration:none;font:inherit;font-size:.86rem;font-weight:750;padding:.62rem .72rem;border-radius:.65rem;transition:background .15s ease,color .15s ease}
	nav a:hover,.account:hover{color:var(--ink);background:var(--soft)}
	.account{display:flex;align-items:center;gap:.35rem}
	.account span{color:var(--blue)}
	.signin{border:1px solid var(--line-strong)}
	@media(max-width:650px){.header-row{min-height:4.5rem;gap:.8rem}nav{gap:0}nav a,.account{padding:.5rem .45rem;font-size:.76rem}}
</style>
