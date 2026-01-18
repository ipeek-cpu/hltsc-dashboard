<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		status: 'stopped' | 'starting' | 'running' | 'error';
		port?: number;
		framework?: string;
		frameworkDisplayName?: string;
		error?: string;
		onOpenInBrowser?: () => void;
	}

	let {
		status,
		port,
		framework,
		frameworkDisplayName,
		error,
		onOpenInBrowser
	}: Props = $props();

	const statusConfig = {
		stopped: { label: 'Stopped', color: '#6b7280', icon: 'circle' },
		starting: { label: 'Starting...', color: '#f59e0b', icon: 'loader' },
		running: { label: 'Running', color: '#10b981', icon: 'check-circle' },
		error: { label: 'Error', color: '#ef4444', icon: 'alert-circle' }
	};

	let config = $derived(statusConfig[status] || statusConfig.stopped);
</script>

<div class="status-bar">
	<div class="status-left">
		<div class="status-indicator" style="color: {config.color}">
			<Icon name={config.icon} size={16} />
			<span class="status-label">{config.label}</span>
		</div>

		{#if status === 'running' && port}
			<div class="port-badge">
				<Icon name="globe" size={14} />
				<span>Port {port}</span>
			</div>
		{/if}

		{#if frameworkDisplayName || framework}
			<div class="framework-badge">
				{frameworkDisplayName || framework}
			</div>
		{/if}

		{#if status === 'error' && error}
			<div class="error-message">
				{error}
			</div>
		{/if}
	</div>

	<div class="status-right">
		{#if status === 'running' && onOpenInBrowser}
			<button class="open-browser-btn" onclick={onOpenInBrowser}>
				<Icon name="external-link" size={14} />
				<span>Open in Browser</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		background: #1f2937;
		border-top: 1px solid #374151;
		font-size: 13px;
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.status-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}

	.status-indicator :global(.icon) {
		flex-shrink: 0;
	}

	.status-indicator :global(.icon[data-name="loader"]) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.status-label {
		color: inherit;
	}

	.port-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: rgba(59, 130, 246, 0.15);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 4px;
		color: #93c5fd;
		font-size: 12px;
	}

	.framework-badge {
		padding: 4px 10px;
		background: rgba(139, 92, 246, 0.15);
		border: 1px solid rgba(139, 92, 246, 0.3);
		border-radius: 4px;
		color: #c4b5fd;
		font-size: 12px;
		font-weight: 500;
	}

	.error-message {
		color: #fca5a5;
		font-size: 12px;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.open-browser-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: transparent;
		border: 1px solid #4b5563;
		border-radius: 6px;
		color: #d1d5db;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.open-browser-btn:hover {
		background: #374151;
		border-color: #6b7280;
		color: #ffffff;
	}
</style>
