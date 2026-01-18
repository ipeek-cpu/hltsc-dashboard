<script lang="ts">
  import type { Issue } from '$lib/types';
  import Icon from './Icon.svelte';
  import TypeBadge from './TypeBadge.svelte';

  let { issue, isNew = false, onclick }: {
    issue: Issue;
    isNew?: boolean;
    onclick?: (issueId: string) => void;
  } = $props();

  function handleClick() {
    onclick?.(issue.id);
  }

  const priorityConfig: Record<number, { color: string; chevrons: number }> = {
    0: { color: '#dc2626', chevrons: 4 }, // Critical - dark red
    1: { color: '#ef4444', chevrons: 3 }, // High - red
    2: { color: '#eab308', chevrons: 2 }, // Medium - yellow
    3: { color: '#22c55e', chevrons: 1 }, // Low - green
    4: { color: '#6b7280', chevrons: 0 }, // Backlog - gray
  };

  const typeIcons: Record<string, string> = {
    bug: 'alert-circle',
    feature: 'star',
    task: 'check-square',
    chore: 'tool',
  };

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  function truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
</script>

<div class="issue-card" class:is-new={isNew} onclick={handleClick} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && handleClick()}>
  <div class="card-header">
    <span class="type-icon">
      <Icon name={typeIcons[issue.issue_type] || 'file-text'} size={14} />
    </span>
    <span class="issue-id">{issue.id}</span>
    <TypeBadge type={issue.issue_type} size="sm" />
    {#if priorityConfig[issue.priority]?.chevrons > 0}
      <span class="priority-chevrons" style="color: {priorityConfig[issue.priority]?.color || '#6b7280'}">
        {#each Array(priorityConfig[issue.priority]?.chevrons || 1) as _}
          <Icon name="chevron-up" size={12} />
        {/each}
      </span>
    {/if}
  </div>

  <h3 class="issue-title">{truncate(issue.title, 60)}</h3>

  {#if issue.description}
    <p class="issue-description">{truncate(issue.description, 100)}</p>
  {/if}

  <div class="card-footer">
    {#if issue.assignee}
      <span class="assignee">
        <Icon name="user" size={12} />
        {issue.assignee}
      </span>
    {/if}
    <span class="updated">
      <Icon name="clock" size={12} />
      {formatTime(issue.updated_at)}
    </span>
  </div>
</div>

<style>
  .issue-card {
    background: #ffffff;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
    border: 1px solid #f0f0f0;
    transition: all 0.2s ease;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  .issue-card:hover {
    border-color: #e0e0e0;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .issue-card.is-new {
    animation: highlight 2s ease-out;
  }

  @keyframes highlight {
    0% {
      background: #eff6ff;
      border-color: #3b82f6;
    }
    100% {
      background: #ffffff;
      border-color: #f0f0f0;
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .type-icon {
    color: #888888;
    display: flex;
    align-items: center;
  }

  .issue-id {
    font-family: monospace;
    font-size: 11px;
    color: #888888;
    flex: 1;
  }

  .priority-chevrons {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 0;
  }

  .priority-chevrons :global(.icon) {
    margin: -3px 0;
  }

  .issue-title {
    font-size: 14px;
    font-weight: 500;
    color: #1a1a1a;
    margin: 0 0 8px 0;
    line-height: 1.4;
  }

  .issue-description {
    font-size: 13px;
    color: #666666;
    margin: 0 0 10px 0;
    line-height: 1.5;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #888888;
  }

  .assignee {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f5f5f5;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .updated {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    opacity: 0.8;
  }
</style>
