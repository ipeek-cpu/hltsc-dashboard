<script lang="ts">
  import type { Issue } from '$lib/types';
  import Icon from './Icon.svelte';
  import TypeBadge from './TypeBadge.svelte';

  let { epic, children = [], isExpanded = false, ontoggle, onissueclick, ontreeview }: {
    epic: Issue;
    children?: Issue[];
    isExpanded?: boolean;
    ontoggle?: () => void;
    onissueclick?: (issueId: string) => void;
    ontreeview?: () => void;
  } = $props();

  const statusColors: Record<string, { color: string; bg: string }> = {
    open: { color: '#2563eb', bg: '#dbeafe' },
    in_progress: { color: '#d97706', bg: '#fef3c7' },
    blocked: { color: '#dc2626', bg: '#fee2e2' },
    closed: { color: '#059669', bg: '#d1fae5' },
    deferred: { color: '#7c3aed', bg: '#ede9fe' },
  };

  let completedCount = $derived(children.filter(c => c.status === 'closed').length);
  let totalCount = $derived(children.length);
  let progressPercent = $derived(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

  function truncate(str: string | null, len: number): string {
    if (!str) return '';
    return str.length > len ? str.slice(0, len).trim() + '...' : str;
  }

  function handleEpicClick() {
    onissueclick?.(epic.id);
  }

  function handleChildClick(e: MouseEvent, childId: string) {
    e.stopPropagation();
    onissueclick?.(childId);
  }

  function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    ontoggle?.();
  }

  function handleTreeView(e: MouseEvent) {
    e.stopPropagation();
    ontreeview?.();
  }
</script>

<div class="epic-card">
  <div class="epic-header" onclick={handleEpicClick} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && handleEpicClick()}>
    <button class="expand-btn" onclick={handleToggle} class:expanded={isExpanded}>
      <Icon name="chevron-right" size={16} />
    </button>

    <div class="epic-info">
      <div class="epic-title-row">
        <span class="epic-id">{epic.id}</span>
        <TypeBadge type={epic.issue_type} size="sm" />
        <span
          class="status-badge"
          style="color: {statusColors[epic.status]?.color || '#6b7280'}; background: {statusColors[epic.status]?.bg || '#f3f4f6'}"
        >
          {epic.status.replace('_', ' ')}
        </span>
      </div>
      <h3 class="epic-title">{epic.title}</h3>

      {#if epic.description}
        <p class="epic-description">{truncate(epic.description, 120)}</p>
      {/if}

      {#if totalCount > 0}
        <div class="progress-section">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {progressPercent}%"></div>
          </div>
          <span class="progress-text">{completedCount}/{totalCount} tasks</span>
        </div>
      {/if}
    </div>

    <div class="epic-actions">
      <button
        class="tree-view-btn"
        onclick={handleTreeView}
        title="View as tree diagram"
      >
        <Icon name="git-branch" size={16} />
      </button>
      {#if epic.assignee}
        <span class="assignee">
          <Icon name="user" size={14} />
          {epic.assignee}
        </span>
      {/if}
    </div>
  </div>

  {#if isExpanded && children.length > 0}
    <div class="children-list">
      {#each children as child (child.id)}
        <button
          class="child-item"
          onclick={(e) => handleChildClick(e, child.id)}
        >
          <span
            class="child-status-dot"
            style="background: {statusColors[child.status]?.color || '#6b7280'}"
          ></span>
          <span class="child-id">{child.id}</span>
          <span class="child-title">{child.title}</span>
          <span
            class="child-status"
            style="color: {statusColors[child.status]?.color || '#6b7280'}"
          >
            {child.status.replace('_', ' ')}
          </span>
          <Icon name="chevron-right" size={14} />
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .epic-card {
    background: #ffffff;
    border-radius: 12px;
    border: 1px solid #f0f0f0;
    overflow: hidden;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  .epic-card:hover {
    border-color: #e0e0e0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .epic-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    cursor: pointer;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: #f5f5f5;
    border-radius: 6px;
    color: #888888;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    background: #eeeeee;
    color: #1a1a1a;
  }

  .expand-btn.expanded {
    transform: rotate(90deg);
  }

  .epic-info {
    flex: 1;
    min-width: 0;
  }

  .epic-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .epic-id {
    font-family: monospace;
    font-size: 11px;
    color: #888888;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: capitalize;
  }

  .epic-title {
    margin: 0 0 6px 0;
    font-size: 15px;
    font-weight: 500;
    color: #1a1a1a;
    line-height: 1.4;
  }

  .epic-description {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: #666666;
    line-height: 1.5;
  }

  .progress-section {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: #f0f0f0;
    border-radius: 3px;
    overflow: hidden;
    max-width: 200px;
  }

  .progress-fill {
    height: 100%;
    background: #22c55e;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 12px;
    color: #888888;
    white-space: nowrap;
  }

  .epic-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .tree-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: #f5f5f5;
    border-radius: 8px;
    color: #888888;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tree-view-btn:hover {
    background: #e8f4ff;
    color: #2563eb;
  }

  .assignee {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #888888;
    background: #f5f5f5;
    padding: 4px 10px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .children-list {
    border-top: 1px solid #f0f0f0;
    background: #fafafa;
    padding: 8px;
  }

  .child-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #f0f0f0;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
    margin-bottom: 4px;
  }

  .child-item:last-child {
    margin-bottom: 0;
  }

  .child-item:hover {
    background: #f8f8f8;
    border-color: #e0e0e0;
  }

  .child-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .child-id {
    font-family: monospace;
    font-size: 11px;
    color: #888888;
    flex-shrink: 0;
  }

  .child-title {
    flex: 1;
    font-size: 13px;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .child-status {
    font-size: 11px;
    font-weight: 500;
    text-transform: capitalize;
    flex-shrink: 0;
  }
</style>
