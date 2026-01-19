<script lang="ts">
	import type { SessionSummary, SessionStatus } from '$lib/session-context-types';
	import Icon from './Icon.svelte';

	let {
		sessions,
		activeSessionId = null,
		filter = 'all',
		onSessionClick,
		onFilterChange,
		onNewSession
	}: {
		sessions: SessionSummary[];
		activeSessionId?: string | null;
		filter?: 'all' | 'active' | 'closed';
		onSessionClick?: (sessionId: string) => void;
		onFilterChange?: (filter: 'all' | 'active' | 'closed') => void;
		onNewSession?: () => void;
	} = $props();

	// Filter sessions based on current filter
	let filteredSessions = $derived(() => {
		if (filter === 'all') return sessions;
		if (filter === 'active') return sessions.filter(s => s.status === 'active' || s.status === 'paused');
		if (filter === 'closed') return sessions.filter(s => s.status === 'closed');
		return sessions;
	});

	// Status helpers
	function getStatusColor(status: SessionStatus): string {
		switch (status) {
			case 'active': return '#10b981';
			case 'paused': return '#f59e0b';
			case 'draft': return '#6b7280';
			case 'closed': return '#9ca3af';
			default: return '#6b7280';
		}
	}

	function getStatusIcon(status: SessionStatus): string {
		switch (status) {
			case 'active': return 'play-circle';
			case 'paused': return 'pause-circle';
			case 'closed': return 'check-circle';
			default: return 'circle';
		}
	}

	// Format relative time
	function formatTimeAgo(isoDate: string): string {
		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	// Get session display title
	function getSessionTitle(session: SessionSummary): string {
		if (session.title) return session.title;
		if (session.beadId) return session.beadId;
		if (session.agentName) return session.agentName;
		return 'Untitled Session';
	}
</script>

<div class="session-list">
	<div class="list-header">
		<h3 class="list-title">Sessions</h3>
		{#if onNewSession}
			<button class="new-btn" onclick={onNewSession} title="New session">
				<Icon name="plus" size={14} />
			</button>
		{/if}
	</div>

	{#if onFilterChange}
		<div class="filter-tabs">
			<button
				class="filter-tab"
				class:active={filter === 'all'}
				onclick={() => onFilterChange('all')}
			>
				All
			</button>
			<button
				class="filter-tab"
				class:active={filter === 'active'}
				onclick={() => onFilterChange('active')}
			>
				Active
			</button>
			<button
				class="filter-tab"
				class:active={filter === 'closed'}
				onclick={() => onFilterChange('closed')}
			>
				Closed
			</button>
		</div>
	{/if}

	<div class="sessions-container">
		{#if filteredSessions().length === 0}
			<div class="empty-state">
				<Icon name="message-circle" size={24} />
				<span>No sessions yet</span>
			</div>
		{:else}
			{#each filteredSessions() as session (session.id)}
				<button
					class="session-item"
					class:active={session.id === activeSessionId}
					class:is-active-status={session.status === 'active'}
					onclick={() => onSessionClick?.(session.id)}
				>
					<div class="session-status">
						<Icon name={getStatusIcon(session.status)} size={14} style="color: {getStatusColor(session.status)}" />
					</div>
					<div class="session-content">
						<div class="session-title-row">
							<span class="session-title">{getSessionTitle(session)}</span>
							<span class="session-time">{formatTimeAgo(session.lastActivityAt)}</span>
						</div>
						<div class="session-meta">
							{#if session.agentName && !session.title?.includes(session.agentName)}
								<span class="meta-agent">{session.agentName}</span>
							{/if}
							<span class="meta-messages">{session.messageCount} msgs</span>
						</div>
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.session-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-radius: 8px;
		overflow: hidden;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #e5e7eb;
	}

	.list-title {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #1f2937;
	}

	.new-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.new-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.filter-tabs {
		display: flex;
		gap: 4px;
		padding: 8px 12px;
		border-bottom: 1px solid #f3f4f6;
	}

	.filter-tab {
		flex: 1;
		padding: 6px 12px;
		background: transparent;
		border: none;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.filter-tab:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.filter-tab.active {
		background: #2563eb;
		color: #ffffff;
	}

	.sessions-container {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px 16px;
		color: #9ca3af;
		text-align: center;
		font-size: 13px;
	}

	.session-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font-family: inherit;
	}

	.session-item:hover {
		background: #f9fafb;
	}

	.session-item.active {
		background: #eff6ff;
		border-color: #bfdbfe;
	}

	.session-item.is-active-status {
		border-left: 3px solid #10b981;
		padding-left: 9px;
	}

	.session-status {
		flex-shrink: 0;
		padding-top: 2px;
	}

	.session-content {
		flex: 1;
		min-width: 0;
	}

	.session-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 4px;
	}

	.session-title {
		font-size: 13px;
		font-weight: 500;
		color: #1f2937;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.session-time {
		font-size: 11px;
		color: #9ca3af;
		white-space: nowrap;
	}

	.session-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: #6b7280;
	}

	.meta-agent {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.meta-agent::before {
		content: '';
		width: 4px;
		height: 4px;
		background: #d1d5db;
		border-radius: 50%;
	}

	.meta-messages {
		color: #9ca3af;
	}
</style>
