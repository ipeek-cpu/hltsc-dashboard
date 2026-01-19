<script lang="ts">
	import type { Issue, Agent } from '$lib/types';
	import Icon from './Icon.svelte';
	import TypeBadge from './TypeBadge.svelte';

	let {
		issues,
		agents,
		projectId,
		activeRuns = [],
		onissueclick,
		onchat,
		onstarttask,
		onstoptask
	}: {
		issues: Issue[];
		agents: Agent[];
		projectId: string;
		activeRuns?: Array<{ id: string; issueId: string; status: string }>;
		onissueclick: (issueId: string) => void;
		onchat: (agent: Agent) => void;
		onstarttask: (issue: Issue, mode: 'autonomous' | 'guided') => void;
		onstoptask: (runId: string) => void;
	} = $props();

	// Filter to executor agents only
	let executorAgents = $derived(
		agents.filter(a =>
			a.frontmatter.scope === 'executor' ||
			a.filename.toLowerCase().includes('executor') ||
			a.filename.toLowerCase().includes('exec')
		)
	);

	// Selected executor agent
	let selectedAgentFilename = $state<string | null>(null);
	let selectedAgent = $derived(
		executorAgents.find(a => a.filename === selectedAgentFilename) || null
	);

	// Get issues assigned to selected agent
	let assignedIssues = $derived(
		selectedAgent
			? issues.filter(i => i.assignee === selectedAgent!.frontmatter.name)
			: []
	);

	// Group by status
	let readyIssues = $derived(assignedIssues.filter(i => i.status === 'ready'));
	let inProgressIssues = $derived(assignedIssues.filter(i => i.status === 'in_progress'));
	let inReviewIssues = $derived(assignedIssues.filter(i => i.status === 'in_review'));

	// Check if issue has active run
	function getActiveRun(issueId: string) {
		return activeRuns.find(r => r.issueId === issueId && (r.status === 'running' || r.status === 'queued'));
	}

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

