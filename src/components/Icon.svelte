<script lang="ts">
  import { onMount } from 'svelte';
  import feather from 'feather-icons';

  let { name, size = 20, strokeWidth = 2, class: className = '' }: {
    name: string;
    size?: number;
    strokeWidth?: number;
    class?: string;
  } = $props();

  let iconHtml = $derived(
    feather.icons[name]?.toSvg({
      width: size,
      height: size,
      'stroke-width': strokeWidth
    }) || ''
  );
</script>

<span class="icon {className}" style="width: {size}px; height: {size}px;">
  {@html iconHtml}
</span>

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon :global(svg) {
    display: block;
  }
</style>
