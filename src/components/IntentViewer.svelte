<script lang="ts">
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import Icon from './Icon.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';
  import type {
    IntentSection,
    IntentAnchorInfo,
    IntentGetResponse
  } from '$lib/intent/types';

  interface Props {
    projectId: string;
    open?: boolean;
    highlightAnchor?: string; // Anchor to highlight/scroll to
    onclose?: () => void;
  }

  let { projectId, open = false, highlightAnchor, onclose }: Props = $props();

  // State
  let intent = $state<IntentGetResponse['intent'] | null>(null);
  let cacheInfo = $state<IntentGetResponse['cache'] | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let editMode = $state(false);
  let editContent = $state('');
  let saving = $state(false);
  let reindexing = $state(false);

  // Track visibility separately to allow close animation
  let visible = $state(false);
  let animating = $state(false);

  // Resizable width
  const MIN_WIDTH = 420;
  const MAX_WIDTH = 900;
  let sheetWidth = $state(560);
  let isResizing = $state(false);
  let justFinishedResizing = $state(false);

  // Load intent
  async function loadIntent() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/projects/${projectId}/intent`);
      if (!res.ok) {
        const err = await res.json();
        if (err.error === 'intent_not_found') {
          // No intent file yet - allow creating one
          intent = null;
          cacheInfo = null;
        } else {
          throw new Error(err.message || 'Failed to load intent');
        }
      } else {
        const data: IntentGetResponse = await res.json();
        intent = data.intent;
        cacheInfo = data.cache;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  // Reindex
  async function reindex() {
    reindexing = true;
    error = null;
    try {
      const res = await fetch(`/api/projects/${projectId}/intent/reindex`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Reindex failed');
      }
      await loadIntent();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Reindex failed';
    } finally {
      reindexing = false;
    }
  }

  // Save edits
  async function saveIntent() {
    saving = true;
    error = null;
    try {
      const res = await fetch(`/api/projects/${projectId}/intent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Save failed');
      }
      editMode = false;
      await loadIntent();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Save failed';
    } finally {
      saving = false;
    }
  }

  // Enter edit mode
  function startEdit() {
    editContent = formatIntentToMarkdown(intent);
    editMode = true;
  }

  // Cancel edit mode
  function cancelEdit() {
    editMode = false;
    editContent = '';
    error = null;
  }

  // Format intent back to markdown
  function formatIntentToMarkdown(intentData: IntentGetResponse['intent'] | null): string {
    if (!intentData || !intentData.sections.length) {
      return '# Project Intent\n\nDescribe your project goals and technical decisions here.\n';
    }
    // Build markdown from sections
    return intentData.sections.map((s) => formatSection(s, 1)).join('\n\n');
  }

  function formatSection(section: IntentSection, level: number): string {
    const hashes = '#'.repeat(Math.min(level, 6));
    const anchor = section.anchor ? ` {#anchor:${section.anchor}}` : '';
    let md = `${hashes} ${section.heading}${anchor}`;
    if (section.content.trim()) {
      md += '\n\n' + section.content;
    }
    if (section.children?.length) {
      md += '\n\n' + section.children.map((c) => formatSection(c, level + 1)).join('\n\n');
    }
    return md;
  }

  // Render section content as HTML
  function renderContent(content: string): string {
    if (!content.trim()) return '';
    try {
      return marked(content) as string;
    } catch {
      return content;
    }
  }

  // Scroll to anchor
  function scrollToAnchor(anchorPath: string) {
    const el = document.querySelector(`[data-anchor="${anchorPath}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-pulse');
      setTimeout(() => el.classList.remove('highlight-pulse'), 2000);
    }
  }

  // Animation effects
  $effect(() => {
    if (open) {
      visible = true;
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        animating = true;
      });
    } else if (visible) {
      animating = false;
      // Wait for animation to complete before hiding
      setTimeout(() => {
        visible = false;
      }, 300);
    }
  });

  // Load intent when opened
  $effect(() => {
    if (open && !intent && !loading && !error) {
      loadIntent();
    }
  });

  // Scroll to highlight anchor when data is loaded
  $effect(() => {
    if (highlightAnchor && intent && !loading) {
      setTimeout(() => scrollToAnchor(highlightAnchor), 300);
    }
  });

  // Load intent on mount if already open
  onMount(() => {
    if (open) loadIntent();
  });

  // Resize handlers
  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  function handleResize(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    sheetWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
  }

  function stopResize() {
    isResizing = false;
    justFinishedResizing = true;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !justFinishedResizing) {
      onclose?.();
    }
    justFinishedResizing = false;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
</script>

{#if visible}
  <div
    class="sheet-overlay"
    class:open={animating}
    onclick={handleBackdropClick}
    role="presentation"
  >
    <aside
      class="intent-viewer"
      class:open={animating}
      class:resizing={isResizing}
      style="width: {sheetWidth}px"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        class="resize-handle"
        onmousedown={startResize}
        role="separator"
        aria-orientation="vertical"
      ></div>

      <header class="viewer-header">
        <div class="header-top">
          <h2>Project Intent</h2>
          <div class="header-actions">
            {#if !editMode}
              <button
                class="btn-icon"
                onclick={startEdit}
                title="Edit"
                disabled={loading || reindexing}
              >
                <Icon name="edit-2" size={18} />
              </button>
              <button
                class="btn-icon"
                onclick={reindex}
                title="Reindex from file"
                disabled={loading || reindexing || !intent}
              >
                <Icon name="refresh-cw" size={18} class={reindexing ? 'spinning' : ''} />
              </button>
            {/if}
            <button class="btn-icon close-btn" onclick={() => onclose?.()} title="Close">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
        {#if cacheInfo}
          <div class="cache-info">
            Last indexed: {formatDate(cacheInfo.indexedAt)}
            {#if cacheInfo.isStale}
              <span class="stale-badge">Stale</span>
            {/if}
          </div>
        {/if}
      </header>

      <div class="viewer-content">
        {#if loading}
          <div class="loading-state">
            <Icon name="loader" size={24} class="spinning" />
            <span>Loading intent...</span>
          </div>
        {:else if error}
          <div class="error-state">
            <Icon name="alert-circle" size={24} />
            <span>{error}</span>
            <button class="btn-retry" onclick={loadIntent}>Retry</button>
          </div>
        {:else if editMode}
          <div class="edit-mode">
            <MarkdownEditor
              value={editContent}
              onchange={(val) => (editContent = val)}
              placeholder="Enter project intent (markdown supported)..."
            />
            <div class="edit-actions">
              <button class="btn-cancel" onclick={cancelEdit} disabled={saving}>Cancel</button>
              <button class="btn-save" onclick={saveIntent} disabled={saving}>
                {#if saving}
                  <Icon name="loader" size={16} class="spinning" />
                  Saving...
                {:else}
                  <Icon name="check" size={16} />
                  Save
                {/if}
              </button>
            </div>
          </div>
        {:else if intent && intent.sections.length > 0}
          <div class="intent-content">
            {#each intent.sections as section (section.id)}
              {@render renderSection(section, 1)}
            {/each}
          </div>

          {#if intent.anchors.length > 0}
            <div class="anchors-section">
              <h4 class="anchors-title">
                <Icon name="anchor" size={14} />
                Anchors ({intent.anchors.length})
              </h4>
              <div class="anchors-list">
                {#each intent.anchors as anchor (anchor.path)}
                  <button
                    class="anchor-item"
                    onclick={() => scrollToAnchor(anchor.path)}
                    title="Jump to anchor"
                  >
                    <span class="anchor-path">{anchor.path}</span>
                    <span class="anchor-line">L{anchor.line}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty-state">
            <Icon name="file-text" size={40} />
            <p>No PROJECT_INTENT.md found.</p>
            <p class="empty-hint">Create an intent document to define your project's goals and technical decisions.</p>
            <button class="btn-create" onclick={startEdit}>
              <Icon name="plus" size={16} />
              Create Intent
            </button>
          </div>
        {/if}
      </div>
    </aside>
  </div>
{/if}

{#snippet renderSection(section: IntentSection, level: number)}
  <section class="intent-section" data-anchor={section.anchor || ''} data-level={level}>
    <div class="section-header">
      {#if level === 1}
        <h3 class="section-heading">{section.heading}</h3>
      {:else if level === 2}
        <h4 class="section-heading">{section.heading}</h4>
      {:else}
        <h5 class="section-heading">{section.heading}</h5>
      {/if}
      {#if section.anchor}
        <span class="anchor-badge" title="Anchor: {section.anchor}">
          <Icon name="anchor" size={10} />
          {section.anchor}
        </span>
      {/if}
    </div>
    {#if section.content.trim()}
      <div class="section-content">
        {@html renderContent(section.content)}
      </div>
    {/if}
    {#if section.children?.length}
      <div class="section-children">
        {#each section.children as child (child.id)}
          {@render renderSection(child, level + 1)}
        {/each}
      </div>
    {/if}
  </section>
{/snippet}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .sheet-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }

  .intent-viewer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    min-width: 420px;
    max-width: 90vw;
    background: #ffffff;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
  }

  .intent-viewer.open {
    transform: translateX(0);
  }

  .intent-viewer.resizing {
    transition: none;
    user-select: none;
  }

  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    background: transparent;
    transition: background 0.15s ease;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: rgba(0, 0, 0, 0.08);
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 40px;
    background: #d0d0d0;
    border-radius: 1px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .resize-handle:hover::after {
    opacity: 1;
  }

  .viewer-header {
    padding: 16px 20px;
    border-bottom: 1px solid #eaeaea;
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .viewer-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #888888;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .btn-icon:hover:not(:disabled) {
    background: #f5f5f5;
    color: #1a1a1a;
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn:hover:not(:disabled) {
    background: #fef2f2;
    color: #dc2626;
  }

  .cache-info {
    margin-top: 8px;
    font-size: 12px;
    color: #888888;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stale-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: #fef3c7;
    color: #d97706;
    border-radius: 4px;
    font-weight: 500;
  }

  .viewer-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 20px;
    text-align: center;
    color: #888888;
  }

  .error-state {
    color: #dc2626;
  }

  .empty-state {
    color: #666666;
  }

  .empty-hint {
    font-size: 13px;
    color: #888888;
    max-width: 280px;
  }

  .btn-retry {
    margin-top: 8px;
    padding: 8px 16px;
    background: #f5f5f5;
    border: none;
    border-radius: 6px;
    color: #1a1a1a;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-retry:hover {
    background: #e8e8e8;
  }

  .btn-create {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 10px 18px;
    background: #2563eb;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-create:hover {
    background: #1d4ed8;
  }

  /* Edit mode */
  .edit-mode {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .edit-mode :global(.markdown-editor) {
    flex: 1;
  }

  .edit-mode :global(.editor-content) {
    height: calc(100vh - 280px);
  }

  .edit-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding-top: 16px;
    border-top: 1px solid #eaeaea;
    margin-top: 16px;
  }

  .btn-cancel,
  .btn-save {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-cancel {
    background: #ffffff;
    border: 1px solid #e0e0e0;
    color: #4b5563;
  }

  .btn-cancel:hover:not(:disabled) {
    background: #f5f5f5;
    border-color: #d0d0d0;
  }

  .btn-save {
    background: #2563eb;
    border: 1px solid #2563eb;
    color: #ffffff;
  }

  .btn-save:hover:not(:disabled) {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Intent content */
  .intent-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .intent-section {
    padding: 0;
  }

  .intent-section[data-level='2'],
  .intent-section[data-level='3'],
  .intent-section[data-level='4'],
  .intent-section[data-level='5'] {
    padding-left: 16px;
    border-left: 2px solid #eaeaea;
    margin-top: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .section-heading {
    margin: 0;
    font-family: 'Figtree', sans-serif;
    font-weight: 600;
    color: #1a1a1a;
  }

  h3.section-heading {
    font-size: 16px;
  }

  h4.section-heading {
    font-size: 14px;
  }

  h5.section-heading {
    font-size: 13px;
  }

  .anchor-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    padding: 2px 8px;
    background: #dbeafe;
    color: #2563eb;
    border-radius: 4px;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-weight: 500;
  }

  .section-content {
    font-size: 14px;
    line-height: 1.6;
    color: #4b5563;
  }

  .section-content :global(p) {
    margin: 0 0 12px 0;
  }

  .section-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .section-content :global(ul),
  .section-content :global(ol) {
    margin: 0 0 12px 0;
    padding-left: 20px;
  }

  .section-content :global(li) {
    margin-bottom: 4px;
  }

  .section-content :global(code) {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 0.9em;
  }

  .section-content :global(pre) {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 12px 0;
  }

  .section-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .section-content :global(blockquote) {
    margin: 0 0 12px 0;
    padding-left: 14px;
    border-left: 3px solid #e0e0e0;
    color: #666666;
  }

  .section-content :global(a) {
    color: #2563eb;
    text-decoration: none;
  }

  .section-content :global(a:hover) {
    text-decoration: underline;
  }

  .section-children {
    margin-top: 16px;
  }

  /* Anchors section */
  .anchors-section {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #eaeaea;
  }

  .anchors-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: #666666;
    font-family: 'Figtree', sans-serif;
  }

  .anchors-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .anchor-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f8f8f8;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: inherit;
  }

  .anchor-item:hover {
    background: #f0f0f0;
  }

  .anchor-path {
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 12px;
    color: #2563eb;
  }

  .anchor-line {
    font-size: 11px;
    color: #888888;
  }

  /* Highlight pulse animation */
  :global(.highlight-pulse) {
    animation: pulse 2s ease-out;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
    }
    70% {
      box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
    }
  }

  /* Spinning animation for loaders */
  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 480px) {
    .intent-viewer {
      width: 100vw !important;
      min-width: 100vw;
    }
  }
</style>