<div class="execution-view">
	<div class="execution-header">
		<div class="header-left">
			<Icon name="play-circle" size={24} />
			<h2>Execution Mode</h2>
		</div>
		<div class="header-right">
			{#if executorAgents.length > 0}
				<select
					class="agent-select"
					bind:value={selectedAgentFilename}
				>
					<option value={null}>Select an executor agent...</option>
					{#each executorAgents as agent}
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
				<span class="no-agents">No executor agents configured</span>
			{/if}
		</div>
	</div>

	{#if !selectedAgent}
		<div class="select-agent-prompt">
			<Icon name="users" size={48} />
			<h3>Select an Executor Agent</h3>
			<p>Choose an agent to see their assigned tasks and manage execution.</p>
		</div>
	{:else}
		<div class="execution-content">
			<div class="agent-summary">
				<div class="summary-card">
					<Icon name="clipboard" size={20} />
					<div class="summary-info">
						<span class="summary-value">{assignedIssues.length}</span>
						<span class="summary-label">Assigned</span>
					</div>
				</div>
				<div class="summary-card ready">
					<Icon name="check-circle" size={20} />
					<div class="summary-info">
						<span class="summary-value">{readyIssues.length}</span>
						<span class="summary-label">Ready</span>
					</div>
				</div>
				<div class="summary-card progress">
					<Icon name="loader" size={20} />
					<div class="summary-info">
						<span class="summary-value">{inProgressIssues.length}</span>
						<span class="summary-label">In Progress</span>
					</div>
				</div>
				<div class="summary-card review">
					<Icon name="eye" size={20} />
					<div class="summary-info">
						<span class="summary-value">{inReviewIssues.length}</span>
						<span class="summary-label">In Review</span>
					</div>
				</div>
			</div>

			<div class="execution-columns">
				<!-- Ready to Start -->
				<div class="execution-column">
					<div class="column-header ready">
						<Icon name="check-circle" size={18} />
						<h3>Ready to Start</h3>
						<span class="count">{readyIssues.length}</span>
					</div>
					<div class="column-content">
						{#if readyIssues.length === 0}
							<div class="empty-state">
								<p>No tasks ready to start</p>
							</div>
						{:else}
							{#each readyIssues as issue}
								{@const activeRun = getActiveRun(issue.id)}
								<div class="issue-card">
									<button class="card-main" onclick={() => onissueclick(issue.id)}>
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
									<div class="card-actions">
										<button class="start-btn" onclick={() => onstarttask(issue, 'autonomous')}>
											<Icon name="play" size={14} />
											Start
										</button>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<!-- In Progress -->
				<div class="execution-column">
					<div class="column-header progress">
						<Icon name="loader" size={18} />
						<h3>In Progress</h3>
						<span class="count">{inProgressIssues.length}</span>
					</div>
					<div class="column-content">
						{#if inProgressIssues.length === 0}
							<div class="empty-state">
								<p>No tasks in progress</p>
							</div>
						{:else}
							{#each inProgressIssues as issue}
								{@const activeRun = getActiveRun(issue.id)}
								<div class="issue-card in-progress">
									<button class="card-main" onclick={() => onissueclick(issue.id)}>
										<div class="card-header">
											<TypeBadge type={issue.issue_type} size="sm" />
											{#if activeRun}
												<span class="running-badge">
													<Icon name="loader" size={12} />
													Running
												</span>
											{/if}
										</div>
										<h4 class="card-title">{issue.title}</h4>
										{#if issue.branch_name}
											<div class="card-branch">
												<Icon name="git-branch" size={12} />
												{issue.branch_name}
											</div>
										{/if}
										<div class="card-footer">
											<span class="card-id">{issue.id.substring(0, 8)}</span>
											<span class="card-date">{formatDate(issue.updated_at)}</span>
										</div>
									</button>
									<div class="card-actions">
										{#if activeRun}
											<button class="stop-btn" onclick={() => onstoptask(activeRun.id)}>
												<Icon name="square" size={14} />
												Stop
											</button>
										{:else}
											<button class="start-btn" onclick={() => onstarttask(issue, 'autonomous')}>
												<Icon name="play" size={14} />
												Resume
											</button>
										{/if}
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<!-- In Review -->
				<div class="execution-column">
					<div class="column-header review">
						<Icon name="eye" size={18} />
						<h3>In Review</h3>
						<span class="count">{inReviewIssues.length}</span>
					</div>
					<div class="column-content">
						{#if inReviewIssues.length === 0}
							<div class="empty-state">
								<p>No tasks in review</p>
							</div>
						{:else}
							{#each inReviewIssues as issue}
								<div class="issue-card in-review">
									<button class="card-main" onclick={() => onissueclick(issue.id)}>
										<div class="card-header">
											<TypeBadge type={issue.issue_type} size="sm" />
											{#if issue.pr_url}
												<span class="pr-badge">
													<Icon name="git-pull-request" size={12} />
													PR
												</span>
											{/if}
										</div>
										<h4 class="card-title">{issue.title}</h4>
										{#if issue.branch_name}
											<div class="card-branch">
												<Icon name="git-branch" size={12} />
												{issue.branch_name}
											</div>
										{/if}
										<div class="card-footer">
											<span class="card-id">{issue.id.substring(0, 8)}</span>
											<span class="card-date">{formatDate(issue.updated_at)}</span>
										</div>
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.execution-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fafafa;
	}

	.execution-header {
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
		color: #2563eb;
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
		border-color: #2563eb;
	}

	.chat-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
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

	.chat-btn:hover {
		background: #1d4ed8;
	}

	.no-agents {
		font-size: 14px;
		color: #9ca3af;
	}

	.select-agent-prompt {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: #9ca3af;
		text-align: center;
		padding: 48px;
	}

	.select-agent-prompt h3 {
		margin: 0;
		font-size: 18px;
		color: #374151;
	}

	.select-agent-prompt p {
		margin: 0;
		font-size: 14px;
		max-width: 300px;
	}

	.execution-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 24px;
		gap: 24px;
	}

	.agent-summary {
		display: flex;
		gap: 16px;
	}

	.summary-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		color: #6b7280;
	}

	.summary-card.ready {
		background: #f0fdf4;
		border-color: #bbf7d0;
		color: #16a34a;
	}

	.summary-card.progress {
		background: #eff6ff;
		border-color: #bfdbfe;
		color: #2563eb;
	}

	.summary-card.review {
		background: #faf5ff;
		border-color: #e9d5ff;
		color: #7c3aed;
	}

	.summary-info {
		display: flex;
		flex-direction: column;
	}

	.summary-value {
		font-size: 24px;
		font-weight: 600;
		color: inherit;
	}

	.summary-label {
		font-size: 12px;
		color: inherit;
		opacity: 0.8;
	}

	.execution-columns {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px;
		overflow: hidden;
	}

	.execution-column {
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

	.column-header.progress {
		background: #eff6ff;
		color: #2563eb;
	}

	.column-header.review {
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
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		margin-bottom: 8px;
		overflow: hidden;
	}

	.issue-card.in-progress {
		border-left: 3px solid #2563eb;
	}

	.issue-card.in-review {
		border-left: 3px solid #7c3aed;
	}

	.card-main {
		width: 100%;
		padding: 12px;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: 'Figtree', sans-serif;
	}

	.card-main:hover {
		background: #f9fafb;
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

	.running-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: #dbeafe;
		color: #2563eb;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
	}

	.running-badge :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.pr-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: #f3e8ff;
		color: #7c3aed;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
	}

	.card-title {
		margin: 0 0 8px 0;
		font-size: 13px;
		font-weight: 500;
		color: #1f2937;
		line-height: 1.4;
	}

	.card-branch {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #3b82f6;
		font-family: monospace;
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

	.card-actions {
		display: flex;
		gap: 8px;
		padding: 8px 12px;
		background: #f9fafb;
		border-top: 1px solid #f3f4f6;
	}

	.start-btn,
	.stop-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border: none;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.start-btn {
		background: #10b981;
		color: #ffffff;
	}

	.start-btn:hover {
		background: #059669;
	}

	.stop-btn {
		background: #dc2626;
		color: #ffffff;
	}

	.stop-btn:hover {
		background: #b91c1c;
	}
</style>
