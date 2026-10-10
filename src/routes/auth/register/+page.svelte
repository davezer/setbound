<script>
	let { form } = $props();
</script>
<svelte:head><title>Create account — setbound</title></svelte:head>
<section class="auth-shell">
	<div class="eyebrow">Setbound account</div>
	<h1>Start your collection.</h1>
	<p>Your cards, want list, and set progress stay synced to your account.</p>
	{#if form?.message}<div class="error">{form.message}</div>{/if}
	<form method="POST" class="auth-form">
		<label>Name <span>(optional)</span><input class="input" name="display_name" autocomplete="name" value={form?.displayName || ''} /></label>
		<label>Email<input class="input" name="email" type="email" autocomplete="email" required value={form?.email || ''} /></label>
		<label>Password<input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
		<button class="submit">Create account</button>
	</form>
	<div class="switch">Already have one? <a href="/auth/login">Sign in</a></div>
</section>
<style>
.auth-shell{width:min(460px,calc(100% - 2rem));margin:5rem auto 7rem}h1{font-family:var(--display);font-size:3.8rem;line-height:.95;letter-spacing:-.055em;margin:.5rem 0 1rem}p{color:var(--muted);line-height:1.55}.auth-form{display:grid;gap:1rem;margin-top:2rem;padding-top:1.4rem;border-top:1px solid var(--line)}label{display:grid;gap:.4rem;font-size:.68rem;font-weight:900;text-transform:uppercase;letter-spacing:.09em}label span{color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0}.submit{border:0;border-radius:.7rem;background:var(--ink);color:#fff;padding:.85rem 1rem;font:inherit;font-weight:850;cursor:pointer}.switch{margin-top:1rem;color:var(--muted);font-size:.82rem}.switch a{color:var(--blue);font-weight:800}.error{padding:.8rem 1rem;border:1px solid #efc2bb;background:#fff8f7;border-radius:.7rem;color:#8d3028}
</style>
