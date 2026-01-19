<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Issue } from '$lib/types';

	let {
		isOpen = false,
		issue,
		onclose,
		oncomplete
	}: {
		isOpen: boolean;
		issue: Issue | null;
		onclose: () => void;
		oncomplete: (data: { commit_hash: string; execution_log: string; pr_url?: string }) => void;
	} = $props();

	let commitHash = $state('');
	let executionLog = $state('');
	let prUrl = $state('');
	let isSubmitting = $state(false);
	let error = $state('');

	// Reset form when modal opens
	$effect(() => {
		if (issue && isOpen) {
			commitHash = '';
			executionLog = '';
			prUrl = issue.pr_url || '';
			error = '';
		}
	});

	function handleSubmit() {
		error = '';

		if (!commitHash.trim()) {
			error = 'Commit hash is required';
			return;
		}

		// Validate commit hash format
		const hashRegex = /^[a-f0-9]{7,40}$/i;
		if (!hashRegex.test(commitHash.trim())) {
			error = 'Invalid commit hash format';
			return;
		}

		if (!executionLog.trim()) {
			error = 'Execution log is required';
			return;
		}

		// Validate PR URL if provided
		if (prUrl.trim()) {
			try {
				new URL(prUrl.trim());
			} catch {
				error = 'Invalid PR URL format';
				return;
			}
		}

		isSubmitting = true;
		oncomplete({
			commit_hash: commitHash.trim(),
			execution_log: executionLog.trim(),
			pr_url: prUrl.trim() || undefined
		});
	}

	function handleClose() {
		if (!isSubmitting) {
			commitHash = '';
			executionLog = '';
			prUrl = '';
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
			aria-labelledby="complete-modal-title"
		>
			<div class="modal-header">
				<h2 id="complete-modal-title">Submit for Review</h2>
				<button class="close-btn" onclick={handleClose} disabled={isSubmitting}>
					<Icon name="x" size={20} />
				</button>
			</div>

			<div class="modal-body">
				<p class="issue-info">
					<span class="issue-id">{issue.id}</span>
					<span class="issue-title">{issue.title}</span>
				</p>

				{#if issue.branch_name}
					<div class="branch-info">
						<Icon name="git-branch" size={14} />
						<span>{issue.branch_name}</span>
					</div>
				{/if}

				<div class="form-group">
					<label for="commit-hash">Commit Hash *</label>
					<input
						type="text"
						id="commit-hash"
						bind:value={commitHash}
						placeholder="abc1234 or full 40-char hash"
						disabled={isSubmitting}
					/>
					<p class="help-text">The commit hash containing the implementation</p>
				</div>

				<div class="form-group">
					<label for="execution-log">Execution Log *</label>
					<textarea
						id="execution-log"
						bind:value={executionLog}
						placeholder="Summary of what was done, tests run, files changed..."
						rows="6"
						disabled={isSubmitting}
					></textarea>
					<p class="help-text">Document the implementation and any issues encountered</p>
				</div>

				<div class="form-group">
					<label for="pr-url">Pull Request URL (optional)</label>
					<input
						type="url"
						id="pr-url"
						bind:value={prUrl}
						placeholder="https://github.com/org/repo/pull/123"
						disabled={isSubmitting}
					/>
					<p class="help-text">Link to the pull request if one was created</p>
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
				<button class="btn-submit" onclick={handleSubmit} disabled={isSubmitting}>
					{#if isSubmitting}
						<Icon name="loader" size={16} />
						Submitting...
					{:else}
						<Icon name="check-circle" size={16} />
						Submit for Review
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
		max-width: 520px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #eaeaea;
		position: sticky;
		top: 0;
		background: #ffffff;
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

	.branch-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 6px;
		font-size: 13px;
		color: #166534;
		font-family: monospace;
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
	.form-group textarea {
		padding: 10px 12px;
		font-size: 14px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background: #ffffff;
		color: #1a1a1a;
		font-family: 'Figtree', sans-serif;
		transition: border-color 0.15s ease;
		resize: vertical;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.form-group input:disabled,
	.form-group textarea:disabled {
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
		position: sticky;
		bottom: 0;
		background: #ffffff;
	}

	.btn-cancel,
	.btn-submit {
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

	.btn-submit {
		background: #10b981;
		border: 1px solid #10b981;
		color: #ffffff;
	}

	.btn-submit:hover:not(:disabled) {
		background: #059669;
		border-color: #059669;
	}

	.btn-cancel:disabled,
	.btn-submit:disabled {
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

	.btn-submit:disabled :global(.icon) {
		animation: spin 1s linear infinite;
	}
</style>
