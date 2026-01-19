<script lang="ts">
	import type { KnownIssue, KnownIssueType } from '$lib/session-context-types';
	import Icon from './Icon.svelte';

	let {
		issues = [],
		projectId,
		onupdate
	}: {
		issues: KnownIssue[];
		projectId: string;
		onupdate: () => void;
	} = $props();

	let isCreating = $state(false);
	let isSaving = $state(false);
	let error = $state<string | null>(null);

	// New issue form
	let newIssueType = $state<KnownIssueType>('note');
	let newIssueTitle = $state('');
	let newIssueDescription = $state('');

	// Filter state
	let showResolved = $state(false);

	let filteredIssues = $derived(
		showResolved ? issues : issues.filter((i) => i.status === 'active')
	);

	let activeCount = $derived(issues.filter((i) => i.status === 'active').length);

	function showCreateForm() {
		isCreating = true;
		newIssueType = 'note';
		newIssueTitle = '';
		newIssueDescription = '';
		error = null;
	}

	function cancelCreate() {
		isCreating = false;
	}

	async function createIssue() {
		if (!newIssueTitle.trim()) {
			error = 'Title is required';
			return;
		}

		isSaving = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/known-issues`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: newIssueType,
					title: newIssueTitle,
					description: newIssueDescription
				})
			});

			if (!response.ok) {
				throw new Error('Failed to create issue');
			}

			isCreating = false;
			onupdate();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create';
		} finally {
			isSaving = false;
		}
	}

	async function resolveIssue(issueId: string) {
		try {
			const response = await fetch(`/api/projects/${projectId}/known-issues`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: issueId, resolve: true })
			});

			if (!response.ok) {
				throw new Error('Failed to resolve issue');
			}

			onupdate();
		} catch (err) {
			console.error('Error resolving issue:', err);
		}
	}

	async function deleteIssue(issueId: string) {
		if (!confirm('Delete this known issue?')) return;

		try {
			const response = await fetch(`/api/projects/${projectId}/known-issues`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: issueId })
			});

			if (!response.ok) {
				throw new Error('Failed to delete issue');
			}

			onupdate();
		} catch (err) {
			console.error('Error deleting issue:', err);
		}
	}

	function getTypeIcon(type: KnownIssueType): string {
		switch (type) {
			case 'ci_failure':
				return 'x-circle';
			case 'blocker':
				return 'alert-octagon';
			case 'bug':
				return 'bug';
			case 'note':
			default:
				return 'file-text';
		}
	}

	function getTypeColor(type: KnownIssueType): string {
		switch (type) {
			case 'ci_failure':
				return '#dc2626';
			case 'blocker':
				return '#f97316';
			case 'bug':
				return '#8b5cf6';
			case 'note':
			default:
				return '#6b7280';
		}
	}

	function getTypeLabel(type: KnownIssueType): string {
		switch (type) {
			case 'ci_failure':
				return 'CI Failure';
			case 'blocker':
				return 'Blocker';
			case 'bug':
				return 'Bug';
			case 'note':
			default:
				return 'Note';
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="known-issues-panel">
	<div class="panel-header">
		<div class="header-left">
			<h3>Known Issues</h3>
			{#if activeCount > 0}
				<span class="active-badge">{activeCount} active</span>
			{/if}
		</div>
		<div class="header-right">
			<label class="filter-toggle">
				<input type="checkbox" bind:checked={showResolved} />
				<span>Show resolved</span>
			</label>
			<button class="add-btn" onclick={showCreateForm} title="Add known issue">
				<Icon name="plus" size={16} />
			</button>
		</div>
	</div>

	{#if isCreating}
		<div class="create-form">
			<div class="form-row">
				<select bind:value={newIssueType}>
					<option value="note">Note</option>
					<option value="ci_failure">CI Failure</option>
					<option value="blocker">Blocker</option>
					<option value="bug">Bug</option>
				</select>
				<input
					type="text"
					bind:value={newIssueTitle}
					placeholder="Issue title..."
					class="title-input"
				/>
			</div>
			<textarea
				bind:value={newIssueDescription}
				placeholder="Description (optional)..."
				rows="2"
			></textarea>
			{#if error}
				<div class="error-message">
					<Icon name="alert-circle" size={14} />
					{error}
				</div>
			{/if}
			<div class="form-actions">
				<button class="secondary-btn" onclick={cancelCreate}>Cancel</button>
				<button class="primary-btn" onclick={createIssue} disabled={isSaving}>
					{isSaving ? 'Adding...' : 'Add Issue'}
				</button>
			</div>
		</div>
	{/if}

	<div class="issues-list">
		{#if filteredIssues.length === 0}
			<div class="empty-state">
				{#if showResolved}
					<p>No known issues</p>
				{:else}
					<p>No active issues</p>
				{/if}
			</div>
		{:else}
			{#each filteredIssues as issue}
				<div class="issue-item" class:resolved={issue.status === 'resolved'}>
					<span class="issue-icon" style="color: {getTypeColor(issue.type)}">
						<Icon name={getTypeIcon(issue.type)} size={16} />
					</span>
					<div class="issue-content">
						<div class="issue-header">
							<span class="issue-type" style="color: {getTypeColor(issue.type)}">
								{getTypeLabel(issue.type)}
							</span>
							<span class="issue-title">{issue.title}</span>
						</div>
						{#if issue.description}
							<p class="issue-description">{issue.description}</p>
						{/if}
						<div class="issue-meta">
							<span class="issue-date">{formatDate(issue.createdAt)}</span>
							{#if issue.resolvedAt}
								<span class="resolved-label">Resolved {formatDate(issue.resolvedAt)}</span>
							{/if}
						</div>
					</div>
					<div class="issue-actions">
						{#if issue.status === 'active'}
							<button
								class="action-btn resolve"
								onclick={() => resolveIssue(issue.id)}
								title="Mark as resolved"
							>
								<Icon name="check" size={14} />
							</button>
						{/if}
						<button
							class="action-btn delete"
							onclick={() => deleteIssue(issue.id)}
							title="Delete"
						>
							<Icon name="trash-2" size={14} />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.known-issues-panel {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: #1f2937;
	}

	.active-badge {
		font-size: 11px;
		padding: 2px 8px;
		background: #fee2e2;
		color: #dc2626;
		border-radius: 10px;
		font-weight: 500;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.filter-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: #6b7280;
		cursor: pointer;
	}

	.filter-toggle input {
		margin: 0;
	}

	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: #3b82f6;
		border: none;
		border-radius: 6px;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.add-btn:hover {
		background: #2563eb;
	}

	.create-form {
		padding: 12px 16px;
		border-bottom: 1px solid #e5e7eb;
		background: #fafafa;
	}

	.form-row {
		display: flex;
		gap: 8px;
		margin-bottom: 8px;
	}

	.form-row select {
		width: 140px;
		padding: 8px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
	}

	.title-input {
		flex: 1;
		padding: 8px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
	}

	.create-form textarea {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-family: inherit;
		resize: vertical;
		margin-bottom: 8px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.primary-btn {
		padding: 6px 14px;
		background: #3b82f6;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
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
		padding: 6px 14px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		font-family: inherit;
	}

	.secondary-btn:hover {
		background: #f9fafb;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		margin-bottom: 8px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		font-size: 12px;
		color: #dc2626;
	}

	.issues-list {
		max-height: 400px;
		overflow-y: auto;
	}

	.empty-state {
		padding: 32px 16px;
		text-align: center;
		color: #9ca3af;
		font-size: 13px;
	}

	.issue-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1px solid #f3f4f6;
		transition: background 0.15s ease;
	}

	.issue-item:hover {
		background: #f9fafb;
	}

	.issue-item:last-child {
		border-bottom: none;
	}

	.issue-item.resolved {
		opacity: 0.6;
	}

	.issue-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.issue-content {
		flex: 1;
		min-width: 0;
	}

	.issue-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.issue-type {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.issue-title {
		font-size: 13px;
		font-weight: 500;
		color: #1f2937;
	}

	.issue-description {
		margin: 0 0 6px;
		font-size: 12px;
		color: #6b7280;
		line-height: 1.4;
	}

	.issue-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		color: #9ca3af;
	}

	.resolved-label {
		color: #10b981;
	}

	.issue-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.issue-item:hover .issue-actions {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: #f3f4f6;
		border: none;
		border-radius: 4px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn.resolve:hover {
		background: #dcfce7;
		color: #16a34a;
	}

	.action-btn.delete:hover {
		background: #fee2e2;
		color: #dc2626;
	}
</style>
