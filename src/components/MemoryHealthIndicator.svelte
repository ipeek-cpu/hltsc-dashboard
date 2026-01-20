<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    status: 'connected' | 'connecting' | 'disconnected' | 'error';
    lastWrite?: Date | string;
    entryCount?: number;
    errorMessage?: string;
    size?: 'sm' | 'md';    // Default 'sm'
  }

  let {
    status,
    lastWrite,
    entryCount,
    errorMessage,
    size = 'sm'
  }: Props = $props();

  let showPopover = $state(false);

  // Status config
  const statusConfig = {
    connected: { color: '#22c55e', label: 'Connected', icon: 'circle' },
    connecting: { color: '#6b7280', label: 'Connecting...', icon: 'loader' },
    disconnected: { color: '#6b7280', label: 'Disconnected', icon: 'circle' },
    error: { color: '#ef4444', label: 'Error', icon: 'alert-circle' }
  };

  const config = $derived(statusConfig[status]);

  // Format last write time
  function formatLastWrite(date: Date | string | undefined): string {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
</script>

<div
  class="health-indicator {size}"
  onmouseenter={() => showPopover = true}
  onmouseleave={() => showPopover = false}
  role="status"
  aria-label="Memory status: {config.label}"
>
  <span
    class="status-dot"
    class:pulse={status === 'connecting'}
    style="--dot-color: {config.color}"
  >
    {#if status === 'error'}
      <Icon name="alert-circle" size={size === 'sm' ? 10 : 14} />
    {:else if status === 'connecting'}
      <Icon name="loader" size={size === 'sm' ? 10 : 14} />
    {:else}
      <span class="dot"></span>
    {/if}
  </span>

  {#if showPopover}
    <div class="popover">
      <div class="popover-header">
        <span class="status-label" style="color: {config.color}">{config.label}</span>
      </div>
      <div class="popover-content">
        <div class="stat-row">
          <span class="stat-label">Last write:</span>
          <span class="stat-value">{formatLastWrite(lastWrite)}</span>
        </div>
        {#if entryCount !== undefined}
          <div class="stat-row">
            <span class="stat-label">Entries:</span>
            <span class="stat-value">{entryCount}</span>
          </div>
        {/if}
        {#if errorMessage && status === 'error'}
          <div class="error-message">{errorMessage}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .health-indicator {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: default;
  }

  .status-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--dot-color);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot-color);
  }

  .health-indicator.md .dot {
    width: 10px;
    height: 10px;
  }

  .status-dot.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .popover {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    min-width: 160px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .status-label {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .popover-content {
    padding: 0.5rem 0.75rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    padding: 0.25rem 0;
  }

  .stat-label {
    color: var(--text-tertiary, #666);
  }

  .stat-value {
    color: var(--text-secondary, #aaa);
  }

  .error-message {
    margin-top: 0.5rem;
    padding: 0.375rem;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 4px;
    font-size: 0.65rem;
    color: var(--error-color, #ef4444);
  }
</style>
