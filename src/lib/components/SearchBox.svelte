<script>
  let { value = '', large = false, action = '/search', placeholder = 'Search players, teams, sets…' } = $props();
</script>
<form method="GET" {action} class:large>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
  <input name="q" {placeholder} {value} autocomplete="off" aria-label="Search" />
  <button type="submit">Search</button>
</form>
<style>
  form { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.7rem; border:1px solid var(--line-strong); border-radius:.8rem; padding:.4rem .45rem .4rem .8rem; background:white; box-shadow:0 8px 25px rgba(18,16,14,.05); }
  form.large { padding:.55rem .55rem .55rem 1rem; border-radius:1rem; }
  svg { width:1.15rem; height:1.15rem; stroke:var(--muted); fill:none; stroke-width:2; }
  input { border:0; outline:0; font:inherit; color:var(--ink); min-width:0; background:transparent; padding:.55rem 0; }
  input::placeholder { color:#9b989d; }
  button { border:0; border-radius:.65rem; background:var(--ink); color:white; padding:.7rem .95rem; font-weight:800; cursor:pointer; }
  button:hover { background:#2b2927; }
</style>
