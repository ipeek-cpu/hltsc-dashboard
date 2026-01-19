<script lang="ts">
	import Icon from './Icon.svelte';

	interface CustomAction {
		id: string;
		label: string;
		icon: string;
		command: string;
		description?: string;
		requiresConfirmation?: boolean;
	}

	let {
		projectId,
		customActions = [],
		onchange
	}: {
		projectId: string;
		customActions: CustomAction[];
		onchange?: (actions: CustomAction[]) => void;
	} = $props();

	let isOpen = $state(false);
	let isEditing = $state(false);
	let editingAction = $state<CustomAction | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Form state
	let formLabel = $state('');
	let formCommand = $state('');
	let formIcon = $state('terminal');
	let formDescription = $state('');
	let formRequiresConfirmation = $state(false);

	const availableIcons = [
		'terminal',
		'play',
		'hammer',
		'trash-2',
		'refresh-cw',
		'package',
		'upload',
		'download',
		'zap',
		'settings',
		'tool',
		'cpu',
		'database',
		'folder',
		'file',
		'git-branch',
		'code',
		'server',
		'cloud',
		'box'
	];

	function openAddModal() {
		isEditing = false;
		editingAction = null;
		formLabel = '';
		formCommand = '';
		formIcon = 'terminal';
		formDescription = '';
		formRequiresConfirmation = false;
		error = null;
		isOpen = true;
	}

	function openEditModal(action: CustomAction) {
		isEditing = true;
		editingAction = action;
		formLabel = action.label;
		formCommand = action.command;
		formIcon = action.icon || 'terminal';
		formDescription = action.description || '';
		formRequiresConfirmation = action.requiresConfirmation || false;
		error = null;
		isOpen = true;
	}

	function closeModal() {
		isOpen = false;
		editingAction = null;
		error = null;
	}

	async function saveAction() {
		if (!formLabel.trim() || !formCommand.trim()) {
			error = 'Label and command are required';
			return;
		}

		isLoading = true;
		error = null;

		try {
			const actionData = {
				id: editingAction?.id || `custom-${Date.now()}`,
				label: formLabel.trim(),
				command: formCommand.trim(),
				icon: formIcon,
				description: formDescription.trim() || undefined,
				requiresConfirmation: formRequiresConfirmation
			};

			const response = await fetch(`/api/projects/${projectId}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ addAction: actionData })
			});

			if (response.ok) {
				const result = await response.json();
				onchange?.(result.customActions);
				closeModal();
			} else {
				const data = await response.json();
				error = data.error || 'Failed to save action';
			}
		} catch (err) {
			console.error('Failed to save action:', err);
			error = 'Failed to save action';
		} finally {
			isLoading = false;
		}
	}

	async function deleteAction(actionId: string) {
		if (!confirm('Are you sure you want to delete this action?')) {
			return;
		}

		isLoading = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ removeActionId: actionId })
			});

			if (response.ok) {
				const result = await response.json();
				onchange?.(result.customActions);
			}
		} catch (err) {
			console.error('Failed to delete action:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			closeModal();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="custom-actions-section">
	<div class="section-header">
		<span class="section-title">
			<Icon name="zap" size={14} />
			Custom Actions
		</span>
		<button class="add-btn" onclick={openAddModal} title="Add custom action">
			<Icon name="plus" size={14} />
		</button>
	</div>

	{#if customActions.length === 0}
		<div class="empty-state">
			<p>No custom actions yet</p>
			<button class="add-link" onclick={openAddModal}>Add your first action</button>
		</div>
	{:else}
		<div class="actions-list">
			{#each customActions as action}
				<div class="action-item">
					<Icon name={action.icon || 'terminal'} size={16} />
					<div class="action-info">
						<span class="action-label">{action.label}</span>
						<span class="action-command">{action.command}</span>
					</div>
					<div class="action-controls">
						<button
							class="control-btn"
							onclick={() => openEditModal(action)}
							title="Edit action"
						>
							<Icon name="edit-2" size={12} />
						</button>
						<button
							class="control-btn danger"
							onclick={() => deleteAction(action.id)}
							disabled={isLoading}
							title="Delete action"
						>
							<Icon name="trash-2" size={12} />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={closeModal}></div>
	<div class="modal">
		<div class="modal-header">
			<h3>{isEditing ? 'Edit Action' : 'Add Custom Action'}</h3>
			<button class="close-btn" onclick={closeModal}>
				<Icon name="x" size={18} />
			</button>
		</div>

		<div class="modal-body">
			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<div class="form-group">
				<label for="action-label">Label</label>
				<input
					id="action-label"
					type="text"
					bind:value={formLabel}
					placeholder="e.g., Build iOS App"
				/>
			</div>

			<div class="form-group">
				<label for="action-command">Command</label>
				<input
					id="action-command"
					type="text"
					bind:value={formCommand}
					placeholder="e.g., xcodebuild -scheme MyApp build"
				/>
				<span class="hint">Shell command to run in the project directory</span>
			</div>

			<div class="form-group">
				<label for="action-description">Description (optional)</label>
				<input
					id="action-description"
					type="text"
					bind:value={formDescription}
					placeholder="e.g., Build the iOS app for development"
				/>
			</div>

			<div class="form-group">
				<label>Icon</label>
				<div class="icon-picker">
					{#each availableIcons as icon}
						<button
							type="button"
							class="icon-option"
							class:selected={formIcon === icon}
							onclick={() => (formIcon = icon)}
							title={icon}
						>
							<Icon name={icon} size={16} />
						</button>
					{/each}
				</div>
			</div>

			<div class="form-group checkbox-group">
				<label>
					<input type="checkbox" bind:checked={formRequiresConfirmation} />
					<span>Require confirmation before running</span>
				</label>
				<span class="hint">Recommended for destructive actions like clean/reset</span>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn secondary" onclick={closeModal} disabled={isLoading}> Cancel </button>
			<button class="btn primary" onclick={saveAction} disabled={isLoading}>
				{#if isLoading}
					<Icon name="loader" size={14} />
					Saving...
				{:else}
					{isEditing ? 'Update' : 'Add'} Action
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.custom-actions-section {
		padding: 12px 0;
		border-top: 1px solid #e5e7eb;
		margin-top: 8px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px 8px;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #6b7280;
	}

	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.add-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.empty-state {
		padding: 16px 14px;
		text-align: center;
		color: #9ca3af;
		font-size: 12px;
	}

	.empty-state p {
		margin: 0 0 8px;
	}

	.add-link {
		background: none;
		border: none;
		color: #3b82f6;
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
	}

	.add-link:hover {
		color: #2563eb;
	}

	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.action-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		color: #374151;
		transition: background 0.1s;
	}

	.action-item:hover {
		background: #f9fafb;
	}

	.action-info {
		flex: 1;
		min-width: 0;
	}

	.action-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #111827;
	}

	.action-command {
		display: block;
		font-size: 11px;
		color: #6b7280;
		font-family: 'SF Mono', Monaco, monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-controls {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.action-item:hover .action-controls {
		opacity: 1;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.1s;
	}

	.control-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.control-btn.danger:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 200;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 420px;
		max-width: calc(100vw - 40px);
		max-height: calc(100vh - 40px);
		overflow-y: auto;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
		z-index: 201;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.1s;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.modal-body {
		padding: 20px;
	}

	.error-message {
		padding: 10px 12px;
		background: #fee2e2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		color: #dc2626;
		font-size: 13px;
		margin-bottom: 16px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		margin-bottom: 6px;
	}

	.form-group input[type='text'] {
		width: 100%;
		padding: 8px 12px;
		font-size: 14px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-family: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.form-group input[type='text']:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.hint {
		display: block;
		font-size: 11px;
		color: #9ca3af;
		margin-top: 4px;
	}

	.icon-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.icon-option {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #f9fafb;
		border: 2px solid transparent;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.1s;
	}

	.icon-option:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.icon-option.selected {
		background: #eff6ff;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-group input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: #3b82f6;
	}

	.checkbox-group span {
		font-weight: 400;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 16px 20px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0 0 12px 12px;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		font-size: 13px;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.btn.secondary {
		background: #ffffff;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.btn.secondary:hover:not(:disabled) {
		background: #f9fafb;
	}

	.btn.primary {
		background: #3b82f6;
		border: 1px solid #3b82f6;
		color: #ffffff;
	}

	.btn.primary:hover:not(:disabled) {
		background: #2563eb;
		border-color: #2563eb;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
