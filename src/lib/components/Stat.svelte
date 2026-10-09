<script>let { value, label } = $props();</script>
<div><strong>{value}</strong><span>{label}</span></div>
<style>
  div { display:flex; flex-direction:column; gap:.15rem; }
  strong { font-size:1.65rem; letter-spacing:-.045em; }
  span { font-size:.78rem; color:var(--muted); font-weight:700; }
</style>
