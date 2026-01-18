<script lang="ts">
  import type { Issue } from '$lib/types';
  import IssueCard from './IssueCard.svelte';

  let { title, status, issues, recentlyChanged = new Set(), onissueclick }: {
    title: string;
    status: string;
    issues: Issue[];
    recentlyChanged?: Set<string>;
    onissueclick?: (issueId: string) => void;
  } = $props();

  const statusColors: Record<string, string> = {
    open: '#3b82f6',
    in_progress: '#f59e0b',
    blocked: '#ef4444',
    closed: '#22c55e',
    deferred: '#8b5cf6',
  };

  const statusBackgrounds: Record<string, string> = {
    open: '#f8fafc',
    in_progress: '#fffbeb',
    blocked: '#fef2f2',
    closed: '#f0fdf4',
    deferred: '#faf5ff',
  };

  let filteredIssues = $derived(issues.filter(i => i.status === status));
  let color = $derived(statusColors[status] || '#6c7086');
  let bgColor = $derived(statusBackgrounds[status] || '#fafafa');
</script>

<div class="kanban-column">
  <div class="column-header" style="border-color: {color}">
    <h2 style="color: {color}">{title}</h2>
    <span class="count">{filteredIssues.length}</span>
  </div>

  <div class="column-content" style="background: {bgColor}">
    {#each filteredIssues as issue (issue.id)}
      <IssueCard {issue} isNew={recentlyChanged.has(issue.id)} onclick={onissueclick} />
    {/each}

    {#if filteredIssues.length === 0}
      <div class="empty-state">No issues</div>
    {/if}
  </div>
</div>

<style>
  .kanban-column {
    flex: 1;
    min-width: 280px;
    max-width: 350px;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
  }

  .column-header {
    padding: 18px 16px;
    border-bottom: 2px solid;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #ffffff;
  }

  .column-header h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: 'Figtree', sans-serif;
  }

  .count {
    background: #f5f5f5;
    color: #666666;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .column-content {
    flex: 1;
    padding: 12px;
    overflow-y: auto;
    max-height: calc(100vh - 200px);
  }

  .empty-state {
    text-align: center;
    color: #888888;
    padding: 24px;
    font-size: 13px;
  }
</style>
