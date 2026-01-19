<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import { getActivityIcon, getActivityColor } from '$lib/agent-activity-types';
	import type { AgentActivityEvent } from '$lib/agent-activity-types';
	import type { TaskRunStatus } from '$lib/types';

	interface TaskRunSummary {
		id: string;
		issueId: string;
		issueTitle: string;
		issueType: string;
		status: TaskRunStatus;
		mode: 'autonomous' | 'guided';
		startedAt: string;
		lastActivityAt: string;
		awaitingUserInput: boolean;
		epicSequence?: {
			totalTasks: number;
			currentIndex: number;
			completedTaskIds: string[];
			failedTaskIds: string[];
		};
	}

	let {
		projectId,
		isVisible = true
	}: {
		projectId: string;
		isVisible?: boolean;
	} = $props();

	let runs = $state<TaskRunSummary[]>([]);
	let events = $state<AgentActivityEvent[]>([]);
	let connected = $state(false);
	let error = $state<string | null>(null);
	let eventSource: EventSource | null = null;

	// Group events by issueId for per-agent feeds
	let eventsByIssue = $derived(() => {
		const grouped = new Map<string, AgentActivityEvent[]>();
		for (const event of events) {
			if (event.issueId) {
				const existing = grouped.get(event.issueId) || [];
				existing.push(event);
				grouped.set(event.issueId, existing);
			}
		}
		return grouped;
	});

	// Connect to orchestration stream
	$effect(() => {
		if (browser && projectId && isVisible) {
			connectToStream();
		}

		return () => {
			disconnectFromStream();
		};
	});

	function connectToStream() {
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource(`/api/projects/${projectId}/orchestration/stream`);

		eventSource.onopen = () => {
			connected = true;
			error = null;
		};

		eventSource.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);

				switch (data.type) {
					case 'init':
						runs = data.runs;
						events = data.events.map(parseEvent);
						break;

					case 'runs_update':
						runs = data.runs;
						break;

					case 'event':
						events = [parseEvent(data.event), ...events].slice(0, 200);
						break;

					case 'keepalive':
						// Just acknowledge
						break;
				}
			} catch (err) {
				console.error('[OrchestrationView] Parse error:', err);
			}
		};

		eventSource.onerror = () => {
			connected = false;
			error = 'Connection lost. Reconnecting...';

			setTimeout(() => {
				if (isVisible) {
					connectToStream();
				}
			}, 3000);
		};
	}

	function disconnectFromStream() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		connected = false;
	}

	function parseEvent(data: Record<string, unknown>): AgentActivityEvent {
		return {
			...data,
			timestamp: new Date(data.timestamp as string)
		} as AgentActivityEvent;
	}

	function formatTime(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function formatElapsed(startedAt: string): string {
		const started = new Date(startedAt);
		const elapsed = Date.now() - started.getTime();
		const minutes = Math.floor(elapsed / 60000);
		const seconds = Math.floor((elapsed % 60000) / 1000);
		return `${minutes}m ${seconds}s`;
	}

	function getStatusColor(status: TaskRunStatus): string {
		switch (status) {
			case 'running':
				return '#22c55e';
			case 'paused':
				return '#f59e0b';
			case 'completed':
				return '#3b82f6';
			case 'failed':
				return '#ef4444';
			case 'cancelled':
				return '#6b7280';
			default:
				return '#888888';
		}
	}

	function getStatusIcon(status: TaskRunStatus): string {
		switch (status) {
			case 'running':
				return 'play-circle';
			case 'paused':
				return 'pause-circle';
			case 'completed':
				return 'check-circle';
			case 'failed':
				return 'x-circle';
			case 'cancelled':
				return 'slash';
			default:
				return 'circle';
		}
	}

	function formatEventContent(event: AgentActivityEvent): string {
		switch (event.type) {
			case 'claimed':
				return `Claimed on ${event.branchName}`;
			case 'file_read':
				return event.filePath || 'Read file';
			case 'file_edit':
			case 'file_write':
				return event.filePath || 'Modified file';
			case 'command_run':
				return event.command || 'Ran command';
			case 'commit':
				return event.commitHash?.slice(0, 7) || 'Committed';
			case 'completed':
				return 'Task completed';
			case 'failed':
				return event.content || 'Task failed';
			case 'blocked':
				return event.content || 'Blocked';
			case 'awaiting_input':
				return 'Waiting for input';
			case 'message':
				return event.content || '';
			case 'tool_use':
				return event.toolName || 'Using tool';
			case 'tool_result':
				return event.toolName || 'Tool result';
			default:
				return event.content || event.type;
		}
	}
</script>

<div class="orchestration-view">
	<div class="view-header">
		<div class="header-title">
			<Icon name="grid" size={18} />
			<span>Agent Orchestration</span>
			{#if connected}
				<span class="status-dot connected"></span>
			{:else}
				<span class="status-dot disconnected"></span>
			{/if}
		</div>
		<div class="header-stats">
			<span class="stat">
				<Icon name="play" size={14} />
				{runs.filter((r) => r.status === 'running').length} active
			</span>
			<span class="stat">
				<Icon name="check" size={14} />
				{runs.filter((r) => r.status === 'completed').length} completed
			</span>
		</div>
	</div>

	{#if error}
		<div class="error-banner">
			<Icon name="alert-circle" size={14} />
			{error}
		</div>
	{/if}

	{#if runs.length === 0}
		<div class="empty-state">
			<Icon name="users" size={48} />
			<h3>No Active Agents</h3>
			<p>Start a task to see agents working in real-time</p>
		</div>
	{:else}
		<div class="agents-grid">
			{#each runs as run (run.id)}
				<div class="agent-panel" class:is-active={run.status === 'running'}>
					<div class="panel-header">
						<div class="run-status" style="color: {getStatusColor(run.status)}">
							<Icon name={getStatusIcon(run.status)} size={16} />
							{run.status}
						</div>
						{#if run.awaitingUserInput}
							<span class="awaiting-badge">
								<Icon name="message-circle" size={12} />
								Awaiting Input
							</span>
						{/if}
					</div>

					<div class="issue-info">
						<span class="issue-type-badge">{run.issueType}</span>
						<h4 class="issue-title">{run.issueTitle}</h4>
						<span class="issue-id">{run.issueId}</span>
					</div>

					{#if run.epicSequence}
						<div class="epic-progress">
							<div class="progress-bar">
								<div
									class="progress-fill"
									style="width: {((run.epicSequence.completedTaskIds.length /
										run.epicSequence.totalTasks) *
										100).toFixed(0)}%"
								></div>
							</div>
							<span class="progress-text">
								{run.epicSequence.completedTaskIds.length} / {run.epicSequence.totalTasks} tasks
							</span>
						</div>
					{/if}

					<div class="run-meta">
						<span class="mode-badge">{run.mode}</span>
						<span class="elapsed">
							<Icon name="clock" size={12} />
							{formatElapsed(run.startedAt)}
						</span>
					</div>

					<div class="activity-feed">
						{#each eventsByIssue().get(run.issueId)?.slice(0, 5) || [] as event (event.id)}
							<div class="event-item" style="--event-color: {getActivityColor(event.type)}">
								<span class="event-icon">
									<Icon name={getActivityIcon(event.type)} size={12} />
								</span>
								<span class="event-content">{formatEventContent(event)}</span>
								<span class="event-time">{formatTime(event.timestamp)}</span>
							</div>
						{:else}
							<div class="no-events">No activity yet</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.orchestration-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #fafafa;
	}

	.view-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 16px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.status-dot.connected {
		background: #22c55e;
		box-shadow: 0 0 4px #22c55e;
	}

	.status-dot.disconnected {
		background: #ef4444;
	}

	.header-stats {
		display: flex;
		gap: 16px;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: #666666;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: #fef2f2;
		color: #dc2626;
		font-size: 13px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		padding: 48px;
		color: #888888;
		text-align: center;
	}

	.empty-state h3 {
		margin: 16px 0 8px;
		font-size: 18px;
		font-weight: 600;
		color: #666666;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
	}

	.agents-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 16px;
		padding: 20px;
		overflow-y: auto;
	}

	.agent-panel {
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.2s ease;
	}

	.agent-panel.is-active {
		border-color: #22c55e;
		box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		background: #fafafa;
		border-bottom: 1px solid #f0f0f0;
	}

	.run-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		text-transform: capitalize;
	}

	.awaiting-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #fef3c7;
		color: #d97706;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
	}

	.issue-info {
		padding: 14px;
		border-bottom: 1px solid #f0f0f0;
	}

	.issue-type-badge {
		display: inline-block;
		padding: 2px 6px;
		background: #f0f0f0;
		color: #666666;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.issue-title {
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 500;
		color: #1a1a1a;
		line-height: 1.4;
	}

	.issue-id {
		font-family: monospace;
		font-size: 11px;
		color: #888888;
	}

	.epic-progress {
		padding: 12px 14px;
		border-bottom: 1px solid #f0f0f0;
	}

	.progress-bar {
		height: 4px;
		background: #f0f0f0;
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 6px;
	}

	.progress-fill {
		height: 100%;
		background: #22c55e;
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: 11px;
		color: #888888;
	}

	.run-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: #fafafa;
		border-bottom: 1px solid #f0f0f0;
	}

	.mode-badge {
		padding: 2px 6px;
		background: #dbeafe;
		color: #2563eb;
		border-radius: 4px;
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
	}

	.elapsed {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: #888888;
		margin-left: auto;
	}

	.activity-feed {
		padding: 10px 14px;
		max-height: 160px;
		overflow-y: auto;
	}

	.event-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid #f5f5f5;
	}

	.event-item:last-child {
		border-bottom: none;
	}

	.event-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--event-color) 15%, transparent);
		color: var(--event-color);
		flex-shrink: 0;
	}

	.event-content {
		flex: 1;
		font-size: 12px;
		color: #666666;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.event-time {
		font-size: 10px;
		color: #aaaaaa;
		flex-shrink: 0;
	}

	.no-events {
		padding: 20px;
		text-align: center;
		font-size: 12px;
		color: #aaaaaa;
	}
</style>
