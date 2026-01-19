<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import { getActivityIcon, getActivityColor } from '$lib/agent-activity-types';
	import type { AgentActivityEvent } from '$lib/agent-activity-types';

	let {
		projectId,
		isOpen = true,
		onclose
	}: {
		projectId: string;
		isOpen?: boolean;
		onclose?: () => void;
	} = $props();

	let events = $state<AgentActivityEvent[]>([]);
	let connected = $state(false);
	let error = $state<string | null>(null);
	let eventSource: EventSource | null = null;

	// Connect to activity stream
	$effect(() => {
		if (browser && projectId && isOpen) {
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

		eventSource = new EventSource(`/api/projects/${projectId}/activity/stream`);

		eventSource.onopen = () => {
			connected = true;
			error = null;
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === 'init') {
					// Initial batch of events
					events = data.events.map(parseEvent);
				} else if (data.type === 'event') {
					// New event - add to top
					events = [parseEvent(data.event), ...events].slice(0, 100);
				}
			} catch (e) {
				console.error('[ActivityFeed] Parse error:', e);
			}
		};

		eventSource.onerror = () => {
			connected = false;
			error = 'Connection lost. Reconnecting...';

			// Auto-reconnect after 3 seconds
			setTimeout(() => {
				if (isOpen) {
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

	function formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

{#if isOpen}
	<div class="activity-panel">
		<div class="panel-header">
			<div class="header-left">
				<Icon name="activity" size={16} />
				<span class="header-title">Agent Activity</span>
				{#if connected}
					<span class="status-dot connected"></span>
				{:else}
					<span class="status-dot disconnected"></span>
				{/if}
			</div>
			{#if onclose}
				<button class="close-btn" onclick={onclose}>
					<Icon name="x" size={16} />
				</button>
			{/if}
		</div>

		<div class="panel-content">
			{#if error}
				<div class="error-message">
					<Icon name="alert-circle" size={14} />
					{error}
				</div>
			{/if}

			{#if events.length === 0}
				<div class="empty-state">
					<Icon name="inbox" size={32} />
					<p>No activity yet</p>
					<span>Agent actions will appear here in real-time</span>
				</div>
			{:else}
				<div class="event-list">
					{#each events as event (event.id)}
						<div class="event-item" style="--event-color: {getActivityColor(event.type)}">
							<div class="event-icon">
								<Icon name={getActivityIcon(event.type)} size={14} />
							</div>
							<div class="event-body">
								<div class="event-header">
									<span class="agent-name">{event.agentName || event.agentId}</span>
									{#if event.issueTitle}
										<span class="issue-title">{event.issueTitle}</span>
									{/if}
									<span class="event-time">{formatTime(event.timestamp)}</span>
								</div>
								<div class="event-content">
									{formatEventContent(event)}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.activity-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-left: 1px solid #eaeaea;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #eaeaea;
		background: #fafafa;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #1a1a1a;
	}

	.header-title {
		font-size: 14px;
		font-weight: 600;
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

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #888888;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #f0f0f0;
		color: #1a1a1a;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		background: #fef2f2;
		color: #dc2626;
		font-size: 13px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 24px;
		color: #888888;
		text-align: center;
	}

	.empty-state p {
		margin: 12px 0 4px 0;
		font-size: 14px;
		font-weight: 500;
		color: #666666;
	}

	.empty-state span {
		font-size: 13px;
	}

	.event-list {
		display: flex;
		flex-direction: column;
	}

	.event-item {
		display: flex;
		gap: 10px;
		padding: 10px 16px;
		border-bottom: 1px solid #f5f5f5;
		transition: background 0.15s ease;
	}

	.event-item:hover {
		background: #fafafa;
	}

	.event-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--event-color) 15%, transparent);
		color: var(--event-color);
		flex-shrink: 0;
	}

	.event-body {
		flex: 1;
		min-width: 0;
	}

	.event-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 2px;
	}

	.agent-name {
		font-size: 13px;
		font-weight: 500;
		color: #1a1a1a;
	}

	.issue-title {
		font-size: 12px;
		color: #888888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.event-time {
		font-size: 11px;
		color: #aaaaaa;
		flex-shrink: 0;
	}

	.event-content {
		font-size: 13px;
		color: #666666;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
