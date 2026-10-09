<script>
  let { compact = false } = $props();
</script>

<a class:compact class="brand" href="/" aria-label="Setbound home">
  <img src="/full-logo-no-bg.png" alt="Setbound" />
</a>

<style>
  .brand {
    display:inline-flex;
    align-items:center;
    text-decoration:none;
    line-height:0;
  }

  img {
    display:block;
    width:clamp(10.25rem, 14vw, 12.5rem);
    height:auto;
  }

  .compact img {
    width:9.8rem;
  }

  @media (max-width: 620px) {
    img, .compact img { width:8.7rem; }
  }
</style>
