<script lang="ts">
  import Icon from './Icon.svelte';

  export interface ColumnConfig {
    title: string;
    status: string;
  }

  let { columns, hiddenColumns = new Set(), onchange }: {
    columns: ColumnConfig[];
    hiddenColumns: Set<string>;
    onchange?: (hiddenColumns: Set<string>) => void;
  } = $props();

  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Status colors for visual indication
  const statusColors: Record<string, string> = {
    open: '#3b82f6',
    ready: '#8b5cf6',
    in_progress: '#f59e0b',
    in_review: '#06b6d4',
    blocked: '#ef4444',
    closed: '#22c55e',
    deferred: '#6b7280',
  };

  let visibleCount = $derived(columns.length - hiddenColumns.size);

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function toggleColumn(status: string) {
    const newHidden = new Set(hiddenColumns);
    if (newHidden.has(status)) {
      newHidden.delete(status);
    } else {
      // Don't allow hiding all columns
      if (newHidden.size >= columns.length - 1) return;
      newHidden.add(status);
    }
    onchange?.(newHidden);
  }

  function showAll() {
    onchange?.(new Set());
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen && typeof window !== 'undefined') {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="column-visibility" bind:this={dropdownRef}>
  <button
    class="toggle-btn"
    class:has-hidden={hiddenColumns.size > 0}
    onclick={toggleDropdown}
    title="Configure visible columns"
  >
    <Icon name="columns" size={16} />
    <span>Columns</span>
    {#if hiddenColumns.size > 0}
      <span class="hidden-count">{visibleCount}/{columns.length}</span>
    {/if}
    <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} />
  </button>

  {#if isOpen}
    <div class="dropdown">
      <div class="dropdown-header">
        <span>Show columns</span>
        {#if hiddenColumns.size > 0}
          <button class="show-all-btn" onclick={showAll}>
            Show all
          </button>
        {/if}
      </div>
      <div class="dropdown-list">
        {#each columns as column}
          {@const isVisible = !hiddenColumns.has(column.status)}
          {@const isLastVisible = isVisible && hiddenColumns.size === columns.length - 1}
          <button
            class="column-item"
            class:is-visible={isVisible}
            class:is-disabled={isLastVisible}
            onclick={() => toggleColumn(column.status)}
            disabled={isLastVisible}
            title={isLastVisible ? 'At least one column must be visible' : ''}
          >
            <span class="column-color" style="background: {statusColors[column.status] || '#6b7280'}"></span>
            <span class="column-name">{column.title}</span>
            <span class="visibility-icon">
              {#if isVisible}
                <Icon name="eye" size={14} />
              {:else}
                <Icon name="eye-off" size={14} />
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .column-visibility {
    position: relative;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .toggle-btn:hover {
    background: #f5f5f5;
    border-color: #d1d5db;
    color: #374151;
  }

  .toggle-btn.has-hidden {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }

  .toggle-btn.has-hidden:hover {
    background: #fde68a;
    border-color: #f59e0b;
  }

  .hidden-count {
    font-size: 10px;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.1);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    min-width: 220px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
    z-index: 100;
    overflow: hidden;
    animation: dropdownIn 0.15s ease-out;
  }

  @keyframes dropdownIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid #f3f4f6;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .show-all-btn {
    padding: 4px 8px;
    background: #eff6ff;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #3b82f6;
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: none;
    letter-spacing: normal;
  }

  .show-all-btn:hover {
    background: #dbeafe;
    color: #2563eb;
  }

  .dropdown-list {
    padding: 8px;
  }

  .column-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
    text-align: left;
  }

  .column-item:hover:not(:disabled) {
    background: #f9fafb;
  }

  .column-item.is-visible {
    color: #111827;
  }

  .column-item:not(.is-visible) {
    color: #9ca3af;
  }

  .column-item:not(.is-visible) .column-color {
    opacity: 0.4;
  }

  .column-item.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .column-color {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .column-name {
    flex: 1;
  }

  .visibility-icon {
    display: flex;
    align-items: center;
    color: #9ca3af;
  }

  .column-item.is-visible .visibility-icon {
    color: #22c55e;
  }
</style>
