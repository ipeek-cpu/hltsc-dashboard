<script lang="ts">
  import type { Agent } from '$lib/types';
  import { getAgentColor, getModelStyle } from '$lib/agents';
  import Icon from './Icon.svelte';

  let { agent, taskCount = 0, isBuiltIn = false, onclick, ondelete }: {
    agent: Agent;
    taskCount?: number;
    isBuiltIn?: boolean;
    onclick?: () => void;
    ondelete?: (agent: Agent) => void;
  } = $props();

  let color = $derived(getAgentColor(agent.frontmatter.color));
  let modelStyle = $derived(getModelStyle(agent.frontmatter.model));

  function truncate(str: string | undefined, len: number): string {
    if (!str) return '';
    return str.length > len ? str.slice(0, len).trim() + '...' : str;
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    ondelete?.(agent);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="agent-card" onclick={onclick} onkeydown={handleKeydown} role="button" tabindex="0">
  <div class="color-indicator" style="background: {color}"></div>

  <div class="card-content">
    <div class="card-header">
      <h3 class="agent-name">{agent.frontmatter.name}</h3>
      {#if isBuiltIn}
        <span class="builtin-badge">Built-in</span>
      {/if}
      <span
        class="model-badge"
        style="background: {modelStyle.bg}; color: {modelStyle.color}"
      >
        {modelStyle.label}
      </span>
    </div>

    {#if agent.frontmatter.description}
      <p class="agent-description">{truncate(agent.frontmatter.description, 120)}</p>
    {/if}

    <div class="card-footer">
      <span class="filename">
        <Icon name="file-text" size={14} />
        {agent.filename}
      </span>
      {#if taskCount > 0}
        <span class="task-count">
          <Icon name="check-square" size={14} />
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
      {/if}
    </div>
  </div>

  <div class="card-actions">
    {#if ondelete}
      <button class="delete-btn" onclick={handleDelete} title="Delete agent">
        <Icon name="trash-2" size={16} />
      </button>
    {/if}
    <div class="chevron">
      <Icon name="chevron-right" size={18} />
    </div>
  </div>
</div>

<style>
  .agent-card {
    display: flex;
    align-items: stretch;
    width: 100%;
    background: #ffffff;
    border: 1px solid #f0f0f0;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;
    font-family: 'Figtree', sans-serif;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }

  .agent-card:hover {
    border-color: #e0e0e0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .color-indicator {
    width: 4px;
    flex-shrink: 0;
  }

  .card-content {
    flex: 1;
    padding: 16px;
    min-width: 0;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .agent-name {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    color: #1a1a1a;
    line-height: 1.3;
  }

  .model-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .builtin-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: #f3e8ff;
    color: #7c3aed;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .agent-description {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: #666666;
    line-height: 1.5;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .filename {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #888888;
    font-family: monospace;
  }

  .task-count {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #2563eb;
    font-weight: 500;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 12px;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #cccccc;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
  }

  .agent-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .chevron {
    display: flex;
    align-items: center;
    color: #cccccc;
    transition: color 0.15s ease;
  }

  .agent-card:hover .chevron {
    color: #888888;
  }
</style>
