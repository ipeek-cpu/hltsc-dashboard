<script lang="ts">
  let { type, size = 'sm', zoom = 1 }: { type: string; size?: 'sm' | 'md'; zoom?: number } = $props();

  const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
    epic: { label: 'Epic', color: '#7c3aed', bg: '#ede9fe' },
    task: { label: 'Task', color: '#2563eb', bg: '#dbeafe' },
    bug: { label: 'Bug', color: '#dc2626', bg: '#fee2e2' },
    feature: { label: 'Feature', color: '#059669', bg: '#d1fae5' },
    question: { label: 'Question', color: '#d97706', bg: '#fef3c7' },
    docs: { label: 'Docs', color: '#6b7280', bg: '#f3f4f6' },
    gate: { label: 'Gate', color: '#7c3aed', bg: '#ede9fe' },
    chore: { label: 'Chore', color: '#6b7280', bg: '#f3f4f6' },
  };

  let config = $derived(typeConfig[type] || { label: type, color: '#6b7280', bg: '#f3f4f6' });

  // Scaled dimensions based on size
  let fontSize = $derived((size === 'sm' ? 10 : 12) * zoom);
  let paddingV = $derived((size === 'sm' ? 2 : 4) * zoom);
  let paddingH = $derived((size === 'sm' ? 6 : 10) * zoom);
  let borderRadius = $derived(6 * zoom);
</script>

<span
  class="badge"
  style="color: {config.color}; background: {config.bg}; font-size: {fontSize}px; padding: {paddingV}px {paddingH}px; border-radius: {borderRadius}px;"
>
  {config.label}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-weight: 500;
    text-transform: capitalize;
    white-space: nowrap;
  }
</style>
