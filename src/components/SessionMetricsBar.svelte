<script lang="ts">
	import type { SessionMetrics } from '$lib/session-metrics';
	import type { Session, SessionStatus } from '$lib/session-context-types';
	import {
		formatDuration,
		formatCost,
		formatTokens,
		getContextWarningLevel,
		getModelInfo
	} from '$lib/session-metrics';
	import Icon from './Icon.svelte';

	let {
		metrics,
		session = null,
		onNewSession,
		onPauseSession,
		onResumeSession,
		onEndSession,
		onBeadClick
	}: {
		metrics: SessionMetrics;
		session?: Session | null;
		onNewSession?: () => void;
		onPauseSession?: () => void;
		onResumeSession?: () => void;
		onEndSession?: () => void;
		onBeadClick?: (beadId: string) => void;
	} = $props();

	let modelInfo = $derived(getModelInfo(metrics.model));
	let contextWarning = $derived(getContextWarningLevel(metrics.contextUsagePercent));
	let totalTokens = $derived(metrics.totalInputTokens + metrics.totalOutputTokens);

	// Session status helpers
	function getStatusColor(status: SessionStatus): string {
		switch (status) {
			case 'active': return '#10b981'; // green
			case 'paused': return '#f59e0b'; // yellow/amber
			case 'draft': return '#6b7280';  // gray
			case 'closed': return '#9ca3af'; // lighter gray
			default: return '#6b7280';
		}
	}

	function getStatusLabel(status: SessionStatus): string {
		switch (status) {
			case 'active': return 'Active';
			case 'paused': return 'Paused';
			case 'draft': return 'Draft';
			case 'closed': return 'Closed';
			default: return status;
		}
	}

	// Update durations every second
	let sessionDuration = $state(0);
	let blockDuration = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			const now = Date.now();
			sessionDuration = now - metrics.sessionStartTime;
			blockDuration = metrics.blockStartTime ? now - metrics.blockStartTime : 0;
		}, 1000);

		return () => clearInterval(interval);
	});
</script>

<div class="metrics-bar">
	<div class="metrics-left">
		<!-- Session status and info -->
		{#if session}
			<div class="session-info">
				<span class="status-dot" style="background: {getStatusColor(session.status)}"></span>
				<span class="status-label">{getStatusLabel(session.status)}</span>
				{#if session.title}
					<span class="session-title">{session.title}</span>
				{/if}
			</div>

			{#if session.beadId && onBeadClick}
				<button class="bead-link" onclick={() => onBeadClick(session.beadId!)}>
					<Icon name="circle" size={12} />
					<span>{session.beadId}</span>
				</button>
			{/if}

			{#if session.agentName}
				<div class="agent-badge">
					<Icon name="cpu" size={12} />
					<span>{session.agentName}</span>
				</div>
			{/if}
		{/if}

		<div class="metric model">
			<span class="model-badge" style="background: {modelInfo.bg}; color: {modelInfo.color}">
				{modelInfo.label}
			</span>
		</div>

		{#if blockDuration > 0}
			<div class="metric">
				<Icon name="clock" size={14} />
				<span class="metric-label">Block:</span>
				<span class="metric-value">{formatDuration(blockDuration)}</span>
			</div>
		{/if}

		<div class="metric context" class:warning={contextWarning === 'warning'} class:danger={contextWarning === 'danger'}>
			<Icon name="database" size={14} />
			<span class="metric-label">Ctx:</span>
			<span class="metric-value">{metrics.contextUsagePercent.toFixed(1)}%</span>
			{#if contextWarning !== 'none'}
				<Icon name="alert-triangle" size={12} />
			{/if}
		</div>
	</div>

	<div class="metrics-right">
		<div class="metric">
			<Icon name="clock" size={14} />
			<span class="metric-label">Session:</span>
			<span class="metric-value">{formatDuration(sessionDuration)}</span>
		</div>

		<div class="metric">
			<Icon name="hash" size={14} />
			<span class="metric-label">Tokens:</span>
			<span class="metric-value">{formatTokens(totalTokens)}</span>
		</div>

		<div class="metric cost">
			<Icon name="dollar-sign" size={14} />
			<span class="metric-value">{formatCost(metrics.totalCostUsd)}</span>
		</div>

		<!-- Session control buttons -->
		{#if session && session.status !== 'closed'}
			<div class="session-controls">
				{#if session.status === 'active' && onPauseSession}
					<button class="control-btn pause" onclick={onPauseSession} title="Pause session">
						<Icon name="pause" size={14} />
					</button>
				{:else if session.status === 'paused' && onResumeSession}
					<button class="control-btn resume" onclick={onResumeSession} title="Resume session">
						<Icon name="play" size={14} />
					</button>
				{/if}

				{#if onEndSession}
					<button class="control-btn end" onclick={onEndSession} title="End session">
						<Icon name="square" size={14} />
					</button>
				{/if}
			</div>
		{/if}

		{#if contextWarning === 'danger' && onNewSession}
			<button class="new-session-btn" onclick={onNewSession} title="Start new session to reset context">
				<Icon name="refresh-cw" size={14} />
				<span>New Session</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.metrics-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		font-size: 12px;
		gap: 16px;
	}

	.metrics-left,
	.metrics-right {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #6b7280;
	}

	.metric-label {
		color: #9ca3af;
	}

	.metric-value {
		font-weight: 500;
		color: #374151;
	}

	.model-badge {
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
	}

	.metric.context {
		padding: 4px 8px;
		border-radius: 4px;
		background: #f3f4f6;
	}

	.metric.context.warning {
		background: #fef3c7;
		color: #92400e;
	}

	.metric.context.warning .metric-value {
		color: #92400e;
	}

	.metric.context.danger {
		background: #fee2e2;
		color: #dc2626;
	}

	.metric.context.danger .metric-value {
		color: #dc2626;
	}

	.metric.cost .metric-value {
		color: #059669;
	}

	.new-session-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: #fee2e2;
		border: 1px solid #fecaca;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #dc2626;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.new-session-btn:hover {
		background: #fecaca;
		border-color: #fca5a5;
	}

	/* Session info styles */
	.session-info {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-right: 12px;
		border-right: 1px solid #e5e7eb;
		margin-right: 4px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #6b7280;
	}

	.session-title {
		font-size: 12px;
		font-weight: 500;
		color: #374151;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bead-link {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #2563eb;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.bead-link:hover {
		background: #dbeafe;
		border-color: #93c5fd;
	}

	.agent-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #f3f4f6;
		border-radius: 4px;
		font-size: 11px;
		color: #6b7280;
	}

	.session-controls {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 8px;
		padding-left: 8px;
		border-left: 1px solid #e5e7eb;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.control-btn.pause:hover {
		background: #fef3c7;
		border-color: #fcd34d;
		color: #92400e;
	}

	.control-btn.resume:hover {
		background: #d1fae5;
		border-color: #6ee7b7;
		color: #047857;
	}

	.control-btn.end:hover {
		background: #fee2e2;
		border-color: #fca5a5;
		color: #dc2626;
	}
</style>
