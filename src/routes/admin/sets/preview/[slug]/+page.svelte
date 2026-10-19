<script>
  import SetPage from '../../../../sets/[slug]/+page.svelte';
  let { data } = $props();
</script>

<SetPage {data} />
