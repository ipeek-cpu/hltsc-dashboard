<script lang="ts">
	import type { Issue, Agent } from '$lib/types';
	import Icon from './Icon.svelte';
	import TypeBadge from './TypeBadge.svelte';

	let {
		issues,
		agents,
		projectId,
		onissueclick,
		onchat
	}: {
		issues: Issue[];
		agents: Agent[];
		projectId: string;
		onissueclick: (issueId: string) => void;
		onchat: (agent: Agent) => void;
	} = $props();

	// Filter to planner agents only
	let plannerAgents = $derived(
		agents.filter(a =>
			a.frontmatter.scope === 'planner' ||
			a.filename.toLowerCase().includes('planner')
		)
	);

	// Selected planner agent
	let selectedAgentFilename = $state<string | null>(null);
	let selectedAgent = $derived(
		plannerAgents.find(a => a.filename === selectedAgentFilename) || null
	);

	// Get ready issues (unblocked, ready to be worked on)
	let readyIssues = $derived(
		issues.filter(i => i.status === 'ready')
	);

	// Get open issues that need planning
	let openIssues = $derived(
		issues.filter(i => i.status === 'open')
	);

	// Get epics
	let epics = $derived(
		issues.filter(i => i.issue_type === 'epic')
	);

	const priorityLabels: Record<number, { label: string; color: string }> = {
		0: { label: 'Critical', color: '#dc2626' },
		1: { label: 'High', color: '#f97316' },
		2: { label: 'Medium', color: '#eab308' },
		3: { label: 'Low', color: '#22c55e' },
		4: { label: 'Backlog', color: '#9ca3af' },
	};

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffDays < 1) return 'Today';
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}
</script>

