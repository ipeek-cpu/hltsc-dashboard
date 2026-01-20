<script lang="ts">
	import Icon from './Icon.svelte';
	import type { MemoryEntry, MemoryKind, ScopedMemoryResponse } from '$lib/memory/types';
	import { MEMORY_KINDS } from '$lib/memory/types';

	interface Props {
		beadId: string;
		projectId: string;
		projectPath: string;
		epicId?: string;
		readonly?: boolean;
		maxHeight?: number;
	}

	let {
		beadId,
		projectId,
		projectPath,
		epicId,
		readonly = false,
		maxHeight = 400
	}: Props = $props();

	// State
	let beadMemories = $state<MemoryEntry[]>([]);
	let epicMemories = $state<MemoryEntry[]>([]);
	let projectConstraints = $state<MemoryEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Collapsed state
	let beadExpanded = $state(true);
	let epicExpanded = $state(false);
	let projectExpanded = $state(false);

	// Add form state
	let showAddForm = $state(false);
	let addKind = $state<MemoryKind>('decision');
	let addContent = $state('');
	let addTitle = $state('');
	let saving = $state(false);

	// Kind colors for visual distinction
	const kindColors: Record<MemoryKind, string> = {
		decision: '#22c55e',
		checkpoint: '#8b5cf6',
		constraint: '#f59e0b',
		next_step: '#3b82f6',
		action_report: '#6b7280',
		ci_note: '#ef4444'
	};

	// Kind icons using feather-icons names
	const kindIcons: Record<MemoryKind, string> = {
		decision: 'check-circle',
		checkpoint: 'flag',
		constraint: 'alert-triangle',
		next_step: 'arrow-right',
		action_report: 'terminal',
		ci_note: 'git-branch'
	};

	// Kind display labels
	const kindLabels: Record<MemoryKind, string> = {
		decision: 'Decision',
		checkpoint: 'Checkpoint',
		constraint: 'Constraint',
		next_step: 'Next Step',
		action_report: 'Action Report',
		ci_note: 'CI Note'
	};

	// Load memories from API
	async function loadMemories() {
		loading = true;
		error = null;
		try {
			const url = `/api/projects/${projectId}/memory/scoped?projectPath=${encodeURIComponent(projectPath)}&beadId=${encodeURIComponent(beadId)}${epicId ? `&epicId=${encodeURIComponent(epicId)}` : ''}`;
			const res = await fetch(url);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to load memories');
			}
			const data: ScopedMemoryResponse = await res.json();
			beadMemories = data.beadMemories || [];
			epicMemories = data.epicMemories || [];
			projectConstraints = data.projectConstraints || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Add memory entry
	async function addMemory() {
		if (!addTitle.trim() || !addContent.trim()) return;
		saving = true;
		error = null;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/memory?projectPath=${encodeURIComponent(projectPath)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						beadId,
						epicId,
						kind: addKind,
						title: addTitle.trim(),
						content: addContent.trim()
					})
				}
			);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to add memory');
			}
			showAddForm = false;
			addTitle = '';
			addContent = '';
			addKind = 'decision';
			await loadMemories();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add';
		} finally {
			saving = false;
		}
	}

	// Delete memory entry (soft delete)
	async function deleteMemory(entryId: string) {
		if (!confirm('Delete this memory entry?')) return;
		error = null;
		try {
			const res = await fetch(
				`/api/projects/${projectId}/memory/${entryId}?projectPath=${encodeURIComponent(projectPath)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.message || 'Delete failed');
			}
			await loadMemories();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
		}
	}

	// Format relative time for display
	function relativeTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks}w ago`;
		return new Date(dateStr).toLocaleDateString();
	}

	// Cancel add form
	function cancelAdd() {
		showAddForm = false;
		addTitle = '';
		addContent = '';
		addKind = 'decision';
	}

	// Reload when dependencies change
	$effect(() => {
		if (beadId && projectId && projectPath) {
			loadMemories();
		}
	});

	// Total count for header
	let totalCount = $derived(beadMemories.length + epicMemories.length + projectConstraints.length);
</script>

<section class="memory-panel" style="max-height: {maxHeight}px">
	<header class="panel-header">
		<div class="header-title">
			<Icon name="database" size={16} />
			<h4>Memory</h4>
			{#if totalCount > 0}
				<span class="total-count">{totalCount}</span>
			{/if}
		</div>
		{#if !readonly}
			<button class="btn-add" onclick={() => (showAddForm = !showAddForm)}>
				<Icon name={showAddForm ? 'x' : 'plus'} size={14} />
				{showAddForm ? 'Cancel' : 'Add'}
			</button>
		{/if}
	</header>

	{#if loading}
		<div class="loading">
			<Icon name="loader" size={18} />
			<span>Loading memories...</span>
		</div>
	{:else if error}
		<div class="error">
			<Icon name="alert-circle" size={16} />
			<span>{error}</span>
			<button class="btn-retry" onclick={loadMemories}>Retry</button>
		</div>
	{:else}
		{#if showAddForm}
			<form class="add-form" onsubmit={(e) => { e.preventDefault(); addMemory(); }}>
				<div class="form-row">
					<label for="memory-kind">Type</label>
					<select id="memory-kind" bind:value={addKind}>
						{#each MEMORY_KINDS as kind}
							<option value={kind}>{kindLabels[kind]}</option>
						{/each}
					</select>
				</div>
				<div class="form-row">
					<label for="memory-title">Title</label>
					<input
						id="memory-title"
						type="text"
						bind:value={addTitle}
						placeholder="Brief title..."
						maxlength="200"
					/>
				</div>
				<div class="form-row">
					<label for="memory-content">Content</label>
					<textarea
						id="memory-content"
						bind:value={addContent}
						placeholder="Details (markdown supported)..."
						rows="3"
					></textarea>
				</div>
				<div class="form-actions">
					<button type="button" class="btn-cancel" onclick={cancelAdd} disabled={saving}>
						Cancel
					</button>
					<button
						type="submit"
						class="btn-submit"
						disabled={saving || !addTitle.trim() || !addContent.trim()}
					>
						{#if saving}
							<Icon name="loader" size={14} />
							Saving...
						{:else}
							<Icon name="check" size={14} />
							Save
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="scopes-container">
			<!-- Bead Scope -->
			<div class="scope-section">
				<button
					class="scope-header"
					onclick={() => (beadExpanded = !beadExpanded)}
					aria-expanded={beadExpanded}
				>
					<Icon name={beadExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
					<span class="scope-label">Bead Scope</span>
					<span class="scope-count">{beadMemories.length}</span>
				</button>
				{#if beadExpanded}
					<div class="entries">
						{#if beadMemories.length === 0}
							<div class="empty-scope">No bead-level memories</div>
						{:else}
							{#each beadMemories as entry (entry.id)}
								{@render memoryEntry(entry)}
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Epic Scope -->
			{#if epicMemories.length > 0 || epicId}
				<div class="scope-section">
					<button
						class="scope-header"
						onclick={() => (epicExpanded = !epicExpanded)}
						aria-expanded={epicExpanded}
					>
						<Icon name={epicExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
						<span class="scope-label">Epic Scope</span>
						<span class="scope-count">{epicMemories.length}</span>
					</button>
					{#if epicExpanded}
						<div class="entries">
							{#if epicMemories.length === 0}
								<div class="empty-scope">No epic-level memories</div>
							{:else}
								{#each epicMemories as entry (entry.id)}
									{@render memoryEntry(entry)}
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Project Constraints -->
			{#if projectConstraints.length > 0}
				<div class="scope-section">
					<button
						class="scope-header"
						onclick={() => (projectExpanded = !projectExpanded)}
						aria-expanded={projectExpanded}
					>
						<Icon name={projectExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
						<span class="scope-label">Project Constraints</span>
						<span class="scope-count">{projectConstraints.length}</span>
					</button>
					{#if projectExpanded}
						<div class="entries">
							{#each projectConstraints as entry (entry.id)}
								{@render memoryEntry(entry)}
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if totalCount === 0 && !showAddForm}
			<div class="empty">
				<Icon name="inbox" size={24} />
				<span>No memories yet</span>
				{#if !readonly}
					<button class="btn-add-first" onclick={() => (showAddForm = true)}>
						<Icon name="plus" size={14} />
						Add first memory
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</section>

{#snippet memoryEntry(entry: MemoryEntry)}
	<article class="memory-entry" style="--kind-color: {kindColors[entry.kind]}">
		<div class="entry-header">
			<Icon name={kindIcons[entry.kind]} size={14} />
			<span class="entry-kind">{kindLabels[entry.kind]}</span>
			<span class="entry-time">{relativeTime(entry.createdAt)}</span>
			{#if !readonly}
				<button
					class="btn-delete"
					onclick={() => deleteMemory(entry.id)}
					title="Delete memory"
				>
					<Icon name="trash-2" size={12} />
				</button>
			{/if}
		</div>
		<h5 class="entry-title">{entry.title}</h5>
		<p class="entry-content">{entry.content}</p>
		{#if entry.agentName}
			<div class="entry-footer">
				<Icon name="user" size={10} />
				<span>{entry.agentName}</span>
			</div>
		{/if}
	</article>
{/snippet}

<style>
	.memory-panel {
		border: 1px solid #eaeaea;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: #ffffff;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: #f8f8f8;
		border-bottom: 1px solid #eaeaea;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.panel-header h4 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.total-count {
		font-size: 12px;
		font-weight: 500;
		color: #666666;
		background: #e5e5e5;
		padding: 2px 8px;
		border-radius: 10px;
	}

	.btn-add {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 500;
		background: none;
		border: none;
		color: #2563eb;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 6px;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-add:hover {
		background: #eff6ff;
	}

	.scopes-container {
		flex: 1;
		overflow-y: auto;
	}

	.scope-section {
		border-bottom: 1px solid #f0f0f0;
	}

	.scope-section:last-child {
		border-bottom: none;
	}

	.scope-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: none;
		border: none;
		color: #666666;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.scope-header:hover {
		background: #f8f8f8;
	}

	.scope-label {
		flex: 1;
	}

	.scope-count {
		font-size: 12px;
		color: #888888;
		background: #f0f0f0;
		padding: 2px 6px;
		border-radius: 8px;
	}

	.entries {
		padding: 8px 12px 12px;
	}

	.empty-scope {
		font-size: 12px;
		color: #aaaaaa;
		font-style: italic;
		padding: 8px 4px;
	}

	.memory-entry {
		padding: 12px;
		margin-bottom: 8px;
		background: #fafafa;
		border-radius: 8px;
		border-left: 3px solid var(--kind-color, #888888);
		position: relative;
	}

	.memory-entry:last-child {
		margin-bottom: 0;
	}

	.entry-header {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #888888;
		margin-bottom: 6px;
	}

	.entry-header :global(.icon) {
		color: var(--kind-color);
	}

	.entry-kind {
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--kind-color);
	}

	.entry-time {
		margin-left: auto;
	}

	.entry-title {
		margin: 0 0 4px 0;
		font-size: 13px;
		font-weight: 600;
		color: #1a1a1a;
		line-height: 1.4;
	}

	.entry-content {
		margin: 0;
		font-size: 12px;
		color: #666666;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.entry-footer {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 8px;
		font-size: 10px;
		color: #aaaaaa;
	}

	.btn-delete {
		background: none;
		border: none;
		color: #cccccc;
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
		opacity: 0;
		transition: all 0.15s ease;
	}

	.memory-entry:hover .btn-delete {
		opacity: 1;
	}

	.btn-delete:hover {
		color: #dc2626;
		background: #fef2f2;
	}

	.add-form {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: #f8f8f8;
		border-bottom: 1px solid #eaeaea;
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.form-row label {
		font-size: 12px;
		font-weight: 500;
		color: #666666;
	}

	.add-form select,
	.add-form input,
	.add-form textarea {
		padding: 8px 10px;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		background: #ffffff;
		color: #1a1a1a;
		font-size: 13px;
		font-family: 'Figtree', sans-serif;
		transition: border-color 0.15s ease;
	}

	.add-form select:focus,
	.add-form input:focus,
	.add-form textarea:focus {
		outline: none;
		border-color: #2563eb;
	}

	.add-form textarea {
		resize: vertical;
		min-height: 60px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	.btn-cancel,
	.btn-submit {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-cancel {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #666666;
	}

	.btn-cancel:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.btn-submit {
		background: #2563eb;
		border: 1px solid #2563eb;
		color: #ffffff;
	}

	.btn-submit:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-cancel:disabled,
	.btn-submit:disabled {
		opacity: 0.5;
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

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px;
		color: #888888;
		font-size: 13px;
	}

	.loading :global(.icon) {
		animation: spin 1s linear infinite;
	}

	.error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px;
		background: #fef2f2;
		color: #dc2626;
		font-size: 13px;
	}

	.btn-retry {
		margin-left: auto;
		background: none;
		border: 1px solid #dc2626;
		color: #dc2626;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-retry:hover {
		background: #dc2626;
		color: #ffffff;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 32px;
		color: #aaaaaa;
		font-size: 13px;
	}

	.empty :global(.icon) {
		color: #d0d0d0;
	}

	.btn-add-first {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 14px;
		background: #f0f0f0;
		border: none;
		border-radius: 6px;
		color: #666666;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-add-first:hover {
		background: #e5e5e5;
		color: #1a1a1a;
	}
</style>
