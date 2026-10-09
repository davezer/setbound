<script>
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Admin sign in — Setbound</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<section class="admin-login shell">
	<div class="login-wrap">
		<div class="eyebrow">SETBOUND ADMIN</div>
		<h1>Sign in.</h1>
		<p>Import and manage checklist data.</p>

		{#if data.notConfigured}
			<div class="notice error">
				<strong>Admin authentication isn't configured.</strong>
				<span>Add the <code>ADMIN_PASSWORD</code> secret, then reload this page.</span>
			</div>
		{/if}

		{#if form?.error}
			<div class="notice error">{form.error}</div>
		{/if}

		<form method="POST">
			<input type="hidden" name="next" value={data.next} />

			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				autofocus
				required
				placeholder="Admin password"
			/>

			<button type="submit">Continue →</button>
		</form>

		<a class="home-link" href="/">← Back to Setbound</a>
	</div>
</section>

<style>
	.admin-login {
		min-height: calc(100vh - 5.1rem);
		display: grid;
		place-items: center;
		padding-block: 4rem;
	}

	.login-wrap {
		width: min(100%, 28rem);
	}

	.eyebrow {
		font-size: .72rem;
		font-weight: 800;
		letter-spacing: .14em;
		color: var(--blue, #40798c);
		margin-bottom: .8rem;
	}

	h1 {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(3rem, 7vw, 4.8rem);
		font-weight: 500;
		letter-spacing: -.055em;
		line-height: .95;
		margin: 0;
	}

	p {
		margin: 1rem 0 2.1rem;
		color: #666164;
	}

	form {
		display: grid;
		gap: .65rem;
	}

	label {
		font-size: .72rem;
		font-weight: 800;
		letter-spacing: .1em;
		text-transform: uppercase;
	}

	input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d8d5d6;
		border-radius: .8rem;
		background: white;
		padding: .95rem 1rem;
		font: inherit;
		outline: none;
	}

	input:focus {
		border-color: #40798c;
		box-shadow: 0 0 0 3px rgba(64, 121, 140, .11);
	}

	button {
		margin-top: .35rem;
		border: 0;
		border-radius: .8rem;
		background: #12100e;
		color: white;
		padding: .95rem 1rem;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}

	button:hover { opacity: .9; }

	.notice {
		margin-bottom: 1.2rem;
		border: 1px solid #dedadb;
		border-left: 3px solid #ee964b;
		padding: .9rem 1rem;
		font-size: .9rem;
		display: grid;
		gap: .3rem;
		background: #fff;
	}

	.notice span { color: #666164; }
	.notice code { font-size: .84em; }

	.home-link {
		display: inline-block;
		margin-top: 1.4rem;
		color: #666164;
		text-decoration: none;
		font-size: .88rem;
	}

	.home-link:hover { color: #12100e; }
</style>
