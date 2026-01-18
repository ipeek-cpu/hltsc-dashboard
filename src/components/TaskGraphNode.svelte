<script lang="ts">
  import type { Issue } from '$lib/types';
  import TypeBadge from './TypeBadge.svelte';

  let { issue, x, y, zoom = 1, onclick }: {
    issue: Issue;
    x: number;
    y: number;
    zoom?: number;
    onclick?: (issueId: string) => void;
  } = $props();

  // Base dimensions
  const BASE_WIDTH = 200;
  const BASE_HEIGHT = 80;

  // Scaled dimensions
  let width = $derived(BASE_WIDTH * zoom);
  let height = $derived(BASE_HEIGHT * zoom);

  const statusColors: Record<string, { color: string; bg: string }> = {
    open: { color: '#2563eb', bg: '#dbeafe' },
    in_progress: { color: '#d97706', bg: '#fef3c7' },
    blocked: { color: '#dc2626', bg: '#fee2e2' },
    closed: { color: '#059669', bg: '#d1fae5' },
    deferred: { color: '#7c3aed', bg: '#ede9fe' }
  };

  function handleClick() {
    onclick?.(issue.id);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.(issue.id);
    }
  }

  let statusStyle = $derived(statusColors[issue.status] || { color: '#6b7280', bg: '#f3f4f6' });
</script>

<div
  class="task-node"
  class:closed={issue.status === 'closed'}
  style="left: {x}px; top: {y}px; width: {width}px; height: {height}px; padding: {10 * zoom}px {12 * zoom}px; gap: {4 * zoom}px; border-radius: {10 * zoom}px;"
  onclick={handleClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
>
  <div class="node-header" style="gap: {6 * zoom}px;">
    <span class="status-dot" style="background: {statusStyle.color}; width: {8 * zoom}px; height: {8 * zoom}px;"></span>
    <span class="issue-id" style="font-size: {10 * zoom}px; line-height: {14 * zoom}px;">{issue.id}</span>
    <TypeBadge type={issue.issue_type} size="sm" {zoom} />
  </div>
  <div class="node-title" style="font-size: {13 * zoom}px; line-height: {18 * zoom}px;">{issue.title}</div>
  <div class="node-status" style="color: {statusStyle.color}; font-size: {10 * zoom}px; line-height: {14 * zoom}px;">
    {issue.status.replace('_', ' ')}
  </div>
</div>

<style>
  .task-node {
    position: absolute;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    cursor: pointer;
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    font-family: 'Figtree', sans-serif;
    box-sizing: border-box;
  }

  .task-node:hover {
    border-color: #c0c0c0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .task-node:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .task-node.closed {
    opacity: 0.7;
    background: #fafafa;
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dot {
    border-radius: 50%;
    flex-shrink: 0;
  }

  .issue-id {
    font-family: monospace;
    font-size: 10px;
    color: #888888;
    flex-shrink: 0;
  }

  .node-title {
    font-size: 13px;
    font-weight: 500;
    color: #1a1a1a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .node-status {
    font-size: 10px;
    font-weight: 500;
    text-transform: capitalize;
  }
</style>
