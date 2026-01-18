<script lang="ts">
  import type { Issue } from '$lib/types';
  import Icon from './Icon.svelte';

  let {
    isOpen,
    issue,
    descendants = [],
    isDeleting = false,
    onconfirm,
    oncancel
  }: {
    isOpen: boolean;
    issue: Issue | null;
    descendants?: Issue[];
    isDeleting?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !isDeleting) {
      oncancel();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !isDeleting) {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && issue}
  <div class="modal-overlay" onclick={handleBackdropClick} role="presentation">
    <div class="modal">
      <div class="modal-header">
        <div class="warning-icon">
          <Icon name="alert-triangle" size={24} />
        </div>
        <h2>Delete {issue.issue_type === 'epic' ? 'Epic' : 'Task'}?</h2>
      </div>

      <div class="modal-content">
        <div class="issue-preview">
          <span class="issue-id">{issue.id}</span>
          <span class="issue-title">{issue.title}</span>
        </div>

        {#if descendants.length > 0}
          <div class="descendants-section">
            <p class="descendants-warning">
              <Icon name="alert-circle" size={16} />
              This will also delete {descendants.length} child {descendants.length === 1 ? 'task' : 'tasks'}:
            </p>
            <div class="descendants-list">
              {#each descendants as descendant (descendant.id)}
                <div class="descendant-item">
                  <span class="descendant-id">{descendant.id}</span>
                  <span class="descendant-title">{descendant.title}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="permanent-warning">
          <Icon name="x-circle" size={18} />
          <span>This action is <strong>permanent</strong> and cannot be undone.</span>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={oncancel} disabled={isDeleting}>
          Cancel
        </button>
        <button class="btn-delete" onclick={onconfirm} disabled={isDeleting}>
          {#if isDeleting}
            <Icon name="loader" size={16} />
            Deleting...
          {:else}
            <Icon name="trash-2" size={16} />
            Delete {descendants.length > 0 ? `${1 + descendants.length} items` : ''}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: #ffffff;
    border-radius: 16px;
    width: 480px;
    max-width: 90vw;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    border-bottom: 1px solid #eaeaea;
  }

  .warning-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: #fef2f2;
    border-radius: 10px;
    color: #dc2626;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .modal-content {
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
  }

  .issue-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: #f8f8f8;
    border-radius: 10px;
    margin-bottom: 16px;
  }

  .issue-id {
    font-family: monospace;
    font-size: 12px;
    color: #888888;
    flex-shrink: 0;
  }

  .issue-title {
    font-size: 14px;
    color: #1a1a1a;
    font-weight: 500;
  }

  .descendants-section {
    margin-bottom: 16px;
  }

  .descendants-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #d97706;
    font-weight: 500;
  }

  .descendants-list {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #f0f0f0;
    border-radius: 8px;
  }

  .descendant-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .descendant-item:last-child {
    border-bottom: none;
  }

  .descendant-id {
    font-family: monospace;
    font-size: 11px;
    color: #888888;
    flex-shrink: 0;
  }

  .descendant-title {
    font-size: 13px;
    color: #4b5563;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .permanent-warning {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 10px;
    color: #dc2626;
    font-size: 14px;
  }

  .permanent-warning strong {
    font-weight: 600;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #eaeaea;
    background: #fafafa;
  }

  .btn-cancel,
  .btn-delete {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
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

  .btn-delete {
    background: #dc2626;
    border: 1px solid #dc2626;
    color: #ffffff;
  }

  .btn-delete:hover:not(:disabled) {
    background: #b91c1c;
    border-color: #b91c1c;
  }

  .btn-cancel:disabled,
  .btn-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .btn-delete :global(.icon) {
    animation: none;
  }

  .btn-delete:disabled :global(.icon) {
    animation: spin 1s linear infinite;
  }
</style>
