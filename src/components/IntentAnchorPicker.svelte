<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IntentSection, IntentAnchorInfo } from '$lib/intent/types';

  /**
   * IntentAnchorPicker - Dropdown picker for linking beads to intent anchors
   *
   * Features:
   * - Multi-select with checkboxes
   * - Search/filter functionality
   * - Shows anchor preview text from section content
   * - Positions to avoid covering chat input
   */

  interface AnchorWithPreview {
    path: string;
    line: number;
    previewText?: string;
  }

  interface Props {
    projectId: string;
    selected: string[];         // Array of anchor paths currently linked
    onselect: (anchors: string[]) => void;
    trigger?: 'button' | 'link';  // Default 'button'
    placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  }

  let {
    projectId,
    selected = [],
    onselect,
    trigger = 'button',
    placement = 'bottom-start'
  }: Props = $props();

  // State
  let open = $state(false);
  let anchors = $state<AnchorWithPreview[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let localSelected = $state<string[]>([...selected]);
  let pickerRef = $state<HTMLDivElement | null>(null);

  // Filtered anchors based on search
  const filteredAnchors = $derived(
    searchQuery.trim()
      ? anchors.filter(a =>
          a.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.previewText?.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : anchors
  );

  // Track changes from selection prop
  $effect(() => {
    if (!open) {
      localSelected = [...selected];
    }
  });

  /**
   * Extract preview text from a section's content
   */
  function extractPreviewText(content: string, maxLength: number = 100): string {
    if (!content) return '';

    // Remove markdown formatting and get plain text
    const plainText = content
      .replace(/\{#anchor:[^}]+\}/g, '')  // Remove anchor syntax
      .replace(/[#*_`\[\]()]/g, '')        // Remove markdown chars
      .replace(/\s+/g, ' ')                // Normalize whitespace
      .trim();

    if (plainText.length <= maxLength) return plainText;

    // Truncate at word boundary
    const truncated = plainText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  /**
   * Find section content for an anchor path
   */
  function findSectionContent(sections: IntentSection[], anchorPath: string): string | undefined {
    for (const section of sections) {
      // Check if this section has a matching anchor
      if (section.anchor === anchorPath) {
        return section.content;
      }

      // Check if section ID matches (for auto-generated anchors)
      if (section.id === anchorPath || section.id === anchorPath.split('.').pop()) {
        return section.content;
      }

      // Recursively check children
      const childContent = findSectionContent(section.children, anchorPath);
      if (childContent) return childContent;
    }
    return undefined;
  }

  /**
   * Load anchors from the intent API
   */
  async function loadAnchors() {
    if (anchors.length > 0) return;  // Already loaded

    loading = true;
    error = null;

    try {
      const res = await fetch(`/api/projects/${projectId}/intent`);

      if (!res.ok) {
        if (res.status === 404) {
          error = 'No PROJECT_INTENT.md found';
        } else {
          error = 'Failed to load intent';
        }
        return;
      }

      const data = await res.json();
      const rawAnchors: IntentAnchorInfo[] = data.intent?.anchors || [];
      const sections: IntentSection[] = data.intent?.sections || [];

      // Map anchors with preview text extracted from sections
      anchors = rawAnchors.map(anchor => {
        const sectionContent = findSectionContent(sections, anchor.path);
        return {
          path: anchor.path,
          line: anchor.line,
          previewText: sectionContent ? extractPreviewText(sectionContent) : undefined
        };
      });

    } catch (e) {
      console.error('Failed to load anchors:', e);
      error = 'Network error loading intent';
    } finally {
      loading = false;
    }
  }

  function toggleOpen() {
    open = !open;
    if (open) {
      loadAnchors();
      localSelected = [...selected];
      searchQuery = '';
    }
  }

  function toggleAnchor(path: string) {
    if (localSelected.includes(path)) {
      localSelected = localSelected.filter(p => p !== path);
    } else {
      localSelected = [...localSelected, path];
    }
  }

  function selectAll() {
    localSelected = filteredAnchors.map(a => a.path);
  }

  function clearAll() {
    localSelected = [];
  }

  function applySelection() {
    onselect(localSelected);
    open = false;
  }

  function handleCancel() {
    localSelected = [...selected];  // Reset to original
    open = false;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (pickerRef && !pickerRef.contains(target)) {
      open = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
    }
  }

  onMount(() => {
    // Add global listeners when component mounts
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  // Manage click outside listener based on open state
  $effect(() => {
    if (open) {
      // Delay adding listener to avoid immediate close from trigger click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleKeydown);
      }, 0);
    } else {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    }
  });

  // Check if selection has changed
  const hasChanges = $derived(
    localSelected.length !== selected.length ||
    localSelected.some(p => !selected.includes(p))
  );
</script>

<div class="anchor-picker" class:open bind:this={pickerRef}>
  {#if trigger === 'button'}
    <button class="picker-trigger" onclick={toggleOpen} type="button">
      <Icon name="link" size={14} />
      <span>Link Intent</span>
      {#if selected.length > 0}
        <span class="selected-count">{selected.length}</span>
      {/if}
    </button>
  {:else}
    <button class="picker-trigger link-style" onclick={toggleOpen} type="button">
      {#if selected.length > 0}
        {selected.length} anchor{selected.length > 1 ? 's' : ''} linked
      {:else}
        Link to intent
      {/if}
    </button>
  {/if}

  {#if open}
    <div
      class="picker-dropdown"
      class:bottom-end={placement === 'bottom-end'}
      class:top-start={placement === 'top-start'}
      class:top-end={placement === 'top-end'}
    >
      <div class="picker-header">
        <div class="search-wrapper">
          <Icon name="search" size={14} />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search anchors..."
            class="search-input"
          />
          {#if searchQuery}
            <button
              class="clear-search"
              onclick={() => searchQuery = ''}
              type="button"
              aria-label="Clear search"
            >
              <Icon name="x" size={12} />
            </button>
          {/if}
        </div>

        {#if anchors.length > 0}
          <div class="header-actions">
            <button
              class="action-link"
              onclick={selectAll}
              type="button"
              disabled={filteredAnchors.length === 0}
            >
              Select all
            </button>
            <span class="divider">|</span>
            <button
              class="action-link"
              onclick={clearAll}
              type="button"
              disabled={localSelected.length === 0}
            >
              Clear
            </button>
          </div>
        {/if}
      </div>

      <div class="picker-list">
        {#if loading}
          <div class="loading">
            <Icon name="loader" size={16} />
            <span>Loading anchors...</span>
          </div>
        {:else if error}
          <div class="error">
            <Icon name="alert-circle" size={16} />
            <span>{error}</span>
          </div>
        {:else if anchors.length === 0}
          <div class="empty">
            <Icon name="file-text" size={20} />
            <p>No anchors defined</p>
            <p class="hint">Add {'{#anchor:name}'} in PROJECT_INTENT.md</p>
          </div>
        {:else if filteredAnchors.length === 0}
          <div class="empty">
            <Icon name="search" size={20} />
            <p>No matching anchors</p>
            <p class="hint">Try a different search term</p>
          </div>
        {:else}
          {#each filteredAnchors as anchor (anchor.path)}
            <label class="anchor-item" class:selected={localSelected.includes(anchor.path)}>
              <input
                type="checkbox"
                checked={localSelected.includes(anchor.path)}
                onchange={() => toggleAnchor(anchor.path)}
              />
              <div class="anchor-info">
                <code class="anchor-path">{anchor.path}</code>
                {#if anchor.previewText}
                  <p class="anchor-preview">{anchor.previewText}</p>
                {/if}
              </div>
            </label>
          {/each}
        {/if}
      </div>

      <div class="picker-footer">
        <span class="selection-summary">
          {localSelected.length} of {anchors.length} selected
        </span>
        <div class="footer-actions">
          <button class="btn-cancel" onclick={handleCancel} type="button">
            Cancel
          </button>
          <button
            class="btn-apply"
            onclick={applySelection}
            type="button"
            disabled={!hasChanges && selected.length === localSelected.length}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .anchor-picker {
    position: relative;
    display: inline-block;
  }

  .picker-trigger {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: var(--bg-secondary, #252525);
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    color: var(--text-secondary, #aaa);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .picker-trigger:hover {
    background: var(--bg-hover, #333);
    color: var(--text-primary, #fff);
  }

  .picker-trigger.link-style {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent-color, #3b82f6);
    text-decoration: underline;
    font-size: 0.8rem;
  }

  .picker-trigger.link-style:hover {
    color: var(--accent-color-hover, #60a5fa);
  }

  .selected-count {
    background: var(--accent-color, #3b82f6);
    color: white;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    min-width: 1.25rem;
    text-align: center;
  }

  .picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.375rem;
    width: 320px;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border-color, #444);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: dropdownIn 0.15s ease-out;
    display: flex;
    flex-direction: column;
    max-height: 400px;
  }

  .picker-dropdown.bottom-end {
    left: auto;
    right: 0;
  }

  .picker-dropdown.top-start {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: 0.375rem;
  }

  .picker-dropdown.top-end {
    top: auto;
    bottom: 100%;
    left: auto;
    right: 0;
    margin-top: 0;
    margin-bottom: 0.375rem;
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

  .picker-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color, #333);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .search-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-primary, #1a1a1a);
    border: 1px solid var(--border-color, #333);
    border-radius: 4px;
    color: var(--text-tertiary, #666);
  }

  .search-wrapper:focus-within {
    border-color: var(--accent-color, #3b82f6);
    color: var(--text-secondary, #aaa);
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary, #fff);
    font-size: 0.875rem;
    outline: none;
    min-width: 0;
  }

  .search-input::placeholder {
    color: var(--text-tertiary, #666);
  }

  .clear-search {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    background: none;
    border: none;
    color: var(--text-tertiary, #666);
    cursor: pointer;
    border-radius: 2px;
  }

  .clear-search:hover {
    color: var(--text-secondary, #aaa);
    background: var(--bg-hover, #333);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .action-link {
    background: none;
    border: none;
    color: var(--accent-color, #3b82f6);
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }

  .action-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .action-link:disabled {
    color: var(--text-tertiary, #666);
    cursor: not-allowed;
  }

  .divider {
    color: var(--text-tertiary, #666);
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    min-height: 100px;
    max-height: 280px;
  }

  .anchor-item {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .anchor-item:hover {
    background: var(--bg-hover, #333);
  }

  .anchor-item.selected {
    background: rgba(59, 130, 246, 0.1);
  }

  .anchor-item input[type="checkbox"] {
    margin-top: 0.125rem;
    accent-color: var(--accent-color, #3b82f6);
    cursor: pointer;
    flex-shrink: 0;
  }

  .anchor-info {
    flex: 1;
    min-width: 0;
  }

  .anchor-path {
    font-size: 0.75rem;
    color: var(--accent-color, #3b82f6);
    font-family: var(--font-mono, 'SF Mono', 'Consolas', monospace);
    word-break: break-all;
  }

  .anchor-preview {
    margin: 0.25rem 0 0 0;
    font-size: 0.7rem;
    color: var(--text-tertiary, #888);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    border-top: 1px solid var(--border-color, #333);
    background: var(--bg-secondary, #252525);
  }

  .selection-summary {
    font-size: 0.7rem;
    color: var(--text-tertiary, #666);
  }

  .footer-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-cancel, .btn-apply {
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .btn-cancel {
    background: none;
    border: 1px solid var(--border-color, #444);
    color: var(--text-secondary, #aaa);
  }

  .btn-cancel:hover {
    background: var(--bg-hover, #333);
    color: var(--text-primary, #fff);
  }

  .btn-apply {
    background: var(--accent-color, #3b82f6);
    border: none;
    color: white;
  }

  .btn-apply:hover:not(:disabled) {
    background: var(--accent-color-hover, #2563eb);
  }

  .btn-apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading, .error, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-tertiary, #666);
    gap: 0.5rem;
  }

  .loading {
    flex-direction: row;
    font-size: 0.8rem;
  }

  .loading :global(svg) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .error {
    color: var(--error-color, #ef4444);
  }

  .error span {
    font-size: 0.8rem;
  }

  .empty p {
    margin: 0;
    font-size: 0.8rem;
  }

  .empty .hint {
    font-size: 0.7rem;
    color: var(--text-tertiary, #555);
  }
</style>
