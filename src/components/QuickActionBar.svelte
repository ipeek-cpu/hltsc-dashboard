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

	// Result viewer state
	let lastResult = $state<{
		actionId: string;
		actionLabel: string;
		command: string;
		success: boolean;
		stdout: string;
		stderr: string;
		exitCode: number;
		duration: number;
		timestamp: Date;
	} | null>(null);

	let resultExpanded = $state(false);
	let dryRunMode = $state(false);

	async function executeAction(action: QuickAction) {
		if (action.requiresConfirmation && confirmingAction?.id !== action.id) {
			confirmingAction = action;
			return;
		}

		confirmingAction = null;
		runningActions.add(action.id);
		runningActions = new Set(runningActions);

		const startTime = Date.now();

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

			// Store full result for result viewer
			lastResult = {
				actionId: action.id,
				actionLabel: action.label,
				command: result.command || action.command,
				success: result.success ?? response.ok,
				stdout: result.stdout || '',
				stderr: result.stderr || '',
				exitCode: result.exitCode ?? (response.ok ? 0 : 1),
				duration: Date.now() - startTime,
				timestamp: new Date()
			};
			resultExpanded = true; // Auto-expand on completion

			// Clear button result indicator after 3 seconds
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

			// Store error result for result viewer
			lastResult = {
				actionId: action.id,
				actionLabel: action.label,
				command: action.command,
				success: false,
				stdout: '',
				stderr: error instanceof Error ? error.message : 'Unknown error',
				exitCode: 1,
				duration: Date.now() - startTime,
				timestamp: new Date()
			};
			resultExpanded = true; // Auto-expand on error too
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

	// Result viewer helper functions
	async function copyOutput() {
		if (!lastResult) return;
		const text = [
			`$ ${lastResult.command}`,
			lastResult.stdout,
			lastResult.stderr ? `\nErrors:\n${lastResult.stderr}` : ''
		]
			.filter(Boolean)
			.join('\n');

		await navigator.clipboard.writeText(text);
		// Could add toast notification here
	}

	async function sendToClaude() {
		if (!lastResult) return;
		// Dispatch event to send to active chat
		const event = new CustomEvent('send-to-claude', {
			detail: {
				type: 'action_result',
				content: formatActionForChat(lastResult)
			}
		});
		window.dispatchEvent(event);
	}

	function formatActionForChat(result: NonNullable<typeof lastResult>): string {
		return `**Action Result: ${result.actionLabel}**

\`\`\`
$ ${result.command}
${result.stdout}
\`\`\`
${result.stderr ? `\nErrors:\n\`\`\`\n${result.stderr}\n\`\`\`` : ''}

Exit code: ${result.exitCode} | Duration: ${result.duration}ms`;
	}

	function dismissResult() {
		lastResult = null;
		resultExpanded = false;
	}
</script>

{#if actions.length > 0}
	<div class="quick-action-container">
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

		<!-- Result Viewer Dropdown -->
		{#if lastResult}
			<div class="result-viewer" class:expanded={resultExpanded}>
				<div class="result-header">
					<button class="result-toggle" onclick={() => (resultExpanded = !resultExpanded)}>
						<div class="result-summary">
							<Icon name={lastResult.success ? 'check-circle' : 'x-circle'} size={14} />
							<span class="result-label">{lastResult.actionLabel}</span>
							<span class="result-meta">{lastResult.duration}ms | exit {lastResult.exitCode}</span>
						</div>
						<Icon name={resultExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
					</button>
					<button class="dismiss-btn" onclick={dismissResult} title="Dismiss">
						<Icon name="x" size={12} />
					</button>
				</div>

				{#if resultExpanded}
					<div class="result-content">
						<div class="result-command">
							<code>$ {lastResult.command}</code>
						</div>

						{#if lastResult.stdout}
							<div class="result-output">
								<pre>{lastResult.stdout}</pre>
							</div>
						{/if}

						{#if lastResult.stderr}
							<div class="result-error">
								<pre>{lastResult.stderr}</pre>
							</div>
						{/if}

						<div class="result-actions">
							<button class="btn-action" onclick={copyOutput}>
								<Icon name="copy" size={12} />
								Copy
							</button>
							<button class="btn-action" onclick={sendToClaude}>
								<Icon name="message-circle" size={12} />
								Send to Claude
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
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

	/* Result Viewer Styles */
	.quick-action-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.result-viewer {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		overflow: hidden;
	}

	.result-viewer.expanded {
		border-color: #d1d5db;
	}

	.result-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.result-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: none;
		border: none;
		color: #374151;
		cursor: pointer;
		font-family: 'Figtree', sans-serif;
	}

	.result-toggle:hover {
		background: #f3f4f6;
	}

	.result-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}

	.result-summary :global(.icon) {
		flex-shrink: 0;
	}

	.result-viewer:has(.result-summary :global(.icon):first-child) .result-summary :global(.icon):first-child {
		color: #15803d;
	}

	.result-viewer .result-summary :global(.icon):first-child {
		color: #15803d;
	}

	.result-viewer:not(.expanded) .result-summary :global(.icon):first-child,
	.result-viewer .result-summary :global(.icon):first-child {
		color: inherit;
	}

	.result-label {
		font-weight: 500;
	}

	.result-meta {
		color: #6b7280;
		font-size: 0.7rem;
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		margin-right: 0.5rem;
		background: none;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.result-content {
		padding: 0.75rem;
		border-top: 1px solid #e5e7eb;
	}

	.result-command {
		padding: 0.5rem;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		margin-bottom: 0.5rem;
	}

	.result-command code {
		font-size: 0.75rem;
		font-family: 'SF Mono', monospace;
		color: #6b7280;
	}

	.result-output pre,
	.result-error pre {
		margin: 0;
		padding: 0.5rem;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: 'SF Mono', monospace;
		overflow-x: auto;
		max-height: 200px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.result-output {
		margin-bottom: 0.5rem;
	}

	.result-error pre {
		color: #dc2626;
		background: #fef2f2;
		border-color: #fecaca;
	}

	.result-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.btn-action {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		color: #6b7280;
		font-size: 0.7rem;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
	}

	.btn-action:hover {
		background: #f3f4f6;
		color: #374151;
		border-color: #d1d5db;
	}
</style>
