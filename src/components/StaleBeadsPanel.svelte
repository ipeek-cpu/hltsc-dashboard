<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Issue } from '$lib/types';
  import {
    getIssuesNeedingAttention,
    getStalenessColor,
    getStalenessBackground,
    getStalenessIcon,
    type StalenessInfo
  } from '$lib/stale-detection';

  let {
    issues,
    onissueclick,
    ondismiss
  }: {
    issues: Issue[];
    onissueclick?: (issueId: string) => void;
    ondismiss?: (issueId: string) => void;
  } = $props();

  // Get stale issues sorted by severity
  let staleIssues = $derived(getIssuesNeedingAttention(issues));

  // Dismissed issues (stored in memory for this session)
  let dismissedIds = $state<Set<string>>(new Set());

  // Filter out dismissed issues
  let visibleStaleIssues = $derived(
    staleIssues.filter(item => !dismissedIds.has(item.id))
  );

  // Stats
  let criticalCount = $derived(
    visibleStaleIssues.filter(i => i.staleness.level === 'critical').length
  );
  let warningCount = $derived(
    visibleStaleIssues.filter(i => i.staleness.level === 'warning').length
  );

  function handleDismiss(issueId: string, event: MouseEvent) {
    event.stopPropagation();
    dismissedIds = new Set([...dismissedIds, issueId]);
    ondismiss?.(issueId);
  }

  function handleClick(issueId: string) {
    onissueclick?.(issueId);
  }

  function truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
</script>

{#if visibleStaleIssues.length > 0}
  <div class="stale-beads-panel">
    <div class="panel-header">
      <Icon name="alert-triangle" size={16} />
      <span class="panel-title">Needs Attention</span>
      <div class="badges">
        {#if criticalCount > 0}
          <span class="count-badge critical">{criticalCount}</span>
        {/if}
        {#if warningCount > 0}
          <span class="count-badge warning">{warningCount}</span>
        {/if}
      </div>
    </div>

    <div class="panel-content">
      {#each visibleStaleIssues as item (item.id)}
        {@const color = getStalenessColor(item.staleness.level)}
        {@const bg = getStalenessBackground(item.staleness.level)}
        {@const icon = getStalenessIcon(item.staleness.level)}
        <div
          class="stale-item"
          class:critical={item.staleness.level === 'critical'}
          class:warning={item.staleness.level === 'warning'}
          onclick={() => handleClick(item.id)}
          onkeydown={(e) => e.key === 'Enter' && handleClick(item.id)}
          role="button"
          tabindex="0"
        >
          <span class="item-icon" style="color: {color}; background: {bg}">
            <Icon name={icon} size={14} />
          </span>
          <span class="item-content">
            <span class="item-id">{item.id}</span>
            <span class="item-title">{truncate(item.title, 35)}</span>
            <span class="item-message">{item.staleness.message}</span>
          </span>
          <button
            class="dismiss-btn"
            onclick={(e) => handleDismiss(item.id, e)}
            title="Dismiss for this session"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      {/each}
    </div>

    {#if dismissedIds.size > 0}
      <button
        class="show-dismissed"
        onclick={() => dismissedIds = new Set()}
      >
        Show {dismissedIds.size} dismissed
      </button>
    {/if}
  </div>
{/if}

<style>
  .stale-beads-panel {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
    overflow: hidden;
    margin-bottom: 16px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    background: #fefce8;
    border-bottom: 1px solid #fef08a;
    color: #854d0e;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 600;
    flex: 1;
  }

  .badges {
    display: flex;
    gap: 4px;
  }

  .count-badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }

  .count-badge.critical {
    background: #fef2f2;
    color: #dc2626;
  }

  .count-badge.warning {
    background: #fffbeb;
    color: #d97706;
  }

  .panel-content {
    max-height: 300px;
    overflow-y: auto;
  }

  .stale-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid #f5f5f5;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .stale-item:last-child {
    border-bottom: none;
  }

  .stale-item:hover {
    background: #fafafa;
  }

  .stale-item.critical {
    background: #fefefe;
  }

  .stale-item.critical:hover {
    background: #fef2f2;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .item-content {
    flex: 1;
    min-width: 0;
  }

  .item-id {
    display: block;
    font-size: 11px;
    font-family: monospace;
    color: #888888;
    margin-bottom: 2px;
  }

  .item-title {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #1a1a1a;
    line-height: 1.3;
  }

  .item-message {
    display: block;
    font-size: 11px;
    color: #888888;
    margin-top: 4px;
  }

  .dismiss-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
    flex-shrink: 0;
  }

  .stale-item:hover .dismiss-btn {
    opacity: 1;
  }

  .dismiss-btn:hover {
    background: #f3f4f6;
    color: #4b5563;
  }

  .show-dismissed {
    display: block;
    width: 100%;
    padding: 10px 16px;
    background: #f9fafb;
    border: none;
    border-top: 1px solid #f0f0f0;
    font-size: 12px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .show-dismissed:hover {
    background: #f3f4f6;
    color: #4b5563;
  }
</style>
