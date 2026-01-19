<script lang="ts">
  import type { Issue } from '$lib/types';
  import IssueCard, { type IssueDragData } from './IssueCard.svelte';
  import { isValidTransition, type BeadStatus } from '$lib/bead-lifecycle';

  export interface ColumnDropData {
    issueId: string;
    fromStatus: string;
    toStatus: string;
  }

  let { title, status, issues, recentlyChanged = new Set(), onissueclick, ondrop }: {
    title: string;
    status: string;
    issues: Issue[];
    recentlyChanged?: Set<string>;
    onissueclick?: (issueId: string) => void;
    ondrop?: (data: ColumnDropData) => void;
  } = $props();

  let isDragOver = $state(false);
  let isValidDrop = $state(false);
  let draggedFromStatus = $state<string | null>(null);

  const statusColors: Record<string, string> = {
    open: '#3b82f6',
    ready: '#8b5cf6',
    in_progress: '#f59e0b',
    in_review: '#06b6d4',
    blocked: '#ef4444',
    closed: '#22c55e',
    deferred: '#8b5cf6',
  };

  const statusBackgrounds: Record<string, string> = {
    open: '#f8fafc',
    ready: '#faf5ff',
    in_progress: '#fffbeb',
    in_review: '#ecfeff',
    blocked: '#fef2f2',
    closed: '#f0fdf4',
    deferred: '#faf5ff',
  };

  let filteredIssues = $derived(issues.filter(i => i.status === status));
  let color = $derived(statusColors[status] || '#6c7086');
  let bgColor = $derived(statusBackgrounds[status] || '#fafafa');

  function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer) return;

    // Check if it's an issue being dragged
    const types = event.dataTransfer.types;
    if (!types.includes('application/json')) return;

    // Get the drag data to check validity
    // Note: We can't read the data during dragover due to browser security,
    // but we stored the fromStatus in state during dragenter
    if (draggedFromStatus && draggedFromStatus !== status) {
      const valid = isValidTransition(draggedFromStatus as BeadStatus, status as BeadStatus);
      isValidDrop = valid;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = isValidDrop ? 'move' : 'none';
    isDragOver = true;
  }

  function handleDragEnter(event: DragEvent) {
    if (!event.dataTransfer) return;

    // Try to peek at the data type
    const types = event.dataTransfer.types;
    if (!types.includes('application/json')) return;

    isDragOver = true;

    // We'll validate properly on drop since we can't read data during dragenter
    // For now, we show a neutral highlight
  }

  function handleDragLeave(event: DragEvent) {
    // Only reset if we're leaving the column entirely
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget && event.currentTarget instanceof HTMLElement) {
      if (event.currentTarget.contains(relatedTarget)) {
        return;
      }
    }
    isDragOver = false;
    isValidDrop = false;
    draggedFromStatus = null;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    isValidDrop = false;
    draggedFromStatus = null;

    if (!event.dataTransfer) return;

    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json')) as IssueDragData;

      if (data.type !== 'issue') return;

      // Don't allow drop on same column
      if (data.currentStatus === status) return;

      // Call parent handler with drop data
      ondrop?.({
        issueId: data.issueId,
        fromStatus: data.currentStatus,
        toStatus: status
      });
    } catch (e) {
      console.error('[KanbanColumn] Failed to parse drop data:', e);
    }
  }

  // Listen for custom event to set dragged status (workaround for browser security)
  $effect(() => {
    function handleDragStatusBroadcast(e: CustomEvent<{ fromStatus: string }>) {
      draggedFromStatus = e.detail.fromStatus;
      if (draggedFromStatus !== status) {
        isValidDrop = isValidTransition(draggedFromStatus as BeadStatus, status as BeadStatus);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('issuedragstart' as any, handleDragStatusBroadcast);
      return () => window.removeEventListener('issuedragstart' as any, handleDragStatusBroadcast);
    }
  });
</script>

<div
  class="kanban-column"
  class:is-drag-over={isDragOver}
  class:is-valid-drop={isDragOver && isValidDrop}
  class:is-invalid-drop={isDragOver && !isValidDrop && draggedFromStatus !== null}
  ondragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="column-header" style="border-color: {color}">
    <h2 style="color: {color}">{title}</h2>
    <span class="count">{filteredIssues.length}</span>
  </div>

  <div class="column-content" style="background: {bgColor}">
    {#each filteredIssues as issue (issue.id)}
      <IssueCard {issue} isNew={recentlyChanged.has(issue.id)} onclick={onissueclick} />
    {/each}

    {#if filteredIssues.length === 0}
      <div class="empty-state">
        {#if isDragOver && isValidDrop}
          Drop here
        {:else}
          No issues
        {/if}
      </div>
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
    transition: all 0.2s ease;
    border: 2px solid transparent;
  }

  .kanban-column.is-drag-over {
    transform: scale(1.01);
  }

  .kanban-column.is-valid-drop {
    border-color: #22c55e;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2), 0 4px 12px rgba(34, 197, 94, 0.1);
  }

  .kanban-column.is-valid-drop .column-content {
    background: #f0fdf4 !important;
  }

  .kanban-column.is-invalid-drop {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2), 0 4px 12px rgba(239, 68, 68, 0.1);
  }

  .kanban-column.is-invalid-drop .column-content {
    background: #fef2f2 !important;
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
    transition: background 0.2s ease;
  }

  .empty-state {
    text-align: center;
    color: #888888;
    padding: 24px;
    font-size: 13px;
  }

  .is-valid-drop .empty-state {
    color: #22c55e;
    font-weight: 500;
  }
</style>
