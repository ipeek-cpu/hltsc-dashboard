<script lang="ts">
  import type { Agent, Issue } from '$lib/types';
  import { getAgentColor, getModelStyle } from '$lib/agents';
  import IssueCard from './IssueCard.svelte';
  import Icon from './Icon.svelte';

  let { agent, issues = [], onback, onedit, onchat, onissueclick }: {
    agent: Agent;
    issues?: Issue[];
    onback?: () => void;
    onedit?: () => void;
    onchat?: () => void;
    onissueclick?: (issueId: string) => void;
  } = $props();

  let color = $derived(getAgentColor(agent.frontmatter.color));
  let modelStyle = $derived(getModelStyle(agent.frontmatter.model));

  // Filter issues assigned to this agent
  let agentIssues = $derived(issues.filter(i => i.assignee === agent.frontmatter.name));

  // Group by status
  let openIssues = $derived(agentIssues.filter(i => i.status === 'open'));
  let inProgressIssues = $derived(agentIssues.filter(i => i.status === 'in_progress'));
  let blockedIssues = $derived(agentIssues.filter(i => i.status === 'blocked'));
  let closedIssues = $derived(agentIssues.filter(i => i.status === 'closed'));

  // Stats
  let stats = $derived({
    total: agentIssues.length,
    open: openIssues.length,
    inProgress: inProgressIssues.length,
    blocked: blockedIssues.length,
    closed: closedIssues.length
  });

  // Reactive columns - fully derived to ensure proper reactivity
  let columns = $derived([
    { key: 'open', label: 'Open', color: '#2563eb', issues: openIssues },
    { key: 'in_progress', label: 'In Progress', color: '#d97706', issues: inProgressIssues },
    { key: 'blocked', label: 'Blocked', color: '#dc2626', issues: blockedIssues },
    { key: 'closed', label: 'Closed', color: '#059669', issues: closedIssues }
  ]);
</script>

<div class="agent-tasks-view">
  <div class="header">
    <div class="color-bar" style="background: {color}"></div>

    <div class="header-content">
      <button class="back-btn" onclick={onback}>
        <Icon name="arrow-left" size={18} />
        Back to Agents
      </button>

      <div class="agent-info">
        <div class="agent-title-row">
          <h2 class="agent-name">{agent.frontmatter.name}</h2>
          <span
            class="model-badge"
            style="background: {modelStyle.bg}; color: {modelStyle.color}"
          >
            {modelStyle.label}
          </span>
        </div>
        {#if agent.frontmatter.description}
          <p class="agent-description">{agent.frontmatter.description}</p>
        {/if}
      </div>

      <div class="header-actions">
        <button class="chat-btn" onclick={onchat} title="Chat with agent">
          <Icon name="message-circle" size={18} />
        </button>
        <button class="edit-btn" onclick={onedit} title="Edit agent">
          <Icon name="edit-2" size={18} />
        </button>
      </div>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat">
      <span class="stat-value">{stats.total}</span>
      <span class="stat-label">Total</span>
    </div>
    <div class="stat">
      <span class="stat-value" style="color: #2563eb">{stats.open}</span>
      <span class="stat-label">Open</span>
    </div>
    <div class="stat">
      <span class="stat-value" style="color: #d97706">{stats.inProgress}</span>
      <span class="stat-label">In Progress</span>
    </div>
    <div class="stat">
      <span class="stat-value" style="color: #dc2626">{stats.blocked}</span>
      <span class="stat-label">Blocked</span>
    </div>
    <div class="stat">
      <span class="stat-value" style="color: #059669">{stats.closed}</span>
      <span class="stat-label">Closed</span>
    </div>
  </div>

  {#if agentIssues.length === 0}
    <div class="empty-state">
      <Icon name="inbox" size={48} />
      <p>No tasks assigned</p>
      <span>Assign tasks to this agent by setting their assignee to "{agent.frontmatter.name}"</span>
    </div>
  {:else}
    <div class="kanban-board">
      {#each columns as column (column.key)}
        <div class="column">
          <div class="column-header">
            <span class="column-dot" style="background: {column.color}"></span>
            <span class="column-title">{column.label}</span>
            <span class="column-count">{column.issues.length}</span>
          </div>
          <div class="column-content">
            {#each column.issues as issue (issue.id)}
              <IssueCard
                {issue}
                onclick={() => onissueclick?.(issue.id)}
              />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .agent-tasks-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header {
    position: relative;
    background: #ffffff;
    border-bottom: 1px solid #eaeaea;
  }

  .color-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    padding: 20px 24px 16px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #f5f5f5;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: 'Figtree', sans-serif;
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: #eeeeee;
    color: #1a1a1a;
  }

  .agent-info {
    flex: 1;
    min-width: 0;
  }

  .agent-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .agent-name {
    margin: 0;
    font-size: 20px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .model-badge {
    font-size: 12px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .agent-description {
    margin: 0;
    font-size: 14px;
    color: #666666;
    line-height: 1.5;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .chat-btn,
  .edit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: #f5f5f5;
    border: none;
    border-radius: 8px;
    color: #666666;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chat-btn:hover {
    background: #ecfdf5;
    color: #059669;
  }

  .edit-btn:hover {
    background: #e8f4ff;
    color: #2563eb;
  }

  .stats-bar {
    display: flex;
    gap: 24px;
    padding: 12px 24px;
    background: #fafafa;
    border-bottom: 1px solid #eaeaea;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .stat-label {
    font-size: 12px;
    color: #888888;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 60px 20px;
    color: #888888;
    text-align: center;
  }

  .empty-state p {
    margin: 16px 0 4px;
    font-size: 16px;
    font-weight: 500;
    color: #666666;
  }

  .empty-state span {
    font-size: 14px;
    max-width: 400px;
  }

  .kanban-board {
    display: flex;
    gap: 16px;
    padding: 20px 24px;
    flex: 1;
    overflow-x: auto;
  }

  .column {
    flex: 1;
    min-width: 280px;
    max-width: 350px;
    display: flex;
    flex-direction: column;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
  }

  .column-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .column-title {
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .column-count {
    font-size: 13px;
    color: #888888;
    background: #f5f5f5;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .column-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
  }
</style>
