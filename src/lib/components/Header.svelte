<script>
  import Logo from './Logo.svelte';
</script>

<header class="site-header">
  <div class="shell header-row">
    <Logo compact />

    <nav aria-label="Primary navigation">
      <a href="/sets">Sets</a>
      <a href="/search">Search</a>
      <a class="import-link" href="/admin/import">Import</a>
    </nav>
  </div>
</header>

<style>
  .site-header {
    position:sticky;
    top:0;
    z-index:30;
    border-bottom:1px solid var(--line);
    background:rgba(252,252,252,.94);
    backdrop-filter:blur(18px);
  }

  .header-row {
    min-height:5.1rem;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:2rem;
  }

  nav {
    display:flex;
    align-items:center;
    gap:.35rem;
  }

  nav a {
    color:#4d494b;
    text-decoration:none;
    font-size:.88rem;
    font-weight:750;
    padding:.65rem .8rem;
    border-radius:.65rem;
    transition:background .15s ease,color .15s ease;
  }

  nav a:hover {
    color:var(--ink);
    background:#f1f0f0;
  }

  .import-link {
    margin-left:.35rem;
    border:1px solid var(--line-strong);
    color:var(--ink);
    background:white;
  }

  @media (max-width: 560px) {
    .header-row { min-height:4.5rem; }
    nav { gap:0; }
    nav a { padding:.55rem .55rem; font-size:.82rem; }
    .import-link { display:none; }
  }
</style>
