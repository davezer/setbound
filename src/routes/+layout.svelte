<script>
  import '../styles.css';
  import Header from '$lib/components/Header.svelte';
  let { children } = $props();
</script>
<Header />
<main>{@render children()}</main>
<footer>
  <div class="shell footer-row"><span>setbound</span><span>Built for collectors, not spreadsheets.</span></div>
</footer>
