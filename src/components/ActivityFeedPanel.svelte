<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import { getActivityIcon, getActivityColor } from '$lib/agent-activity-types';
	import type { AgentActivityEvent, AgentActivityType } from '$lib/agent-activity-types';

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

	// Pause/Resume state
	let paused = $state(false);
	let pausedEvents = $state<AgentActivityEvent[]>([]);

	// Expanded events
	let expandedIds = $state(new Set<string>());

	// Filter state
	let showFilters = $state(false);
	let typeFilter = $state<AgentActivityType | 'all'>('all');
	let agentFilter = $state<string>('all');

	// Get unique agents from events
	let uniqueAgents = $derived(() => {
		const agents = new Set<string>();
		for (const event of events) {
			if (event.agentName || event.agentId) {
				agents.add(event.agentName || event.agentId);
			}
		}
		return Array.from(agents);
	});

	// Filter events
	let filteredEvents = $derived(() => {
		return events.filter(event => {
			if (typeFilter !== 'all' && event.type !== typeFilter) return false;
			if (agentFilter !== 'all') {
				const agentName = event.agentName || event.agentId;
				if (agentName !== agentFilter) return false;
			}
			return true;
		});
	});

	// Event type options for filter
	const eventTypes: { value: AgentActivityType | 'all'; label: string }[] = [
		{ value: 'all', label: 'All Types' },
		{ value: 'claimed', label: 'Claimed' },
		{ value: 'file_read', label: 'File Read' },
		{ value: 'file_edit', label: 'File Edit' },
		{ value: 'file_write', label: 'File Write' },
		{ value: 'command_run', label: 'Command' },
		{ value: 'commit', label: 'Commit' },
		{ value: 'tool_use', label: 'Tool Use' },
		{ value: 'tool_result', label: 'Tool Result' },
		{ value: 'message', label: 'Message' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'blocked', label: 'Blocked' },
	];

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
					const newEvent = parseEvent(data.event);
					if (paused) {
						// Queue events while paused
						pausedEvents = [newEvent, ...pausedEvents];
					} else {
						// New event - add to top
						events = [newEvent, ...events].slice(0, 100);
					}
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
				if (isOpen && !paused) {
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

	function togglePause() {
		paused = !paused;
		if (!paused && pausedEvents.length > 0) {
			// Merge queued events when resuming
			events = [...pausedEvents, ...events].slice(0, 100);
			pausedEvents = [];
		}
	}

	function toggleExpand(id: string) {
		const newSet = new Set(expandedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedIds = newSet;
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

	function getEventDetails(event: AgentActivityEvent): Array<{label: string; value: string}> {
		const details: Array<{label: string; value: string}> = [];

		if (event.issueId) details.push({ label: 'Issue', value: event.issueId });
		if (event.runId) details.push({ label: 'Run', value: event.runId });
		if (event.filePath) details.push({ label: 'File', value: event.filePath });
		if (event.command) details.push({ label: 'Command', value: event.command });
		if (event.commitHash) details.push({ label: 'Commit', value: event.commitHash });
		if (event.branchName) details.push({ label: 'Branch', value: event.branchName });
		if (event.toolName) details.push({ label: 'Tool', value: event.toolName });
		if (event.exitCode !== undefined) details.push({ label: 'Exit Code', value: String(event.exitCode) });
		if (event.content && event.type !== 'message') details.push({ label: 'Content', value: event.content });

		// Tool input (truncated)
		if (event.toolInput) {
			const inputStr = JSON.stringify(event.toolInput);
			details.push({ label: 'Input', value: inputStr.length > 100 ? inputStr.slice(0, 100) + '...' : inputStr });
		}

		// Tool result (truncated)
		if (event.toolResult) {
			const resultStr = typeof event.toolResult === 'string' ? event.toolResult : JSON.stringify(event.toolResult);
			details.push({ label: 'Result', value: resultStr.length > 100 ? resultStr.slice(0, 100) + '...' : resultStr });
		}

		return details;
	}

	function clearFilters() {
		typeFilter = 'all';
		agentFilter = 'all';
	}

	let hasActiveFilters = $derived(typeFilter !== 'all' || agentFilter !== 'all');
</script>

{#if isOpen}
	<div class="activity-panel">
		<div class="panel-header">
			<div class="header-left">
				<Icon name="activity" size={16} />
				<span class="header-title">Agent Activity</span>
				{#if connected}
					<span class="status-dot connected" title="Connected"></span>
				{:else}
					<span class="status-dot disconnected" title="Disconnected"></span>
				{/if}
				{#if paused && pausedEvents.length > 0}
					<span class="queued-badge">{pausedEvents.length} queued</span>
				{/if}
			</div>
			<div class="header-actions">
				<button
					class="header-btn"
					class:active={showFilters}
					onclick={() => showFilters = !showFilters}
					title="Filters"
				>
					<Icon name="filter" size={14} />
					{#if hasActiveFilters}
						<span class="filter-dot"></span>
					{/if}
				</button>
				<button
					class="header-btn"
					class:active={paused}
					onclick={togglePause}
					title={paused ? 'Resume feed' : 'Pause feed'}
				>
					<Icon name={paused ? 'play' : 'pause'} size={14} />
				</button>
				{#if onclose}
					<button class="header-btn" onclick={onclose} title="Close">
						<Icon name="x" size={14} />
					</button>
				{/if}
			</div>
		</div>

		{#if showFilters}
			<div class="filter-bar">
				<select bind:value={typeFilter} class="filter-select">
					{#each eventTypes as type}
						<option value={type.value}>{type.label}</option>
					{/each}
				</select>
				<select bind:value={agentFilter} class="filter-select">
					<option value="all">All Agents</option>
					{#each uniqueAgents() as agent}
						<option value={agent}>{agent}</option>
					{/each}
				</select>
				{#if hasActiveFilters}
					<button class="clear-filters-btn" onclick={clearFilters}>
						<Icon name="x" size={12} />
						Clear
					</button>
				{/if}
			</div>
		{/if}

		<div class="panel-content">
			{#if error}
				<div class="error-message">
					<Icon name="alert-circle" size={14} />
					{error}
				</div>
			{/if}

			{#if paused}
				<div class="paused-banner">
					<Icon name="pause-circle" size={14} />
					Feed paused
					{#if pausedEvents.length > 0}
						- {pausedEvents.length} events queued
					{/if}
				</div>
			{/if}

			{#if filteredEvents().length === 0}
				<div class="empty-state">
					<Icon name="inbox" size={32} />
					{#if hasActiveFilters}
						<p>No matching events</p>
						<span>Try adjusting your filters</span>
					{:else}
						<p>No activity yet</p>
						<span>Agent actions will appear here in real-time</span>
					{/if}
				</div>
			{:else}
				<div class="event-list">
					{#each filteredEvents() as event (event.id)}
						{@const isExpanded = expandedIds.has(event.id)}
						{@const details = getEventDetails(event)}
						<div
							class="event-item"
							class:expanded={isExpanded}
							style="--event-color: {getActivityColor(event.type)}"
						>
							<button class="event-main" onclick={() => toggleExpand(event.id)}>
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
								{#if details.length > 0}
									<Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
								{/if}
							</button>
							{#if isExpanded && details.length > 0}
								<div class="event-details">
									{#each details as detail}
										<div class="detail-row">
											<span class="detail-label">{detail.label}</span>
											<span class="detail-value">{detail.value}</span>
										</div>
									{/each}
								</div>
							{/if}
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

	.queued-badge {
		padding: 2px 6px;
		font-size: 11px;
		background: #fef3c7;
		color: #92400e;
		border-radius: 4px;
	}

	.header-actions {
		display: flex;
		gap: 4px;
	}

	.header-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		color: #666666;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.header-btn:hover {
		background: #f0f0f0;
		color: #1a1a1a;
	}

	.header-btn.active {
		background: #e5e7eb;
		color: #1a1a1a;
	}

	.filter-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 6px;
		height: 6px;
		background: #3b82f6;
		border-radius: 50%;
	}

	.filter-bar {
		display: flex;
		gap: 8px;
		padding: 8px 16px;
		background: #f9fafb;
		border-bottom: 1px solid #eaeaea;
	}

	.filter-select {
		padding: 6px 8px;
		font-size: 12px;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		background: #ffffff;
		color: #374151;
		cursor: pointer;
	}

	.filter-select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.clear-filters-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		font-size: 11px;
		border: none;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		border-radius: 4px;
	}

	.clear-filters-btn:hover {
		background: #f3f4f6;
		color: #374151;
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

	.paused-banner {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: #fef3c7;
		color: #92400e;
		font-size: 12px;
		border-bottom: 1px solid #fde68a;
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
		flex-direction: column;
		border-bottom: 1px solid #f5f5f5;
		transition: background 0.15s ease;
	}

	.event-item:hover {
		background: #fafafa;
	}

	.event-item.expanded {
		background: #f9fafb;
	}

	.event-main {
		display: flex;
		gap: 10px;
		padding: 10px 16px;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
		width: 100%;
		align-items: flex-start;
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

	.event-details {
		padding: 8px 16px 12px 50px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.detail-row {
		display: flex;
		gap: 8px;
		font-size: 12px;
	}

	.detail-label {
		color: #9ca3af;
		min-width: 70px;
		flex-shrink: 0;
	}

	.detail-value {
		color: #374151;
		font-family: 'SF Mono', monospace;
		word-break: break-all;
	}
</style>
