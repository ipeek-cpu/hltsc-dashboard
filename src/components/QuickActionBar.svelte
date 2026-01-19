<script lang="ts">
	import Icon from './Icon.svelte';
	import type { QuickAction } from '$lib/profiles';

	let {
		projectId,
		actions = [],
		compact = false
	}: {
		projectId: string;
		actions?: QuickAction[];
		compact?: boolean;
	} = $props();

	let runningActions = $state(new Set<string>());
	let confirmingAction = $state<QuickAction | null>(null);
	let actionResults = $state<Map<string, { success: boolean; message: string }>>(new Map());

	async function executeAction(action: QuickAction) {
		if (action.requiresConfirmation && confirmingAction?.id !== action.id) {
			confirmingAction = action;
			return;
		}

		confirmingAction = null;
		runningActions.add(action.id);
		runningActions = new Set(runningActions);

		try {
			const response = await fetch(`/api/projects/${projectId}/actions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ actionId: action.id, command: action.command })
			});

			const result = await response.json();

			actionResults.set(action.id, {
				success: response.ok,
				message: result.message || (response.ok ? 'Completed' : 'Failed')
			});
			actionResults = new Map(actionResults);

			// Clear result after 3 seconds
			setTimeout(() => {
				actionResults.delete(action.id);
				actionResults = new Map(actionResults);
			}, 3000);
		} catch (error) {
			actionResults.set(action.id, {
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error'
			});
			actionResults = new Map(actionResults);
		} finally {
			runningActions.delete(action.id);
			runningActions = new Set(runningActions);
		}
	}

	function cancelConfirmation() {
		confirmingAction = null;
	}

	function getActionStatus(action: QuickAction): 'idle' | 'running' | 'success' | 'error' {
		if (runningActions.has(action.id)) return 'running';
		const result = actionResults.get(action.id);
		if (result) return result.success ? 'success' : 'error';
		return 'idle';
	}

	function getActionTooltip(action: QuickAction): string {
		const parts: string[] = [];
		if (compact) {
			parts.push(action.label);
		}
		if (action.description) {
			parts.push(action.description);
		}
		if (action.shortcut) {
			parts.push(`(${action.shortcut})`);
		}
		return parts.join(' - ') || action.label;
	}
</script>

{#if actions.length > 0}
	<div class="quick-action-bar" class:compact>
		{#each actions as action}
			{@const status = getActionStatus(action)}
			{@const isConfirming = confirmingAction?.id === action.id}
			<div class="action-wrapper">
				{#if isConfirming}
					<div class="confirm-popup">
						<span class="confirm-message">Run "{action.label}"?</span>
						<button class="confirm-yes" onclick={() => executeAction(action)} title="Confirm and run action">
							<Icon name="check" size={14} />
							Yes
						</button>
						<button class="confirm-no" onclick={cancelConfirmation} title="Cancel">
							<Icon name="x" size={14} />
							No
						</button>
					</div>
				{/if}

				<button
					class="action-button"
					class:running={status === 'running'}
					class:success={status === 'success'}
					class:error={status === 'error'}
					class:confirming={isConfirming}
					onclick={() => executeAction(action)}
					disabled={status === 'running'}
					title={getActionTooltip(action)}
				>
					{#if status === 'running'}
						<span class="spinner"></span>
					{:else if status === 'success'}
						<Icon name="check" size={compact ? 14 : 16} />
					{:else if status === 'error'}
						<Icon name="x" size={compact ? 14 : 16} />
					{:else}
						<Icon name={action.icon} size={compact ? 14 : 16} />
					{/if}
					{#if !compact}
						<span class="action-label">{action.label}</span>
					{/if}
					{#if action.shortcut && !compact}
						<span class="shortcut">{action.shortcut}</span>
					{/if}
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.quick-action-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.quick-action-bar.compact {
		gap: 4px;
	}

	.action-wrapper {
		position: relative;
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.quick-action-bar.compact .action-button {
		padding: 6px 8px;
	}

	.action-button:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #d1d5db;
	}

	.action-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.action-button.running {
		background: #eff6ff;
		border-color: #93c5fd;
		color: #1d4ed8;
	}

	.action-button.success {
		background: #f0fdf4;
		border-color: #86efac;
		color: #15803d;
	}

	.action-button.error {
		background: #fef2f2;
		border-color: #fca5a5;
		color: #dc2626;
	}

	.action-button.confirming {
		background: #fef3c7;
		border-color: #fcd34d;
	}

	.action-label {
		white-space: nowrap;
	}

	.shortcut {
		font-size: 10px;
		font-family: 'SF Mono', monospace;
		color: #9ca3af;
		padding: 2px 4px;
		background: #f3f4f6;
		border-radius: 3px;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid #93c5fd;
		border-top-color: #1d4ed8;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.confirm-popup {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		white-space: nowrap;
		z-index: 10;
	}

	.confirm-popup::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: #ffffff;
	}

	.confirm-message {
		font-size: 13px;
		color: #374151;
	}

	.confirm-yes,
	.confirm-no {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border: none;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		font-family: 'Figtree', sans-serif;
	}

	.confirm-yes {
		background: #22c55e;
		color: white;
	}

	.confirm-yes:hover {
		background: #16a34a;
	}

	.confirm-no {
		background: #e5e7eb;
		color: #374151;
	}

	.confirm-no:hover {
		background: #d1d5db;
	}
</style>
