<script>
  let { set } = $props();
</script>
<a class="card" href={`/sets/${set.slug}`}>
  <div class="eyebrow"><span>{set.year}</span><span>{set.manufacturer_name}</span></div>
  <h3>{set.name}</h3>
  <div class="meta">
    <span>{Number(set.card_count || 0).toLocaleString()} cards</span>
    <span>{set.checklist_count || 0} checklists</span>
  </div>
  <div class="line"><span></span></div>
</a>
<style>
  .card { min-height:11rem; display:flex; flex-direction:column; border:1px solid var(--line); border-radius:1rem; padding:1.2rem; background:white; text-decoration:none; color:inherit; transition:.18s ease; }
  .card:hover { transform:translateY(-2px); border-color:#bebbc0; box-shadow:0 12px 34px rgba(18,16,14,.07); }
  .eyebrow, .meta { display:flex; justify-content:space-between; gap:1rem; color:var(--muted); font-size:.76rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
  h3 { margin:.95rem 0 1.6rem; font-size:1.12rem; line-height:1.18; letter-spacing:-.02em; }
  .meta { margin-top:auto; text-transform:none; letter-spacing:0; font-weight:650; }
  .line { height:3px; background:var(--soft); margin-top:1rem; border-radius:10px; overflow:hidden; }
  .line span { display:block; width:34%; height:100%; background:var(--blue); }
</style>
