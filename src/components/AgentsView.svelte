<script lang="ts">
  import type { Agent, Issue } from '$lib/types';
  import AgentCard from './AgentCard.svelte';
  import Icon from './Icon.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';
  import { PLANNER_AGENT_FILENAME } from '$lib/beads-instructions';

  let { agents = [], issues = [], hasAgentsDir = false, loading = false, projectId, onagentclick, onagentschange, onopenchat }: {
    agents?: Agent[];
    issues?: Issue[];
    hasAgentsDir?: boolean;
    loading?: boolean;
    projectId: string;
    onagentclick?: (agent: Agent) => void;
    onagentschange?: () => void;
    onopenchat?: () => void;
  } = $props();

  // Modal state
  let showCreateModal = $state(false);
  let showDeleteModal = $state(false);
  let agentToDelete = $state<Agent | null>(null);
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  // Form state
  let newAgentName = $state('');
  let newAgentDescription = $state('');
  let newAgentModel = $state<'opus' | 'sonnet' | 'haiku'>('sonnet');
  let newAgentColor = $state('blue');
  let newAgentPrompt = $state('');

  const colors = ['blue', 'orange', 'green', 'purple', 'red', 'yellow', 'pink', 'cyan', 'gray'];

  // Calculate task count for each agent based on assignee field
  function getTaskCount(agentName: string): number {
    return issues.filter(i => i.assignee === agentName).length;
  }

  // Check if an agent is the built-in planner (cannot be deleted)
  function isPlannerAgent(agent: Agent): boolean {
    return agent.filename === PLANNER_AGENT_FILENAME;
  }

  function openCreateModal() {
    newAgentName = '';
    newAgentDescription = '';
    newAgentModel = 'sonnet';
    newAgentColor = 'blue';
    newAgentPrompt = '';
    error = null;
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
  }

  function switchToChat() {
    showCreateModal = false;
    onopenchat?.();
  }

  async function createAgent() {
    if (!newAgentName.trim()) {
      error = 'Name is required';
      return;
    }

    isSubmitting = true;
    error = null;

    try {
      const response = await fetch(`/api/projects/${projectId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName.trim(),
          description: newAgentDescription.trim(),
          model: newAgentModel,
          color: newAgentColor,
          prompt: newAgentPrompt.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create agent');
      }

      showCreateModal = false;
      onagentschange?.();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create agent';
    } finally {
      isSubmitting = false;
    }
  }

  function confirmDelete(agent: Agent) {
    agentToDelete = agent;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    showDeleteModal = false;
    agentToDelete = null;
  }

  async function deleteAgent() {
    if (!agentToDelete) return;

    isSubmitting = true;
    error = null;

    try {
      const response = await fetch(`/api/projects/${projectId}/agents/${agentToDelete.filename}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete agent');
      }

      showDeleteModal = false;
      agentToDelete = null;
      onagentschange?.();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete agent';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="agents-view">
  <div class="agents-header">
    <div class="header-left">
      <h3 class="agents-title">
        <Icon name="cpu" size={18} />
        Agents
      </h3>
      <span class="agents-count">{agents.length} total</span>
    </div>
    <button class="create-btn" onclick={openCreateModal}>
      <Icon name="plus" size={16} />
      New Agent
    </button>
  </div>

  {#if loading}
    <div class="loading-state">
      <Icon name="loader" size={24} />
      <p>Loading agents...</p>
    </div>
  {:else if !hasAgentsDir}
    <div class="empty-state">
      <Icon name="folder" size={40} />
      <p>No agents directory</p>
      <span>Create a <code>.claude/agents/</code> directory in your project to add agents</span>
      <button class="empty-create-btn" onclick={openCreateModal}>
        <Icon name="plus" size={16} />
        Create First Agent
      </button>
    </div>
  {:else if agents.length === 0}
    <div class="empty-state">
      <Icon name="cpu" size={40} />
      <p>No agents found</p>
      <span>Add <code>.md</code> files to <code>.claude/agents/</code> to define agents</span>
      <button class="empty-create-btn" onclick={openCreateModal}>
        <Icon name="plus" size={16} />
        Create First Agent
      </button>
    </div>
  {:else}
    <div class="agents-list">
      {#each agents as agent (agent.filename)}
        <AgentCard
          {agent}
          taskCount={getTaskCount(agent.frontmatter.name)}
          isBuiltIn={isPlannerAgent(agent)}
          onclick={() => onagentclick?.(agent)}
          ondelete={isPlannerAgent(agent) ? undefined : confirmDelete}
        />
      {/each}
    </div>
  {/if}
</div>

<!-- Create Agent Modal -->
{#if showCreateModal}
  <div class="modal-overlay" onclick={closeCreateModal} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="create-modal-title">
      <div class="modal-header">
        <h2 id="create-modal-title">Create New Agent</h2>
        <button class="modal-close" onclick={closeCreateModal}>
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="modal-body">
        {#if error}
          <div class="form-error">
            <Icon name="alert-circle" size={16} />
            {error}
          </div>
        {/if}

        <div class="form-group">
          <label for="agent-name">Name *</label>
          <input
            id="agent-name"
            type="text"
            bind:value={newAgentName}
            placeholder="e.g., test-writer"
            disabled={isSubmitting}
          />
        </div>

        <div class="form-group">
          <label for="agent-description">Description</label>
          <textarea
            id="agent-description"
            bind:value={newAgentDescription}
            placeholder="Describe when to use this agent..."
            rows="2"
            disabled={isSubmitting}
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="agent-model">Model</label>
            <select id="agent-model" bind:value={newAgentModel} disabled={isSubmitting}>
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </select>
          </div>

          <div class="form-group">
            <label>Color</label>
            <div class="color-picker">
              {#each colors as color}
                <button
                  type="button"
                  class="color-swatch"
                  class:selected={newAgentColor === color}
                  style="background: var(--color-{color})"
                  onclick={() => newAgentColor = color}
                  title={color}
                  disabled={isSubmitting}
                ></button>
              {/each}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="agent-prompt">Agent Instructions</label>
          <div class="agent-editor-wrapper">
            <MarkdownEditor
              value={newAgentPrompt}
              onchange={(v) => newAgentPrompt = v}
              placeholder="Enter the agent's system prompt and instructions..."
            />
          </div>
          <span class="form-hint">This will be the main content of the agent file after the frontmatter.</span>
        </div>

        {#if onopenchat}
          <div class="chat-tip">
            <Icon name="zap" size={16} />
            <span>Tip: You can also ask Claude to create an agent for you in chat!</span>
            <button type="button" class="chat-tip-btn" onclick={switchToChat}>
              <Icon name="message-circle" size={14} />
              Open Chat
            </button>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={closeCreateModal} disabled={isSubmitting}>
          Cancel
        </button>
        <button class="btn-primary" class:submitting={isSubmitting} onclick={createAgent} disabled={isSubmitting || !newAgentName.trim()}>
          {#if isSubmitting}
            <Icon name="loader" size={16} />
            Creating...
          {:else}
            Create Agent
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && agentToDelete}
  <div class="modal-overlay" onclick={closeDeleteModal} role="presentation">
    <div class="modal modal-small" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="delete-modal-title">
      <div class="modal-header">
        <h2 id="delete-modal-title">Delete Agent</h2>
        <button class="modal-close" onclick={closeDeleteModal}>
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="modal-body">
        <p>Are you sure you want to delete <strong>{agentToDelete.frontmatter.name}</strong>?</p>
        <p class="delete-warning">This will permanently delete the file <code>{agentToDelete.filename}</code>.</p>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={closeDeleteModal} disabled={isSubmitting}>
          Cancel
        </button>
        <button class="btn-danger" class:submitting={isSubmitting} onclick={deleteAgent} disabled={isSubmitting}>
          {#if isSubmitting}
            <Icon name="loader" size={16} />
            Deleting...
          {:else}
            Delete
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .agents-view {
    padding: 20px;
    max-width: 900px;
    margin: 0 auto;
  }

  .agents-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .agents-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    font-family: 'Figtree', sans-serif;
  }

  .agents-count {
    font-size: 13px;
    color: #888888;
    background: #f5f5f5;
    padding: 4px 12px;
    border-radius: 12px;
  }

  .create-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #2563eb;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .create-btn:hover {
    background: #1d4ed8;
  }

  .empty-state,
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #888888;
    text-align: center;
  }

  .empty-state p,
  .loading-state p {
    margin: 16px 0 4px;
    font-size: 16px;
    font-weight: 500;
    color: #666666;
  }

  .empty-state span {
    font-size: 14px;
    margin-bottom: 20px;
  }

  .empty-state code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9em;
  }

  .empty-create-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    background: #2563eb;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .empty-create-btn:hover {
    background: #1d4ed8;
  }

  .loading-state :global(.icon) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .agents-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fade-in 0.15s ease;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: #ffffff;
    border-radius: 16px;
    width: 90%;
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slide-up 0.2s ease;
  }

  .modal-small {
    max-width: 400px;
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 8px;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .modal-close:hover {
    background: #e5e7eb;
    color: #1f2937;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
  }

  .modal-body p {
    margin: 0 0 12px;
    color: #4b5563;
  }

  .delete-warning {
    color: #dc2626 !important;
    font-size: 13px;
  }

  .delete-warning code {
    background: #fef2f2;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-family: 'Figtree', sans-serif;
    background: #ffffff;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background: #f3f4f6;
    color: #9ca3af;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
  }

  .form-hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #6b7280;
  }

  .agent-editor-wrapper {
    border-radius: 8px;
    overflow: hidden;
  }

  .agent-editor-wrapper :global(.markdown-editor) {
    border-color: #d1d5db;
  }

  .agent-editor-wrapper :global(.editor-content) {
    height: 200px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 14px;
    color: #dc2626;
  }

  .color-picker {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .color-swatch:hover {
    transform: scale(1.1);
  }

  .color-swatch.selected {
    border-color: #1f2937;
    box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #1f2937;
  }

  .color-swatch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Color variables */
  :global(:root) {
    --color-blue: #3b82f6;
    --color-orange: #f97316;
    --color-green: #22c55e;
    --color-purple: #a855f7;
    --color-red: #ef4444;
    --color-yellow: #eab308;
    --color-pink: #ec4899;
    --color-cyan: #06b6d4;
    --color-gray: #6b7280;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
  }

  .btn-primary {
    background: #2563eb;
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-secondary:disabled {
    color: #9ca3af;
    cursor: not-allowed;
  }

  .btn-danger {
    background: #dc2626;
    color: #ffffff;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-danger:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .submitting :global(.icon) {
    animation: spin 1s linear infinite;
  }

  .chat-tip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: #fefce8;
    border: 1px solid #fde047;
    border-radius: 8px;
    margin-top: 16px;
    font-size: 13px;
    color: #713f12;
  }

  .chat-tip > :global(.icon) {
    flex-shrink: 0;
  }

  .chat-tip > :global(.icon svg) {
    stroke: #ca8a04;
  }

  .chat-tip span {
    flex: 1;
  }

  .chat-tip-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    background: #2563eb;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s ease;
    font-family: 'Figtree', sans-serif;
    flex-shrink: 0;
  }

  .chat-tip-btn :global(.icon svg) {
    stroke: #ffffff;
  }

  .chat-tip-btn:hover {
    background: #1d4ed8;
  }
</style>
