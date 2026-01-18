<script lang="ts">
	import Icon from './Icon.svelte';

	interface GitCommit {
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		date: string;
		isClaude: boolean;
	}

	let {
		commit,
		commitsToUndo = [],
		hasUnsavedChanges = false,
		onrestore,
		oncancel
	}: {
		commit: GitCommit;
		commitsToUndo?: GitCommit[];
		hasUnsavedChanges?: boolean;
		onrestore: (options: { saveFirst: boolean; commitMessage?: string }) => void;
		oncancel: () => void;
	} = $props();

	let isRestoring = $state(false);
	let saveMessage = $state(`Checkpoint before restore to "${commit.message.slice(0, 30)}${commit.message.length > 30 ? '...' : ''}"`);

	async function handleRestore(saveFirst: boolean) {
		isRestoring = true;
		await onrestore({
			saveFirst,
			commitMessage: saveFirst ? saveMessage : undefined
		});
		isRestoring = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			oncancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={oncancel}>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="restore-title">
		<div class="modal-header">
			<div class="modal-icon">
				<Icon name="rotate-ccw" size={24} />
			</div>
			<h2 id="restore-title">Go back to this version?</h2>
		</div>

		<div class="modal-body">
			<!-- Target Checkpoint -->
			<div class="target-checkpoint">
				<div class="checkpoint-label">Restore to:</div>
				<div class="checkpoint-card">
					<div class="checkpoint-info">
						{#if commit.isClaude}
							<span class="author-badge">🤖</span>
						{:else}
							<span class="author-badge">👤</span>
						{/if}
						<span class="checkpoint-message">{commit.message}</span>
					</div>
					<span class="checkpoint-date">{commit.date}</span>
				</div>
			</div>

			<!-- What will be undone -->
			{#if commitsToUndo.length > 0 || hasUnsavedChanges}
				<div class="undo-section">
					<div class="undo-header">
						<Icon name="alert-triangle" size={16} />
						<span>This will undo:</span>
					</div>

					<div class="undo-list">
						{#if hasUnsavedChanges}
							<div class="undo-item unsaved">
								<Icon name="file-text" size={14} />
								<span>Your unsaved changes</span>
							</div>
						{/if}

						{#each commitsToUndo as undoCommit (undoCommit.hash)}
							<div class="undo-item">
								{#if undoCommit.isClaude}
									<span class="mini-badge">🤖</span>
								{:else}
									<span class="mini-badge">👤</span>
								{/if}
								<span class="undo-message">{undoCommit.message}</span>
								<span class="undo-date">{undoCommit.date}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Warning -->
			<div class="warning-box">
				<Icon name="info" size={16} />
				<p>This action will reset your code to the selected checkpoint. Changes after this point will be removed from the project.</p>
			</div>

			<!-- Save first option (if there are unsaved changes) -->
			{#if hasUnsavedChanges}
				<div class="save-first-option">
					<label class="save-label">
						<span>Save current work before restoring?</span>
					</label>
					<input
						type="text"
						class="save-input"
						placeholder="Checkpoint name (optional)"
						bind:value={saveMessage}
					/>
				</div>
			{/if}
		</div>

		<div class="modal-actions">
			<button class="cancel-btn" onclick={oncancel} disabled={isRestoring}>
				Cancel
			</button>

			{#if hasUnsavedChanges}
				<button
					class="restore-btn secondary"
					onclick={() => handleRestore(false)}
					disabled={isRestoring}
				>
					<Icon name="trash-2" size={16} />
					{isRestoring ? 'Restoring...' : 'Discard & Restore'}
				</button>
				<button
					class="restore-btn primary"
					onclick={() => handleRestore(true)}
					disabled={isRestoring}
				>
					<Icon name="save" size={16} />
					{isRestoring ? 'Restoring...' : 'Save & Restore'}
				</button>
			{:else}
				<button
					class="restore-btn primary"
					onclick={() => handleRestore(false)}
					disabled={isRestoring}
				>
					<Icon name="rotate-ccw" size={16} />
					{isRestoring ? 'Restoring...' : 'Restore'}
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal {
		background: white;
		border-radius: 16px;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 24px 24px 16px;
		border-bottom: 1px solid #f3f4f6;
	}

	.modal-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: #eff6ff;
		border-radius: 12px;
		color: #2563eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #111827;
	}

	.modal-body {
		padding: 20px 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	/* Target Checkpoint */
	.target-checkpoint {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.checkpoint-label {
		font-size: 12px;
		font-weight: 500;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.checkpoint-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		background: #f0fdf4;
		border: 1px solid #86efac;
		border-radius: 10px;
	}

	.checkpoint-info {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.author-badge {
		font-size: 14px;
	}

	.checkpoint-message {
		font-size: 14px;
		font-weight: 500;
		color: #166534;
	}

	.checkpoint-date {
		font-size: 12px;
		color: #15803d;
	}

	/* Undo Section */
	.undo-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.undo-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: #b45309;
	}

	.undo-list {
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 10px;
		padding: 8px;
		max-height: 150px;
		overflow-y: auto;
	}

	.undo-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		font-size: 13px;
		color: #92400e;
		border-radius: 6px;
	}

	.undo-item.unsaved {
		background: #fef3c7;
		font-weight: 500;
	}

	.mini-badge {
		font-size: 12px;
	}

	.undo-message {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.undo-date {
		font-size: 11px;
		color: #b45309;
		flex-shrink: 0;
	}

	/* Warning Box */
	.warning-box {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		background: #f3f4f6;
		border-radius: 10px;
		color: #6b7280;
	}

	.warning-box p {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
	}

	/* Save First Option */
	.save-first-option {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 10px;
	}

	.save-label {
		font-size: 13px;
		font-weight: 500;
		color: #1e40af;
	}

	.save-input {
		padding: 10px 12px;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		font-size: 14px;
		background: white;
	}

	.save-input:focus {
		outline: none;
		border-color: #2563eb;
	}

	/* Actions */
	.modal-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		background: #f9fafb;
		border-top: 1px solid #f3f4f6;
	}

	.cancel-btn,
	.restore-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 18px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.cancel-btn {
		background: white;
		border: 1px solid #e5e7eb;
		color: #6b7280;
	}

	.cancel-btn:hover:not(:disabled) {
		background: #f9fafb;
	}

	.restore-btn.secondary {
		background: white;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.restore-btn.secondary:hover:not(:disabled) {
		background: #fef2f2;
		border-color: #fecaca;
		color: #dc2626;
	}

	.restore-btn.primary {
		background: #2563eb;
		border: none;
		color: white;
	}

	.restore-btn.primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.cancel-btn:disabled,
	.restore-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
