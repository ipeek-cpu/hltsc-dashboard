<script lang="ts">
  import type { Issue } from '$lib/types';
  import Icon from './Icon.svelte';
  import TypeBadge from './TypeBadge.svelte';
  import {
    calculateStaleness,
    getStalenessColor,
    getStalenessBackground,
    getStalenessIcon
  } from '$lib/stale-detection';

  interface AgentDropData {
    type: 'agent';
    agentFilename: string;
    agentName: string;
    agentScope: 'global' | 'project';
  }

  let { issue, isNew = false, acceptAgentDrop = false, onclick, onagentdrop }: {
    issue: Issue;
    isNew?: boolean;
    acceptAgentDrop?: boolean;
    onclick?: (issueId: string) => void;
    onagentdrop?: (issueId: string, agentData: AgentDropData) => void;
  } = $props();

  let isDragOver = $state(false);

  // Calculate staleness for this issue
  let staleness = $derived(calculateStaleness(issue.status, issue.updated_at));

  // Git/PR/CI status display helpers
  function getPRStatusIcon(status: string | undefined): string {
    switch (status) {
      case 'open': return 'git-pull-request';
      case 'merged': return 'git-merge';
      case 'closed': return 'x-circle';
      default: return 'git-pull-request';
    }
  }

  function getPRStatusColor(status: string | undefined): string {
    switch (status) {
      case 'open': return '#22c55e'; // green
      case 'merged': return '#a855f7'; // purple
      case 'closed': return '#ef4444'; // red
      default: return '#888888';
    }
  }

  function getCIStatusIcon(status: string | undefined): string {
    switch (status) {
      case 'success': return 'check-circle';
      case 'failure': return 'x-circle';
      case 'pending': return 'loader';
      default: return 'circle';
    }
  }

  function getCIStatusColor(status: string | undefined): string {
    switch (status) {
      case 'success': return '#22c55e'; // green
      case 'failure': return '#ef4444'; // red
      case 'pending': return '#f59e0b'; // amber
      default: return '#888888';
    }
  }

  function handleClick() {
    onclick?.(issue.id);
  }

  function handlePRClick(event: MouseEvent) {
    if (issue.pr_url) {
      event.stopPropagation();
      window.open(issue.pr_url, '_blank');
    }
  }

  function handleDragOver(event: DragEvent) {
    if (!acceptAgentDrop || !event.dataTransfer) return;

    // Check if it's an agent being dragged
    const types = event.dataTransfer.types;
    if (types.includes('application/json')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      isDragOver = true;
    }
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    if (!acceptAgentDrop || !event.dataTransfer) return;

    isDragOver = false;
    event.preventDefault();

    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json')) as AgentDropData;
      if (data.type === 'agent') {
        onagentdrop?.(issue.id, data);
      }
    } catch (e) {
      console.error('[IssueCard] Failed to parse drop data:', e);
    }
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

<div
  class="issue-card"
  class:is-new={isNew}
  class:is-stale-warning={staleness.level === 'warning'}
  class:is-stale-critical={staleness.level === 'critical'}
  class:is-drop-target={acceptAgentDrop}
  class:is-drag-over={isDragOver}
  onclick={handleClick}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
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
    {#if staleness.level !== 'none'}
      <span
        class="stale-badge"
        style="background: {getStalenessBackground(staleness.level)}; color: {getStalenessColor(staleness.level)}"
        title={staleness.message}
      >
        <Icon name={getStalenessIcon(staleness.level)} size={12} />
      </span>
    {/if}
  </div>

  <h3 class="issue-title">{truncate(issue.title, 60)}</h3>

  {#if issue.description}
    <p class="issue-description">{truncate(issue.description, 100)}</p>
  {/if}

  <!-- Git/PR/CI Status Row -->
  {#if issue.branch_name || issue.pr_url || issue.ci_status}
    <div class="git-status-row">
      {#if issue.branch_name}
        <span class="branch-badge" title={issue.branch_name}>
          <Icon name="git-branch" size={11} />
          <span class="branch-name">{issue.branch_name.length > 20 ? issue.branch_name.slice(0, 20) + '...' : issue.branch_name}</span>
        </span>
      {/if}
      {#if issue.pr_url}
        <button
          class="pr-badge"
          style="color: {getPRStatusColor(issue.pr_status)}"
          title="Open PR in browser"
          onclick={handlePRClick}
        >
          <Icon name={getPRStatusIcon(issue.pr_status)} size={12} />
          <span class="pr-label">PR</span>
        </button>
      {/if}
      {#if issue.ci_status}
        <span
          class="ci-badge"
          class:ci-pending={issue.ci_status === 'pending'}
          style="color: {getCIStatusColor(issue.ci_status)}"
          title={issue.ci_status === 'success' ? 'CI passed' : issue.ci_status === 'failure' ? 'CI failed' : 'CI running'}
        >
          <Icon name={getCIStatusIcon(issue.ci_status)} size={12} />
        </span>
      {/if}
    </div>
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
    position: relative;
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

  .stale-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .issue-card.is-stale-warning {
    border-color: #fbbf24;
    background: #fffbeb;
  }

  .issue-card.is-stale-warning:hover {
    border-color: #f59e0b;
  }

  .issue-card.is-stale-critical {
    border-color: #f87171;
    background: #fef2f2;
  }

  .issue-card.is-stale-critical:hover {
    border-color: #ef4444;
  }

  /* Git/PR/CI Status Styles */
  .git-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .branch-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #f0f7ff;
    color: #3b82f6;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-family: monospace;
    max-width: 160px;
  }

  .branch-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pr-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: transparent;
    border: 1px solid currentColor;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pr-badge:hover {
    background: currentColor;
    color: white !important;
  }

  .pr-badge:hover :global(.icon) {
    stroke: white;
  }

  .pr-label {
    text-transform: uppercase;
  }

  .ci-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  .ci-badge.ci-pending :global(.icon) {
    animation: spin 1.5s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Drop target styles */
  .issue-card.is-drop-target {
    transition: all 0.2s ease;
  }

  .issue-card.is-drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
    transform: scale(1.02);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3), 0 4px 12px rgba(59, 130, 246, 0.15);
  }

  .issue-card.is-drag-over::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
    pointer-events: none;
  }
</style>
