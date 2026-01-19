<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Issue, Agent } from '$lib/types';

	let {
		isOpen = false,
		issue,
		agents = [],
		onclose,
		onclaim
	}: {
		isOpen: boolean;
		issue: Issue | null;
		agents?: Agent[];
		onclose: () => void;
		onclaim: (data: { branch_name: string; agent_id: string }) => void;
	} = $props();

	let branchName = $state('');
	let selectedAgentId = $state('');
	let isSubmitting = $state(false);
	let error = $state('');

	// Generate default branch name from issue
	$effect(() => {
		if (issue && isOpen) {
			// Create branch name from issue ID and sanitized title
			const sanitizedTitle = issue.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 40);
			branchName = `bead/${issue.id}/${sanitizedTitle}`;
			selectedAgentId = '';
			error = '';
		}
	});

	function handleSubmit() {
		error = '';

		if (!branchName.trim()) {
			error = 'Branch name is required';
			return;
		}

		if (!selectedAgentId.trim()) {
			error = 'Please select an agent';
			return;
		}

		isSubmitting = true;
		onclaim({
			branch_name: branchName.trim(),
			agent_id: selectedAgentId.trim()
		});
	}

	function handleClose() {
		if (!isSubmitting) {
			branchName = '';
			selectedAgentId = '';
			error = '';
			onclose();
		}
	}
</script>

{#if isOpen && issue}
	<div class="modal-overlay" onclick={handleClose} role="presentation">
		<div
			class="modal"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-labelledby="claim-modal-title"
		>
			<div class="modal-header">
				<h2 id="claim-modal-title">Claim Bead</h2>
				<button class="close-btn" onclick={handleClose} disabled={isSubmitting}>
					<Icon name="x" size={20} />
				</button>
			</div>

			<div class="modal-body">
				<p class="issue-info">
					<span class="issue-id">{issue.id}</span>
					<span class="issue-title">{issue.title}</span>
				</p>

				<div class="form-group">
					<label for="branch-name">Branch Name</label>
					<input
						type="text"
						id="branch-name"
						bind:value={branchName}
						placeholder="bead/ISSUE-123/feature-name"
						disabled={isSubmitting}
					/>
					<p class="help-text">The git branch where work will be done</p>
				</div>

				<div class="form-group">
					<label for="agent-select">Agent</label>
					{#if agents.length > 0}
						<select id="agent-select" bind:value={selectedAgentId} disabled={isSubmitting}>
							<option value="">Select an agent...</option>
							{#each agents as agent}
								<option value={agent.filename}>
									{agent.frontmatter.name}
									{#if agent.scope === 'global'}(global){/if}
								</option>
							{/each}
						</select>
					{:else}
						<input
							type="text"
							id="agent-select"
							bind:value={selectedAgentId}
							placeholder="agent-name or @username"
							disabled={isSubmitting}
						/>
					{/if}
					<p class="help-text">The agent or person claiming this bead</p>
				</div>

				{#if error}
					<div class="error-message">
						<Icon name="alert-circle" size={16} />
						{error}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={handleClose} disabled={isSubmitting}>
					Cancel
				</button>
				<button class="btn-claim" onclick={handleSubmit} disabled={isSubmitting}>
					{#if isSubmitting}
						<Icon name="loader" size={16} />
						Claiming...
					{:else}
						<Icon name="git-branch" size={16} />
						Claim Bead
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 24px;
	}

	.modal {
		background: #ffffff;
		border-radius: 16px;
		width: 100%;
		max-width: 480px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #eaeaea;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 500;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
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
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.close-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #1a1a1a;
	}

	.modal-body {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.issue-info {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px;
		background: #f8f8f8;
		border-radius: 8px;
		margin: 0;
	}

	.issue-id {
		font-family: monospace;
		font-size: 12px;
		color: #888888;
		flex-shrink: 0;
	}

	.issue-title {
		font-size: 14px;
		color: #1a1a1a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 13px;
		font-weight: 500;
		color: #4b5563;
	}

	.form-group input,
	.form-group select {
		padding: 10px 12px;
		font-size: 14px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background: #ffffff;
		color: #1a1a1a;
		font-family: 'Figtree', sans-serif;
		transition: border-color 0.15s ease;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.form-group input:disabled,
	.form-group select:disabled {
		background: #f5f5f5;
		color: #888888;
	}

	.help-text {
		font-size: 12px;
		color: #888888;
		margin: 0;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		font-size: 13px;
		color: #dc2626;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #eaeaea;
	}

	.btn-cancel,
	.btn-claim {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 18px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-cancel {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #4b5563;
	}

	.btn-cancel:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.btn-claim {
		background: #3b82f6;
		border: 1px solid #3b82f6;
		color: #ffffff;
	}

	.btn-claim:hover:not(:disabled) {
		background: #2563eb;
		border-color: #2563eb;
	}

	.btn-cancel:disabled,
	.btn-claim:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.btn-claim:disabled :global(.icon) {
		animation: spin 1s linear infinite;
	}
</style>
