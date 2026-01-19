<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Issue } from '$lib/types';
  import { isValidTransition, type BeadStatus } from '$lib/bead-lifecycle';

  let { selectedIssues = [], onstatuschange, onclear }: {
    selectedIssues: Issue[];
    onstatuschange?: (issueIds: string[], newStatus: string) => void;
    onclear?: () => void;
  } = $props();

  // Get the common statuses of selected issues
  let commonStatuses = $derived(() => {
    if (selectedIssues.length === 0) return new Set<string>();
    const statuses = new Set(selectedIssues.map(i => i.status));
    return statuses;
  });

  // Determine which status transitions are valid for ALL selected issues
  let validTransitions = $derived(() => {
    if (selectedIssues.length === 0) return [];

    const allStatuses: BeadStatus[] = ['open', 'ready', 'in_progress', 'in_review', 'blocked', 'closed', 'deferred'];

    // Find transitions that are valid for all selected issues
    const valid = allStatuses.filter(targetStatus => {
      return selectedIssues.every(issue => {
        // Can't transition to same status
        if (issue.status === targetStatus) return false;
        return isValidTransition(issue.status as BeadStatus, targetStatus);
      });
    });

    return valid;
  });

  // Status display config
  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    open: { label: 'Open', color: '#3b82f6', icon: 'circle' },
    ready: { label: 'Ready', color: '#8b5cf6', icon: 'check-circle' },
    in_progress: { label: 'In Progress', color: '#f59e0b', icon: 'play-circle' },
    in_review: { label: 'In Review', color: '#06b6d4', icon: 'eye' },
    blocked: { label: 'Blocked', color: '#ef4444', icon: 'x-octagon' },
    closed: { label: 'Closed', color: '#22c55e', icon: 'check' },
    deferred: { label: 'Deferred', color: '#6b7280', icon: 'clock' }
  };

  function handleStatusClick(status: string) {
    const issueIds = selectedIssues.map(i => i.id);
    onstatuschange?.(issueIds, status);
  }
</script>

{#if selectedIssues.length > 0}
  <div class="bulk-actions-bar">
    <div class="selection-info">
      <span class="count">{selectedIssues.length}</span>
      <span class="label">selected</span>
      <button class="clear-btn" onclick={onclear}>
        <Icon name="x" size={14} />
        Clear
      </button>
    </div>

    <div class="divider"></div>

    <div class="status-actions">
      <span class="actions-label">Move to:</span>
      {#each validTransitions() as status}
        {@const config = statusConfig[status]}
        <button
          class="status-btn"
          style="--status-color: {config.color}"
          onclick={() => handleStatusClick(status)}
        >
          <Icon name={config.icon} size={14} />
          {config.label}
        </button>
      {/each}

      {#if validTransitions().length === 0}
        <span class="no-actions">No common transitions available</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bulk-actions-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: #1f2937;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    z-index: 100;
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    background: #3b82f6;
    color: white;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
  }

  .label {
    color: #9ca3af;
    font-size: 14px;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid #374151;
    border-radius: 6px;
    color: #9ca3af;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .clear-btn:hover {
    background: #374151;
    color: #ffffff;
  }

  .divider {
    width: 1px;
    height: 24px;
    background: #374151;
  }

  .status-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .actions-label {
    color: #9ca3af;
    font-size: 13px;
    margin-right: 4px;
  }

  .status-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--status-color);
    border-radius: 6px;
    color: var(--status-color);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .status-btn:hover {
    background: var(--status-color);
    color: white;
  }

  .no-actions {
    color: #6b7280;
    font-size: 13px;
    font-style: italic;
  }
</style>
