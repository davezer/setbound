<script>
  let { slugs = [], label = 'Copy breaker names' } = $props();
  let busy = $state(false);
  let feedback = $state('');
  function shuffled(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const rnd = new Uint32Array(1);
      crypto.getRandomValues(rnd);
      const j = rnd[0] % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  async function copy(shuffle = false) {
    if (busy || !slugs.length) return;
    busy = true;
    feedback = '';
    try {
      const response = await fetch('/api/breaker/names', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slugs })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Unable to export names.');
      if (!result.names?.length) throw new Error('No names found for these products.');
      const names = shuffle ? shuffled(result.names) : result.names;
      await navigator.clipboard.writeText(names.join('\n'));
      feedback = `${names.length} unique names copied${shuffle ? ' (shuffled)' : ''}.`;
    } catch (error) {
      feedback = error.message || 'Copy failed. Check browser clipboard permissions.';
    } finally {
      busy = false;
    }
  }
</script>
<div class="breaker-export" aria-label="Breaker name export">
  <span class="breaker-label">Breaker beta</span>
  <button type="button" onclick={() => copy(false)} disabled={busy || !slugs.length}>{busy ? 'Preparing…' : label}</button>
  <button type="button" class="secondary" onclick={() => copy(true)} disabled={busy || !slugs.length}>Copy shuffled</button>
  {#if feedback}<small role="status">{feedback}</small>{/if}
</div>
<style>
  .breaker-export{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin:1rem 0;padding:.75rem 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .breaker-label{font-size:.64rem;font-weight:800;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-right:.3rem}
  button{padding:.62rem .85rem;border:1px solid var(--ink);border-radius:.55rem;background:var(--ink);color:white;font:inherit;font-weight:750;font-size:.73rem;cursor:pointer}
  button.secondary{background:white;border-color:var(--line-strong);color:var(--ink)}button:disabled{opacity:.55;cursor:not-allowed}
  small{width:100%;color:var(--muted);font-size:.72rem}
</style>
