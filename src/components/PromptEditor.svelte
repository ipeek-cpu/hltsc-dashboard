<script lang="ts">
	import type { SessionPrompt, PromptType } from '$lib/prompt-types';
	import Icon from './Icon.svelte';

	let {
		prompts = [],
		startPrompt = null,
		endPrompt = null,
		hasPromptsDir = false,
		projectId,
		onupdate
	}: {
		prompts: SessionPrompt[];
		startPrompt: SessionPrompt | null;
		endPrompt: SessionPrompt | null;
		hasPromptsDir: boolean;
		projectId: string;
		onupdate: () => void;
	} = $props();

	let selectedPrompt = $state<SessionPrompt | null>(null);
	let editContent = $state('');
	let isEditing = $state(false);
	let isSaving = $state(false);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	// New prompt form
	let newPromptName = $state('');
	let newPromptType = $state<PromptType>('start');
	let newPromptDescription = $state('');

	function selectPrompt(prompt: SessionPrompt) {
		selectedPrompt = prompt;
		editContent = prompt.rawContent;
		isEditing = false;
		error = null;
	}

	function startEditing() {
		isEditing = true;
	}

	function cancelEditing() {
		if (selectedPrompt) {
			editContent = selectedPrompt.rawContent;
		}
		isEditing = false;
		error = null;
	}

	async function savePrompt() {
		if (!selectedPrompt) return;

		isSaving = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filename: selectedPrompt.filename,
					content: editContent
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save prompt');
			}

			const data = await response.json();
			selectedPrompt = data.prompt;
			isEditing = false;
			onupdate();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			isSaving = false;
		}
	}

	async function createDefaultPrompts() {
		isSaving = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ createDefaults: true })
			});

			if (!response.ok) {
				throw new Error('Failed to create default prompts');
			}

			onupdate();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create defaults';
		} finally {
			isSaving = false;
		}
	}

	function showCreateForm() {
		isCreating = true;
		newPromptName = '';
		newPromptType = 'start';
		newPromptDescription = '';
	}

	function cancelCreate() {
		isCreating = false;
	}

	async function createNewPrompt() {
		if (!newPromptName.trim()) {
			error = 'Name is required';
			return;
		}

		isSaving = true;
		error = null;

		// Generate filename from name
		const filename = newPromptName.toLowerCase().replace(/\s+/g, '-') + '.md';

		// Build content with frontmatter
		const content = `---
name: ${newPromptName}
type: ${newPromptType}
description: ${newPromptDescription || 'Custom prompt'}
enabled: true
---

# ${newPromptName}

${newPromptType === 'start' ? 'Your session start instructions here...' : 'Your session wrap-up instructions here...'}
`;

		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename, content })
			});

			if (!response.ok) {
				throw new Error('Failed to create prompt');
			}

			isCreating = false;
			onupdate();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create';
		} finally {
			isSaving = false;
		}
	}

	async function deletePrompt() {
		if (!selectedPrompt || selectedPrompt.scope !== 'project') return;

		if (!confirm(`Delete "${selectedPrompt.frontmatter.name}"?`)) return;

		isSaving = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/prompts`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: selectedPrompt.filename })
			});

			if (!response.ok) {
				throw new Error('Failed to delete prompt');
			}

			selectedPrompt = null;
			isEditing = false;
			onupdate();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete';
		} finally {
			isSaving = false;
		}
	}

	function getTypeIcon(type: PromptType): string {
		return type === 'start' ? 'play-circle' : 'stop-circle';
	}

	function getTypeColor(type: PromptType): string {
		return type === 'start' ? '#22c55e' : '#f59e0b';
	}
</script>

<div class="prompt-editor">
	<div class="sidebar">
		<div class="sidebar-header">
			<h3>Session Prompts</h3>
			<button class="icon-btn" onclick={showCreateForm} title="Create new prompt">
				<Icon name="plus" size={18} />
			</button>
		</div>

		{#if !hasPromptsDir && prompts.length === 0}
			<div class="empty-state">
				<Icon name="file-text" size={32} />
				<p>No prompts configured</p>
				<button class="primary-btn" onclick={createDefaultPrompts} disabled={isSaving}>
					{isSaving ? 'Creating...' : 'Create Default Prompts'}
				</button>
			</div>
		{:else}
			<div class="prompt-list">
				{#each prompts as prompt}
					<button
						class="prompt-item"
						class:selected={selectedPrompt?.filename === prompt.filename}
						class:active={
							(prompt.frontmatter.type === 'start' && startPrompt?.filename === prompt.filename) ||
							(prompt.frontmatter.type === 'end' && endPrompt?.filename === prompt.filename)
						}
						onclick={() => selectPrompt(prompt)}
					>
						<span class="prompt-icon" style="color: {getTypeColor(prompt.frontmatter.type)}">
							<Icon name={getTypeIcon(prompt.frontmatter.type)} size={16} />
						</span>
						<div class="prompt-info">
							<span class="prompt-name">{prompt.frontmatter.name}</span>
							<span class="prompt-scope">{prompt.scope}</span>
						</div>
						{#if prompt.frontmatter.enabled === false}
							<span class="disabled-badge">Disabled</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="content">
		{#if isCreating}
			<div class="create-form">
				<h3>Create New Prompt</h3>

				<div class="form-group">
					<label for="prompt-name">Name</label>
					<input
						id="prompt-name"
						type="text"
						bind:value={newPromptName}
						placeholder="e.g., Session Start"
					/>
				</div>

				<div class="form-group">
					<label for="prompt-type">Type</label>
					<select id="prompt-type" bind:value={newPromptType}>
						<option value="start">Session Start</option>
						<option value="end">Session End</option>
					</select>
				</div>

				<div class="form-group">
					<label for="prompt-description">Description</label>
					<input
						id="prompt-description"
						type="text"
						bind:value={newPromptDescription}
						placeholder="Brief description of this prompt"
					/>
				</div>

				{#if error}
					<div class="error-message">
						<Icon name="alert-circle" size={14} />
						{error}
					</div>
				{/if}

				<div class="form-actions">
					<button class="secondary-btn" onclick={cancelCreate}>Cancel</button>
					<button class="primary-btn" onclick={createNewPrompt} disabled={isSaving}>
						{isSaving ? 'Creating...' : 'Create'}
					</button>
				</div>
			</div>
		{:else if selectedPrompt}
			<div class="editor-header">
				<div class="editor-title">
					<span class="prompt-icon" style="color: {getTypeColor(selectedPrompt.frontmatter.type)}">
						<Icon name={getTypeIcon(selectedPrompt.frontmatter.type)} size={20} />
					</span>
					<h3>{selectedPrompt.frontmatter.name}</h3>
					{#if selectedPrompt.frontmatter.description}
						<p class="description">{selectedPrompt.frontmatter.description}</p>
					{/if}
				</div>
				<div class="editor-actions">
					{#if isEditing}
						<button class="secondary-btn" onclick={cancelEditing} disabled={isSaving}>
							Cancel
						</button>
						<button class="primary-btn" onclick={savePrompt} disabled={isSaving}>
							{isSaving ? 'Saving...' : 'Save'}
						</button>
					{:else}
						<button class="icon-btn" onclick={startEditing} title="Edit">
							<Icon name="edit-2" size={18} />
						</button>
						{#if selectedPrompt.scope === 'project'}
							<button class="icon-btn danger" onclick={deletePrompt} title="Delete">
								<Icon name="trash-2" size={18} />
							</button>
						{/if}
					{/if}
				</div>
			</div>

			{#if error}
				<div class="error-message">
					<Icon name="alert-circle" size={14} />
					{error}
				</div>
			{/if}

			{#if isEditing}
				<textarea
					class="editor-textarea"
					bind:value={editContent}
					placeholder="Enter prompt content with YAML frontmatter..."
				></textarea>
			{:else}
				<div class="preview">
					<div class="preview-section">
						<h4>Frontmatter</h4>
						<pre class="frontmatter-preview">{JSON.stringify(selectedPrompt.frontmatter, null, 2)}</pre>
					</div>
					<div class="preview-section">
						<h4>Content</h4>
						<div class="content-preview">{selectedPrompt.content}</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="no-selection">
				<Icon name="file-text" size={48} />
				<p>Select a prompt to view or edit</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.prompt-editor {
		display: flex;
		height: 100%;
		min-height: 400px;
		background: #ffffff;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #e5e7eb;
	}

	.sidebar {
		width: 260px;
		border-right: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		background: #f9fafb;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px;
		border-bottom: 1px solid #e5e7eb;
	}

	.sidebar-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #1f2937;
	}

	.prompt-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.prompt-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font-family: inherit;
	}

	.prompt-item:hover {
		background: #ffffff;
		border-color: #e5e7eb;
	}

	.prompt-item.selected {
		background: #ffffff;
		border-color: #3b82f6;
	}

	.prompt-item.active::after {
		content: '';
		width: 6px;
		height: 6px;
		background: #22c55e;
		border-radius: 50%;
		margin-left: auto;
	}

	.prompt-icon {
		flex-shrink: 0;
	}

	.prompt-info {
		flex: 1;
		min-width: 0;
	}

	.prompt-name {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #1f2937;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.prompt-scope {
		display: block;
		font-size: 11px;
		color: #9ca3af;
		text-transform: capitalize;
	}

	.disabled-badge {
		font-size: 10px;
		padding: 2px 6px;
		background: #fee2e2;
		color: #dc2626;
		border-radius: 4px;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.editor-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
	}

	.editor-title {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.editor-title h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #1f2937;
	}

	.editor-title .description {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
	}

	.editor-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: #f3f4f6;
		border: none;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.icon-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.icon-btn.danger:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.primary-btn {
		padding: 8px 16px;
		background: #3b82f6;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: inherit;
	}

	.primary-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.primary-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.secondary-btn {
		padding: 8px 16px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.secondary-btn:hover:not(:disabled) {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.secondary-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.editor-textarea {
		flex: 1;
		margin: 16px 20px;
		padding: 16px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 13px;
		line-height: 1.6;
		resize: none;
	}

	.editor-textarea:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.preview {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
	}

	.preview-section {
		margin-bottom: 20px;
	}

	.preview-section h4 {
		margin: 0 0 8px 0;
		font-size: 12px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.frontmatter-preview {
		margin: 0;
		padding: 12px;
		background: #f3f4f6;
		border-radius: 8px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 12px;
		line-height: 1.6;
		overflow-x: auto;
	}

	.content-preview {
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.empty-state,
	.no-selection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		text-align: center;
		color: #9ca3af;
		height: 100%;
	}

	.empty-state p,
	.no-selection p {
		margin: 12px 0 16px;
		font-size: 14px;
	}

	.create-form {
		padding: 20px;
	}

	.create-form h3 {
		margin: 0 0 20px 0;
		font-size: 16px;
		font-weight: 600;
		color: #1f2937;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group label {
		display: block;
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #3b82f6;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 24px;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		margin: 12px 20px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		font-size: 13px;
		color: #dc2626;
	}
</style>
