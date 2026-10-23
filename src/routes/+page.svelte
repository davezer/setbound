<script>
 import SearchBox from '$lib/components/SearchBox.svelte';
 import SetCard from '$lib/components/SetCard.svelte';
 let { data } = $props();
</script>
<svelte:head>
 <title>Sports Card Checklists & Collection Tracking | Setbound</title>
 <meta name="description" content="Explore trading card checklists, track your collection, and compare releases using Setbound Checklist Mixer." />
 <meta name="robots" content="index,follow" />
 <link rel="canonical" href="https://setbound.app/" />
 <meta property="og:title" content="Sports Card Checklists & Collection Tracking | Setbound" />
 <meta property="og:description" content="Discover checklists, manage your collection, and use Checklist Mixer during live breaks." />
 <meta property="og:url" content="https://setbound.app/" />
 <meta property="og:type" content="website" />
</svelte:head>
<section class="hero shell">
 <div class="hero-main">
  <div class="eyebrow">Trading card checklists, made useful</div>
  <h1>Find the card.<span>Finish the set.</span></h1>
  <p>Browse trading card checklists, search players and releases, and find what belongs in every set.</p>
  <div class="search"><SearchBox large /></div>
  <div class="quick-links"><a href="/sets">Browse checklists →</a><a href="/search">Search players & teams →</a></div>
 </div>
 <aside class="account-panel">
  <div class="eyebrow">Your cards, organized</div>
  <h2>Collect with <span>confidence.</span></h2>
  <p>Mark the cards you own, save what you're chasing, and see your progress as your collection grows.</p>
  <div class="features"><span>✓ Track cards you own</span><span>✓ Build your want list</span><span>✓ Find missing cards faster</span></div>
  {#if data.signedIn}
   <a class="button" href="/collection">Open your collection <span>→</span></a>
  {:else}
   <a class="button" href="/auth/register">Create a free account <span>→</span></a>
   <a class="signin" href="/auth/login">Already have an account? Sign in</a>
  {/if}
 </aside>
</section>
<section class="mixer-band">
 <div class="shell mixer-layout">
  <div>
   <div class="eyebrow">Meet Checklist Mixer</div>
   <h2>Multiple sets.<br /><span>One clear view.</span></h2>
   <p>Built for mixers and live breaks. Choose up to ten products, search every checklist together, compare releases side by side, or jump into Break Mode and see a team's cards across them all.</p>
   <a class="button" href="/mixer">Try Checklist Mixer <span>→</span></a>
  </div>
  <div class="preview" aria-label="Illustration of Checklist Mixer Break Mode">
   <div class="preview-top"><strong>CHECKLIST MIXER</strong><span>BREAK MODE</span></div>
   <div class="team"><small>EXAMPLE TEAM</small><strong>Philadelphia Phillies</strong><span>Cards across your selected releases</span></div>
   <div class="line"><span>Bowman Baseball</span><b>View checklist →</b></div>
   <div class="line"><span>Topps Series 1</span><b>View checklist →</b></div>
   <div class="line"><span>Topps Chrome</span><b>View checklist →</b></div>
   <div class="preview-footer">Combined · Side by Side · By Team · Break Mode</div>
  </div>
 </div>
</section>
<section class="shell recent">
 <div class="section-head"><div><div class="eyebrow">Recently added</div><h2>Fresh checklists</h2></div><a href="/sets">View all sets →</a></div>
 {#if data.recent.length}<div class="recent-grid">{#each data.recent as set}<SetCard {set}/>{/each}</div>{:else}<p>No published sets yet.</p>{/if}
</section>
<section class="browse">
 <div class="shell">
  <div class="section-head"><div><div class="eyebrow">Explore the library</div><h2>Start somewhere.</h2></div><a href="/sets">Browse the full library →</a></div>
  <div class="sports">{#each data.sports as sport}<a href={`/sets/sport/${sport.slug}`}><strong>{sport.name}</strong><small>{Number(sport.set_count||0).toLocaleString()} sets</small><span>→</span></a>{/each}</div>
 </div>
</section>
<style>
.hero{display:grid;grid-template-columns:1.35fr .75fr;gap:clamp(2rem,6vw,6rem);align-items:center;padding-top:5rem;padding-bottom:5rem}.hero h1{font-family:var(--display);font-weight:700;font-size:clamp(3.5rem,6.5vw,6.5rem);line-height:1;letter-spacing:-.065em;margin:.8rem 0 1.4rem}.hero h1 span{display:block;color:var(--ink)}.hero-main>p{font-size:1rem;color:var(--muted);line-height:1.65;max-width:690px}.search{max-width:720px;margin-top:1.7rem}.quick-links{display:flex;gap:1.3rem;margin-top:1rem;flex-wrap:wrap}.quick-links a,.signin,.section-head>a{color:var(--blue);font-size:.77rem;font-weight:800;text-decoration:none}
.account-panel{border-left:1px solid var(--line);padding:1.2rem 0 1.2rem 2.3rem}.account-panel h2{font-family:var(--display);font-weight:700;font-size:clamp(2rem,3.1vw,3.2rem);letter-spacing:-.055em;line-height:1.12;margin:.7rem 0 1rem}.account-panel h2 span{color:var(--ink)}.account-panel p{color:var(--muted);font-size:.91rem;line-height:1.6}.features{display:grid;gap:.65rem;font-size:.81rem;font-weight:750;margin:1.3rem 0 1.6rem}.button{display:inline-flex;gap:1.5rem;justify-content:space-between;align-items:center;background:var(--ink);color:#fff;text-decoration:none;border-radius:.65rem;font-weight:850;font-size:.81rem;padding:.9rem 1.1rem}.button:hover{background:var(--blue)}.signin{display:block;margin-top:1rem}
.mixer-band{background:#F6F6F3;border-block:1px solid var(--line);padding:4.5rem 0}.mixer-layout{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,6vw,6rem);align-items:center}.mixer-layout h2{font-family:var(--display);font-size:clamp(2.7rem,5vw,5rem);font-weight:700;letter-spacing:-.055em;line-height:1.08;margin:.7rem 0 1.2rem}.mixer-layout h2 span{color:var(--ink)}.mixer-layout p{max-width:620px;line-height:1.7;color:var(--muted);margin:0 0 1.8rem}
.preview{background:white;border:1px solid var(--line-strong);border-radius:1rem;overflow:hidden;box-shadow:0 16px 45px rgba(17,44,67,.07)}.preview-top{display:flex;justify-content:space-between;gap:1rem;padding:1rem 1.2rem;font-size:.7rem;border-bottom:1px solid var(--line)}.preview-top span{color:var(--orange);font-weight:900}.team{padding:1.4rem 1.2rem;background:#F8F7F4;display:grid;gap:.4rem}.team small{font-weight:800;color:var(--blue);font-size:.62rem}.team strong{font-family:var(--display);font-size:clamp(1.5rem,2.6vw,2.5rem);letter-spacing:-.055em}.team span{font-size:.75rem;color:var(--muted)}.line{display:flex;justify-content:space-between;gap:.75rem;padding:1rem 1.2rem;border-top:1px solid var(--line);font-weight:800;font-size:.79rem}.line b{color:var(--blue);font-size:.7rem}.preview-footer{padding:1rem 1.2rem;color:var(--muted);font-size:.67rem;border-top:1px solid var(--line)}
.recent{padding-top:4.5rem;padding-bottom:4.5rem}.section-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:1.4rem}.section-head h2{font-family:var(--display);font-size:clamp(2rem,3.7vw,3.5rem);font-weight:700;letter-spacing:-.06em;margin:.25rem 0}.recent-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.browse{border-top:1px solid var(--line);background:#FAFAF8;padding:4rem 0 5rem}.sports{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 1.6rem}.sports a{display:flex;align-items:center;gap:.7rem;padding:1rem .15rem;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}.sports strong{flex:1;font-size:.89rem}.sports small{font-size:.72rem;color:var(--muted)}.sports a>span{color:var(--blue)}.sports a:hover strong{color:var(--orange)}
@media(max-width:950px){.hero,.mixer-layout{grid-template-columns:1fr}.hero{gap:2rem;padding-top:3rem;padding-bottom:3rem}.account-panel{border-left:0;border-top:1px solid var(--line);padding:2rem 0 0}.recent-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.hero h1{font-size:clamp(3rem,11vw,4.5rem)}.recent-grid,.sports{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.mixer-band{padding:3rem 0}}
</style>

