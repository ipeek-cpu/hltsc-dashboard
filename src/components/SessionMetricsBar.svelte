<script lang="ts">
	import type { SessionMetrics } from '$lib/session-metrics';
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
		onNewSession
	}: {
		metrics: SessionMetrics;
		onNewSession?: () => void;
	} = $props();

	let modelInfo = $derived(getModelInfo(metrics.model));
	let contextWarning = $derived(getContextWarningLevel(metrics.contextUsagePercent));
	let totalTokens = $derived(metrics.totalInputTokens + metrics.totalOutputTokens);

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
</style>
