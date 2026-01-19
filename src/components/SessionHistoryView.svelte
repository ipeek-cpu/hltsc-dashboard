<script lang="ts">
	import { browser } from '$app/environment';
	import type { SessionContext } from '$lib/session-context-types';
	import { formatDuration, formatCost, formatTokens } from '$lib/session-metrics';
	import Icon from './Icon.svelte';

	let {
		projectId,
		isVisible = true
	}: {
		projectId: string;
		isVisible?: boolean;
	} = $props();

	let sessions = $state<SessionContext[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Expanded session for viewing details
	let expandedSessionId = $state<string | null>(null);

	async function fetchSessions() {
		if (!projectId) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/sessions?limit=50`);
			if (response.ok) {
				const data = await response.json();
				sessions = data.sessions || [];
			} else {
				error = 'Failed to load sessions';
			}
		} catch (err) {
			console.error('Error fetching sessions:', err);
			error = 'Failed to load sessions';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (browser && isVisible && projectId) {
			fetchSessions();
		}
	});

	function toggleExpanded(sessionId: string) {
		expandedSessionId = expandedSessionId === sessionId ? null : sessionId;
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatRelativeTime(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return formatDate(dateString);
	}

	function getSessionDuration(session: SessionContext): string {
		if (session.durationMs > 0) {
			return formatDuration(session.durationMs);
		}
		if (session.endedAt) {
			const start = new Date(session.createdAt).getTime();
			const end = new Date(session.endedAt).getTime();
			return formatDuration(end - start);
		}
		return '—';
	}
</script>

<div class="session-history">
	{#if loading}
		<div class="loading-state">
			<Icon name="loader" size={24} />
			<p>Loading session history...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<Icon name="alert-circle" size={24} />
			<p>{error}</p>
			<button class="retry-btn" onclick={fetchSessions}>Retry</button>
		</div>
	{:else if sessions.length === 0}
		<div class="empty-state">
			<Icon name="clock" size={48} />
			<h3>No Session History</h3>
			<p>Session summaries will appear here after you use the chat.</p>
		</div>
	{:else}
		<div class="sessions-list">
			{#each sessions as session}
				<div class="session-card" class:expanded={expandedSessionId === session.id}>
					<button class="session-header" onclick={() => toggleExpanded(session.id)}>
						<div class="session-main">
							<div class="session-time">
								<span class="relative-time">{formatRelativeTime(session.createdAt)}</span>
								<span class="absolute-time">{formatDate(session.createdAt)}</span>
							</div>
							<div class="session-summary">
								{#if session.summary}
									<p class="summary-text">{session.summary.substring(0, 150)}{session.summary.length > 150 ? '...' : ''}</p>
								{:else}
									<p class="no-summary">No summary recorded</p>
								{/if}
							</div>
						</div>
						<div class="session-stats">
							<div class="stat">
								<Icon name="clock" size={14} />
								<span>{getSessionDuration(session)}</span>
							</div>
							<div class="stat">
								<Icon name="hash" size={14} />
								<span>{formatTokens(session.totalInputTokens + session.totalOutputTokens)}</span>
							</div>
							<div class="stat cost">
								<Icon name="dollar-sign" size={14} />
								<span>{formatCost(session.totalCostUsd)}</span>
							</div>
							<Icon
								name={expandedSessionId === session.id ? 'chevron-up' : 'chevron-down'}
								size={16}
							/>
						</div>
					</button>

					{#if expandedSessionId === session.id}
						<div class="session-details">
							{#if session.summary}
								<div class="detail-section">
									<h4>Summary</h4>
									<p>{session.summary}</p>
								</div>
							{/if}

							{#if session.keyDecisions && session.keyDecisions.length > 0}
								<div class="detail-section">
									<h4>Key Decisions</h4>
									<ul>
										{#each session.keyDecisions as decision}
											<li>{decision}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if session.nextSteps && session.nextSteps.length > 0}
								<div class="detail-section">
									<h4>Next Steps</h4>
									<ol>
										{#each session.nextSteps as step}
											<li>{step}</li>
										{/each}
									</ol>
								</div>
							{/if}

							<div class="detail-section metrics">
								<h4>Metrics</h4>
								<div class="metrics-grid">
									<div class="metric-item">
										<span class="metric-label">Duration</span>
										<span class="metric-value">{getSessionDuration(session)}</span>
									</div>
									<div class="metric-item">
										<span class="metric-label">Input Tokens</span>
										<span class="metric-value">{formatTokens(session.totalInputTokens)}</span>
									</div>
									<div class="metric-item">
										<span class="metric-label">Output Tokens</span>
										<span class="metric-value">{formatTokens(session.totalOutputTokens)}</span>
									</div>
									<div class="metric-item">
										<span class="metric-label">Total Cost</span>
										<span class="metric-value">{formatCost(session.totalCostUsd)}</span>
									</div>
								</div>
							</div>

							{#if session.endedAt}
								<div class="session-footer">
									<span class="ended-label">Ended {formatDate(session.endedAt)}</span>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.session-history {
		height: 100%;
		overflow-y: auto;
		padding: 24px;
		background: #fafafa;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 24px;
		text-align: center;
		color: #6b7280;
	}

	.loading-state :global(.icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.empty-state h3 {
		margin: 16px 0 8px;
		font-size: 18px;
		font-weight: 600;
		color: #374151;
	}

	.empty-state p,
	.loading-state p,
	.error-state p {
		margin: 8px 0 16px;
		font-size: 14px;
	}

	.retry-btn {
		padding: 8px 16px;
		background: #3b82f6;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		font-family: inherit;
	}

	.retry-btn:hover {
		background: #2563eb;
	}

	.sessions-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 800px;
		margin: 0 auto;
	}

	.session-card {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		transition: box-shadow 0.15s ease;
	}

	.session-card:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	.session-card.expanded {
		border-color: #3b82f6;
	}

	.session-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		gap: 16px;
	}

	.session-header:hover {
		background: #f9fafb;
	}

	.session-main {
		flex: 1;
		min-width: 0;
	}

	.session-time {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.relative-time {
		font-size: 13px;
		font-weight: 600;
		color: #374151;
	}

	.absolute-time {
		font-size: 12px;
		color: #9ca3af;
	}

	.session-summary {
		font-size: 14px;
		line-height: 1.5;
	}

	.summary-text {
		margin: 0;
		color: #4b5563;
	}

	.no-summary {
		margin: 0;
		color: #9ca3af;
		font-style: italic;
	}

	.session-stats {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-shrink: 0;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: #6b7280;
	}

	.stat.cost {
		color: #059669;
	}

	.session-details {
		padding: 0 16px 16px;
		border-top: 1px solid #f3f4f6;
	}

	.detail-section {
		margin-top: 16px;
	}

	.detail-section h4 {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.detail-section p {
		margin: 0;
		font-size: 14px;
		color: #374151;
		line-height: 1.6;
	}

	.detail-section ul,
	.detail-section ol {
		margin: 0;
		padding-left: 20px;
		font-size: 14px;
		color: #374151;
		line-height: 1.6;
	}

	.detail-section.metrics {
		padding: 12px;
		background: #f9fafb;
		border-radius: 8px;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}

	.metric-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label {
		font-size: 11px;
		color: #9ca3af;
	}

	.metric-value {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.session-footer {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid #f3f4f6;
	}

	.ended-label {
		font-size: 12px;
		color: #9ca3af;
	}
</style>
