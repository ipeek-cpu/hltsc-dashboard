<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Issue } from '$lib/types';

	interface AgentInfo {
		agentFilename: string;
		agentName: string;
		agentScope: 'global' | 'project';
	}

	let {
		isOpen = false,
		issue,
		agent,
		onconfirm,
		oncancel
	}: {
		isOpen?: boolean;
		issue: Issue | null;
		agent: AgentInfo | null;
		onconfirm?: (options: { startImmediately: boolean }) => void;
		oncancel?: () => void;
	} = $props();

	let startImmediately = $state(false);

	function handleConfirm() {
		onconfirm?.({ startImmediately });
		startImmediately = false;
	}

	function handleCancel() {
		oncancel?.();
		startImmediately = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCancel();
		} else if (e.key === 'Enter') {
			handleConfirm();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleCancel();
		}
	}
</script>

{#if isOpen && issue && agent}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown}>
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal-header">
				<h2 id="modal-title">
					<Icon name="user-plus" size={20} />
					Assign Agent
				</h2>
				<button class="close-btn" onclick={handleCancel}>
					<Icon name="x" size={20} />
				</button>
			</div>

			<div class="modal-body">
				<p class="assignment-summary">
					Assign <strong>{agent.agentName}</strong> to work on:
				</p>

				<div class="issue-preview">
					<span class="issue-id">{issue.id}</span>
					<span class="issue-title">{issue.title}</span>
				</div>

				<div class="agent-info">
					<Icon name={agent.agentScope === 'global' ? 'globe' : 'folder'} size={14} />
					<span class="agent-scope">{agent.agentScope === 'global' ? 'Global agent' : 'Project agent'}</span>
					<span class="agent-filename">{agent.agentFilename}</span>
				</div>

				<label class="checkbox-option">
					<input type="checkbox" bind:checked={startImmediately} />
					<span class="checkbox-label">
						<Icon name="play" size={14} />
						Start task immediately
					</span>
					<span class="checkbox-hint">
						The agent will begin working on this bead right away
					</span>
				</label>
			</div>

			<div class="modal-footer">
				<button class="btn btn-secondary" onclick={handleCancel}>
					Cancel
				</button>
				<button class="btn btn-primary" onclick={handleConfirm}>
					<Icon name="check" size={16} />
					{startImmediately ? 'Assign & Start' : 'Assign Agent'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: #ffffff;
		border-radius: 16px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
		width: 100%;
		max-width: 440px;
		animation: slideIn 0.2s ease;
	}

	@keyframes slideIn {
		from {
			transform: scale(0.95) translateY(-10px);
			opacity: 0;
		}
		to {
			transform: scale(1) translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #f0f0f0;
	}

	.modal-header h2 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		border-radius: 8px;
		color: #888888;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.modal-body {
		padding: 24px;
	}

	.assignment-summary {
		margin: 0 0 16px 0;
		font-size: 14px;
		color: #666666;
	}

	.assignment-summary strong {
		color: #1a1a1a;
	}

	.issue-preview {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px;
		background: #f9fafb;
		border-radius: 10px;
		margin-bottom: 16px;
	}

	.issue-id {
		font-family: monospace;
		font-size: 11px;
		color: #888888;
		background: #ffffff;
		padding: 2px 6px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.issue-title {
		font-size: 14px;
		font-weight: 500;
		color: #1a1a1a;
		line-height: 1.4;
	}

	.agent-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #f0f9ff;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 13px;
		color: #0284c7;
	}

	.agent-scope {
		font-weight: 500;
	}

	.agent-filename {
		font-family: monospace;
		font-size: 12px;
		color: #666666;
		margin-left: auto;
	}

	.checkbox-option {
		display: block;
		padding: 14px;
		background: #fafafa;
		border: 1px solid #f0f0f0;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.checkbox-option:hover {
		border-color: #e0e0e0;
		background: #f5f5f5;
	}

	.checkbox-option input[type="checkbox"] {
		display: none;
	}

	.checkbox-option input[type="checkbox"]:checked + .checkbox-label {
		color: #2563eb;
	}

	.checkbox-option input[type="checkbox"]:checked ~ .checkbox-hint {
		color: #3b82f6;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #666666;
		margin-bottom: 4px;
		transition: color 0.15s ease;
	}

	.checkbox-hint {
		font-size: 12px;
		color: #888888;
		padding-left: 22px;
		transition: color 0.15s ease;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #f0f0f0;
		background: #fafafa;
		border-radius: 0 0 16px 16px;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-secondary {
		background: #ffffff;
		color: #666666;
		border: 1px solid #e0e0e0;
	}

	.btn-secondary:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.btn-primary {
		background: #3b82f6;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #2563eb;
	}
</style>
