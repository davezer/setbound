<script>
  import '../styles.css';
  import Header from '$lib/components/Header.svelte';
  let { children } = $props();
</script>
<Header />
<main>{@render children()}</main>
<footer>
  <div class="shell footer-row"><span>© 2026 setbound. All rights reserved.</span><span class="footer-links"><a href="/contact" style="margin-right: 1.5rem;">Contact</a><span>Built for collectors, by collectors.</span></span></div>
</footer>