<div class="planning-view">
	<div class="planning-header">
		<div class="header-left">
			<Icon name="clipboard" size={24} />
			<h2>Planning Mode</h2>
		</div>
		<div class="header-right">
			{#if plannerAgents.length > 0}
				<select
					class="agent-select"
					bind:value={selectedAgentFilename}
				>
					<option value={null}>Select a planner agent...</option>
					{#each plannerAgents as agent}
						<option value={agent.filename}>{agent.frontmatter.name}</option>
					{/each}
				</select>
				{#if selectedAgent}
					<button class="chat-btn" onclick={() => onchat(selectedAgent!)}>
						<Icon name="message-circle" size={16} />
						Chat with {selectedAgent.frontmatter.name}
					</button>
				{/if}
			{:else}
				<span class="no-agents">No planner agents configured</span>
			{/if}
		</div>
	</div>

	<div class="planning-content">
		<div class="planning-columns">
			<!-- Open Issues needing planning -->
			<div class="planning-column">
				<div class="column-header">
					<Icon name="inbox" size={18} />
					<h3>Needs Planning</h3>
					<span class="count">{openIssues.length}</span>
				</div>
				<div class="column-content">
					{#if openIssues.length === 0}
						<div class="empty-state">
							<p>No open issues needing planning</p>
						</div>
					{:else}
						{#each openIssues as issue}
							<button class="issue-card" onclick={() => onissueclick(issue.id)}>
								<div class="card-header">
									<TypeBadge type={issue.issue_type} size="sm" />
									<span class="priority" style="color: {priorityLabels[issue.priority]?.color || '#9ca3af'}">
										{priorityLabels[issue.priority]?.label || 'Backlog'}
									</span>
								</div>
								<h4 class="card-title">{issue.title}</h4>
								<div class="card-footer">
									<span class="card-id">{issue.id.substring(0, 8)}</span>
									<span class="card-date">{formatDate(issue.updated_at)}</span>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Ready Issues -->
			<div class="planning-column">
				<div class="column-header ready">
					<Icon name="check-circle" size={18} />
					<h3>Ready for Execution</h3>
					<span class="count">{readyIssues.length}</span>
				</div>
				<div class="column-content">
					{#if readyIssues.length === 0}
						<div class="empty-state">
							<p>No issues ready for execution</p>
						</div>
					{:else}
						{#each readyIssues as issue}
							<button class="issue-card ready" onclick={() => onissueclick(issue.id)}>
								<div class="card-header">
									<TypeBadge type={issue.issue_type} size="sm" />
									<span class="priority" style="color: {priorityLabels[issue.priority]?.color || '#9ca3af'}">
										{priorityLabels[issue.priority]?.label || 'Backlog'}
									</span>
								</div>
								<h4 class="card-title">{issue.title}</h4>
								{#if issue.assignee}
									<div class="card-assignee">
										<Icon name="user" size={12} />
										{issue.assignee}
									</div>
								{/if}
								<div class="card-footer">
									<span class="card-id">{issue.id.substring(0, 8)}</span>
									<span class="card-date">{formatDate(issue.updated_at)}</span>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Epics Overview -->
			<div class="planning-column">
				<div class="column-header epic">
					<Icon name="layers" size={18} />
					<h3>Epics</h3>
					<span class="count">{epics.length}</span>
				</div>
				<div class="column-content">
					{#if epics.length === 0}
						<div class="empty-state">
							<p>No epics defined</p>
						</div>
					{:else}
						{#each epics as epic}
							<button class="issue-card epic" onclick={() => onissueclick(epic.id)}>
								<div class="card-header">
									<span class="epic-badge">Epic</span>
									<span class="status-badge status-{epic.status}">
										{epic.status === 'in_progress' ? 'In Progress' : epic.status}
									</span>
								</div>
								<h4 class="card-title">{epic.title}</h4>
								<div class="card-footer">
									<span class="card-id">{epic.id.substring(0, 8)}</span>
									<span class="card-date">{formatDate(epic.updated_at)}</span>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.planning-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fafafa;
	}

	.planning-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		background: #ffffff;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #7c3aed;
	}

	.header-left h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #1f2937;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.agent-select {
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		color: #374151;
		cursor: pointer;
		min-width: 200px;
	}

	.agent-select:focus {
		outline: none;
		border-color: #7c3aed;
	}

	.chat-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: #7c3aed;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.chat-btn:hover {
		background: #6d28d9;
	}

	.no-agents {
		font-size: 14px;
		color: #9ca3af;
	}

	.planning-content {
		flex: 1;
		overflow: auto;
		padding: 24px;
	}

	.planning-columns {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
		height: 100%;
	}

	.planning-column {
		display: flex;
		flex-direction: column;
		background: #ffffff;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		overflow: hidden;
	}

	.column-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		color: #6b7280;
	}

	.column-header.ready {
		background: #f0fdf4;
		color: #16a34a;
	}

	.column-header.epic {
		background: #faf5ff;
		color: #7c3aed;
	}

	.column-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		flex: 1;
	}

	.count {
		padding: 2px 8px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
	}

	.column-content {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100px;
		color: #9ca3af;
		font-size: 14px;
	}

	.issue-card {
		width: 100%;
		padding: 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
		margin-bottom: 8px;
	}

	.issue-card:hover {
		border-color: #d1d5db;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.issue-card.ready {
		border-left: 3px solid #16a34a;
	}

	.issue-card.epic {
		border-left: 3px solid #7c3aed;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.priority {
		font-size: 11px;
		font-weight: 500;
	}

	.epic-badge {
		padding: 2px 6px;
		background: #f3e8ff;
		color: #7c3aed;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.status-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.status-badge.status-open {
		background: #f3f4f6;
		color: #6b7280;
	}

	.status-badge.status-in_progress {
		background: #dbeafe;
		color: #2563eb;
	}

	.status-badge.status-closed {
		background: #dcfce7;
		color: #16a34a;
	}

	.card-title {
		margin: 0 0 8px 0;
		font-size: 13px;
		font-weight: 500;
		color: #1f2937;
		line-height: 1.4;
	}

	.card-assignee {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #6b7280;
		margin-bottom: 8px;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		color: #9ca3af;
	}

	.card-id {
		font-family: monospace;
	}
</style>
