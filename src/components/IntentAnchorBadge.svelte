<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    anchor: string;           // Anchor path e.g. "lifecycle.execute"
    previewText?: string;     // Brief preview of the section content
    size?: 'sm' | 'md';       // Default 'sm'
    onclick?: (anchor: string) => void;  // Opens IntentViewer
  }

  let { anchor, previewText, size = 'sm', onclick }: Props = $props();

  let showPopover = $state(false);
  let popoverTimer: ReturnType<typeof setTimeout> | null = null;

  // Truncate anchor for display (20 chars max)
  const displayAnchor = $derived(
    anchor.length > 20 ? anchor.slice(0, 20) + '...' : anchor
  );

  function handleMouseEnter() {
    popoverTimer = setTimeout(() => {
      showPopover = true;
    }, 300);
  }

  function handleMouseLeave() {
    if (popoverTimer) {
      clearTimeout(popoverTimer);
      popoverTimer = null;
    }
    showPopover = false;
  }

  function handleClick() {
    onclick?.(anchor);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<span
  class="anchor-badge {size}"
  class:clickable={!!onclick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onclick={handleClick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  onkeydown={onclick ? handleKeyDown : undefined}
>
  <Icon name="link" size={size === 'sm' ? 10 : 12} />
  <span class="anchor-text">{displayAnchor}</span>

  {#if showPopover && previewText}
    <div class="popover">
      <div class="popover-header">
        <Icon name="file-text" size={12} />
        <code>{anchor}</code>
      </div>
      <p class="popover-preview">{previewText}</p>
      {#if onclick}
        <div class="popover-hint">Click to view in Intent</div>
      {/if}
    </div>
  {/if}
</span>

<style>
  .anchor-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: var(--accent-bg, rgba(37, 99, 235, 0.1));
    color: var(--accent-color, #3b82f6);
    border-radius: 4px;
    font-family: var(--font-mono, 'SF Mono', 'Consolas', monospace);
    font-size: 0.7rem;
    position: relative;
    white-space: nowrap;
  }

  .anchor-badge.sm {
    height: 20px;
    font-size: 0.65rem;
  }

  .anchor-badge.md {
    height: 26px;
    font-size: 0.75rem;
  }

  .anchor-badge.clickable {
    cursor: pointer;
    transition: background 0.15s;
  }

  .anchor-badge.clickable:hover {
    background: var(--accent-bg-hover, rgba(37, 99, 235, 0.2));
  }

  .anchor-badge.clickable:focus {
    outline: 2px solid var(--accent-color, #3b82f6);
    outline-offset: 2px;
  }

  .anchor-text {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }

  .popover {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 200px;
    max-width: 300px;
    z-index: 1000;
    animation: popoverIn 0.15s ease-out;
  }

  @keyframes popoverIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .popover-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color, #333);
    color: var(--text-secondary, #aaa);
  }

  .popover-header code {
    font-size: 0.75rem;
    color: var(--accent-color, #3b82f6);
  }

  .popover-preview {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary, #aaa);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .popover-hint {
    margin-top: 0.5rem;
    font-size: 0.7rem;
    color: var(--text-tertiary, #666);
  }
</style>
