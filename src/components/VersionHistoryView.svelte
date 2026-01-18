<script lang="ts">
	import Icon from './Icon.svelte';
	import RestoreModal from './RestoreModal.svelte';

	interface GitStatus {
		hasChanges: boolean;
		staged: { path: string; status: string }[];
		unstaged: { path: string; status: string }[];
		untracked: string[];
		summary: string;
	}

	interface GitCommit {
		hash: string;
		shortHash: string;
		message: string;
		author: string;
		authorEmail: string;
		date: string;
		timestamp: number;
		filesChanged: number;
		insertions: number;
		deletions: number;
		isClaude: boolean;
	}

	interface GitBranch {
		name: string;
		isCurrent: boolean;
		isRemote: boolean;
	}

	let { projectId }: { projectId: string } = $props();

	// State
	let status = $state<GitStatus | null>(null);
	let commits = $state<GitCommit[]>([]);
	let branches = $state<GitBranch[]>([]);
	let currentBranch = $state<string>('');
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Modal state
	let showRestoreModal = $state(false);
	let restoreTarget = $state<GitCommit | null>(null);
	let showBranchDropdown = $state(false);
	let showNewBranchInput = $state(false);
	let newBranchName = $state('');

	// Commit form state
	let commitTitle = $state('');
	let commitDescription = $state('');
	let isCommitting = $state(false);
	let isDiscarding = $state(false);
	let isGenerating = $state(false);

	// Load data on mount
	$effect(() => {
		loadData();
	});

	async function loadData() {
		loading = true;
		error = null;

		try {
			const [statusRes, logRes, branchesRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/git/status`),
				fetch(`/api/projects/${projectId}/git/log?limit=50`),
				fetch(`/api/projects/${projectId}/git/branches`)
			]);

			if (!statusRes.ok || !logRes.ok || !branchesRes.ok) {
				throw new Error('Failed to load git data');
			}

			const [statusData, logData, branchesData] = await Promise.all([
				statusRes.json(),
				logRes.json(),
				branchesRes.json()
			]);

			status = statusData;
			commits = logData.commits || [];
			branches = branchesData.branches || [];
			currentBranch = branchesData.currentBranch || '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load version history';
		} finally {
			loading = false;
		}
	}

	async function saveCheckpoint() {
		if (!commitTitle.trim()) {
			return;
		}

		// Combine title and description into full commit message
		let fullMessage = commitTitle.trim();
		if (commitDescription.trim()) {
			fullMessage += '\n\n' + commitDescription.trim();
		}

		isCommitting = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/git/commit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: fullMessage,
					shouldPush: true
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to save checkpoint');
			}

			commitTitle = '';
			commitDescription = '';
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save checkpoint';
		} finally {
			isCommitting = false;
		}
	}

	async function discardChanges() {
		if (!confirm('Are you sure you want to discard all unsaved changes? This cannot be undone.')) {
			return;
		}

		isDiscarding = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/git/discard`, {
				method: 'POST'
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to discard changes');
			}

			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to discard changes';
		} finally {
			isDiscarding = false;
		}
	}

	async function generateMessage() {
		isGenerating = true;
		try {
			const res = await fetch(`/api/projects/${projectId}/git/generate-message`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userHint: commitTitle.trim() || commitDescription.trim() || undefined
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to generate message');
			}

			const data = await res.json();
			commitTitle = data.title || data.message;
			commitDescription = data.description || '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate message';
		} finally {
			isGenerating = false;
		}
	}

	function openRestoreModal(commit: GitCommit) {
		restoreTarget = commit;
		showRestoreModal = true;
	}

	async function handleRestore(options: { saveFirst: boolean; commitMessage?: string }) {
		if (!restoreTarget) return;

		try {
			const res = await fetch(`/api/projects/${projectId}/git/restore`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					commitHash: restoreTarget.hash,
					saveFirst: options.saveFirst,
					commitMessage: options.commitMessage
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to restore');
			}

			showRestoreModal = false;
			restoreTarget = null;
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to restore';
		}
	}

	async function switchBranch(branchName: string) {
		showBranchDropdown = false;

		try {
			const res = await fetch(`/api/projects/${projectId}/git/branches`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'switch',
					branchName
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to switch workspace');
			}

			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to switch workspace';
		}
	}

	async function createNewBranch() {
		if (!newBranchName.trim()) return;

		try {
			const res = await fetch(`/api/projects/${projectId}/git/branches`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'create',
					branchName: newBranchName.trim()
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to create workspace');
			}

			newBranchName = '';
			showNewBranchInput = false;
			showBranchDropdown = false;
			await loadData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create workspace';
		}
	}

	function getCommitsToUndo(targetHash: string): GitCommit[] {
		const result: GitCommit[] = [];
		for (const commit of commits) {
			if (commit.hash === targetHash) break;
			result.push(commit);
		}
		return result;
	}

	function formatFileCount(count: number): string {
		return `${count} file${count !== 1 ? 's' : ''}`;
	}

	function getTotalChanges(): number {
		if (!status) return 0;
		return status.staged.length + status.unstaged.length + status.untracked.length;
	}
</script>

<div class="version-history">
	<!-- Workspace Selector -->
	<div class="workspace-section">
		<div class="workspace-selector">
			<button
				class="workspace-button"
				onclick={() => showBranchDropdown = !showBranchDropdown}
			>
				<Icon name="git-branch" size={16} />
				<span class="workspace-label">Workspace:</span>
				<span class="workspace-name">{currentBranch || 'main'}</span>
				<Icon name="chevron-down" size={14} />
			</button>

			{#if showBranchDropdown}
				<div class="branch-dropdown">
					{#each branches.filter(b => !b.isRemote) as branch}
						<button
							class="branch-option"
							class:current={branch.isCurrent}
							onclick={() => switchBranch(branch.name)}
							disabled={branch.isCurrent}
						>
							{#if branch.isCurrent}
								<Icon name="check" size={14} />
							{:else}
								<span class="branch-dot"></span>
							{/if}
							{branch.name}
						</button>
					{/each}

					<div class="dropdown-divider"></div>

					{#if showNewBranchInput}
						<div class="new-branch-input">
							<input
								type="text"
								placeholder="New workspace name"
								bind:value={newBranchName}
								onkeydown={(e) => e.key === 'Enter' && createNewBranch()}
							/>
							<button class="create-branch-btn" onclick={createNewBranch}>
								<Icon name="check" size={14} />
							</button>
							<button class="cancel-branch-btn" onclick={() => { showNewBranchInput = false; newBranchName = ''; }}>
								<Icon name="x" size={14} />
							</button>
						</div>
					{:else}
						<button class="branch-option new-branch" onclick={() => showNewBranchInput = true}>
							<Icon name="plus" size={14} />
							Create new workspace
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<button class="refresh-btn" onclick={loadData} title="Refresh">
			<Icon name="refresh-cw" size={16} />
		</button>
	</div>

	{#if loading}
		<div class="loading-state">
			<Icon name="loader" size={24} />
			<span>Loading version history...</span>
		</div>
	{:else if error}
		<div class="error-state">
			<Icon name="alert-circle" size={20} />
			<span>{error}</span>
			<button onclick={loadData}>Try again</button>
		</div>
	{:else}
		<!-- Unsaved Changes Section -->
		{#if status?.hasChanges}
			<div class="unsaved-section">
				<div class="unsaved-header">
					<div class="unsaved-indicator">
						<Icon name="alert-triangle" size={18} />
						<span class="unsaved-title">Unsaved Changes</span>
					</div>
					<span class="unsaved-count">{formatFileCount(getTotalChanges())} changed</span>
				</div>

				<div class="unsaved-files">
					{#each status.staged as file}
						<div class="file-item staged">
							<Icon name="check-circle" size={14} />
							<span class="file-path">{file.path}</span>
							<span class="file-status">{file.status}</span>
						</div>
					{/each}
					{#each status.unstaged as file}
						<div class="file-item modified">
							<Icon name="edit-2" size={14} />
							<span class="file-path">{file.path}</span>
							<span class="file-status">{file.status}</span>
						</div>
					{/each}
					{#each status.untracked as file}
						<div class="file-item new">
							<Icon name="plus-circle" size={14} />
							<span class="file-path">{file}</span>
							<span class="file-status">new</span>
						</div>
					{/each}
				</div>

				<div class="commit-form">
					<input
						type="text"
						class="commit-title"
						placeholder="Title (e.g., 'Add login page')"
						bind:value={commitTitle}
					/>
					<textarea
						class="commit-description"
						placeholder="Description (optional) - Add more details about your changes..."
						bind:value={commitDescription}
						rows="3"
					></textarea>
					<div class="commit-actions">
						<button
							class="generate-btn"
							onclick={generateMessage}
							disabled={isGenerating}
						>
							<Icon name="zap" size={16} />
							{isGenerating ? 'Generating...' : 'Generate'}
						</button>
						<div class="action-spacer"></div>
						<button
							class="discard-btn"
							onclick={discardChanges}
							disabled={isDiscarding}
						>
							<Icon name="trash-2" size={16} />
							{isDiscarding ? 'Discarding...' : 'Discard'}
						</button>
						<button
							class="save-btn"
							onclick={saveCheckpoint}
							disabled={isCommitting || !commitTitle.trim()}
						>
							<Icon name="save" size={16} />
							{isCommitting ? 'Saving...' : 'Save Checkpoint'}
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- History Timeline -->
		<div class="history-section">
			<h3 class="history-title">
				<Icon name="clock" size={16} />
				History
			</h3>

			{#if commits.length === 0}
				<div class="empty-state">
					<Icon name="git-commit" size={32} />
					<p>No checkpoints yet</p>
					<span>Save your first checkpoint to start tracking changes</span>
				</div>
			{:else}
				<div class="timeline">
					{#each commits as commit, index (commit.hash)}
						<div class="timeline-item">
							<div class="timeline-connector">
								<div class="timeline-dot" class:claude={commit.isClaude}></div>
								{#if index < commits.length - 1}
									<div class="timeline-line"></div>
								{/if}
							</div>

							<div class="commit-card">
								<div class="commit-header">
									<div class="commit-author">
										{#if commit.isClaude}
											<span class="author-badge claude" title="Made by Claude">🤖</span>
										{:else}
											<span class="author-badge user" title="Made by you">👤</span>
										{/if}
										<span class="author-name">{commit.isClaude ? 'Claude' : commit.author}</span>
									</div>
									<span class="commit-date">{commit.date}</span>
								</div>

								<p class="commit-message">{commit.message}</p>

								<div class="commit-footer">
									<span class="commit-stats">
										{#if commit.filesChanged > 0}
											<span class="stat">{formatFileCount(commit.filesChanged)}</span>
										{/if}
										{#if commit.insertions > 0}
											<span class="stat additions">+{commit.insertions}</span>
										{/if}
										{#if commit.deletions > 0}
											<span class="stat deletions">-{commit.deletions}</span>
										{/if}
									</span>

									<button
										class="restore-btn"
										onclick={() => openRestoreModal(commit)}
										title="Restore to this checkpoint"
									>
										<Icon name="rotate-ccw" size={14} />
										Restore
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Restore Modal -->
{#if showRestoreModal && restoreTarget}
	<RestoreModal
		commit={restoreTarget}
		commitsToUndo={getCommitsToUndo(restoreTarget.hash)}
		hasUnsavedChanges={status?.hasChanges || false}
		onrestore={handleRestore}
		oncancel={() => { showRestoreModal = false; restoreTarget = null; }}
	/>
{/if}

<!-- Click outside to close dropdown -->
{#if showBranchDropdown}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dropdown-backdrop" onclick={() => showBranchDropdown = false}></div>
{/if}

<style>
	.version-history {
		padding: 24px;
		max-width: 800px;
		margin: 0 auto;
	}

	/* Workspace Selector */
	.workspace-section {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 24px;
	}

	.workspace-selector {
		position: relative;
		flex: 1;
	}

	.workspace-button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
		transition: all 0.15s ease;
	}

	.workspace-button:hover {
		border-color: #d1d5db;
		background: #f9fafb;
	}

	.workspace-label {
		color: #6b7280;
	}

	.workspace-name {
		font-weight: 500;
		color: #111827;
	}

	.branch-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		z-index: 100;
		overflow: hidden;
	}

	.branch-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 16px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 14px;
		color: #374151;
		text-align: left;
		transition: background 0.15s ease;
	}

	.branch-option:hover:not(:disabled) {
		background: #f3f4f6;
	}

	.branch-option.current {
		background: #eff6ff;
		color: #2563eb;
		font-weight: 500;
	}

	.branch-option:disabled {
		cursor: default;
	}

	.branch-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #d1d5db;
	}

	.branch-option.new-branch {
		color: #2563eb;
	}

	.dropdown-divider {
		height: 1px;
		background: #e5e7eb;
		margin: 4px 0;
	}

	.new-branch-input {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
	}

	.new-branch-input input {
		flex: 1;
		padding: 6px 10px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 13px;
	}

	.new-branch-input input:focus {
		outline: none;
		border-color: #2563eb;
	}

	.create-branch-btn,
	.cancel-branch-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.create-branch-btn {
		background: #2563eb;
		color: white;
	}

	.create-branch-btn:hover {
		background: #1d4ed8;
	}

	.cancel-branch-btn {
		background: #f3f4f6;
		color: #6b7280;
	}

	.cancel-branch-btn:hover {
		background: #e5e7eb;
	}

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		cursor: pointer;
		color: #6b7280;
		transition: all 0.15s ease;
	}

	.refresh-btn:hover {
		background: #f9fafb;
		color: #374151;
	}

	/* Loading & Error States */
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 60px 20px;
		color: #6b7280;
	}

	.error-state {
		color: #dc2626;
	}

	.error-state button {
		padding: 8px 16px;
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}

	/* Unsaved Changes Section */
	.unsaved-section {
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.unsaved-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.unsaved-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #b45309;
	}

	.unsaved-title {
		font-weight: 600;
		font-size: 14px;
	}

	.unsaved-count {
		font-size: 13px;
		color: #92400e;
	}

	.unsaved-files {
		background: white;
		border-radius: 8px;
		padding: 8px;
		margin-bottom: 12px;
		max-height: 200px;
		overflow-y: auto;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		font-size: 13px;
		font-family: 'SF Mono', Monaco, monospace;
		border-radius: 4px;
	}

	.file-item.staged {
		color: #059669;
	}

	.file-item.modified {
		color: #d97706;
	}

	.file-item.new {
		color: #2563eb;
	}

	.file-path {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-status {
		font-size: 11px;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.commit-form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.commit-title {
		padding: 10px 14px;
		border: 1px solid #fcd34d;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		background: white;
		font-family: 'Figtree', sans-serif;
	}

	.commit-title:focus {
		outline: none;
		border-color: #f59e0b;
	}

	.commit-description {
		padding: 10px 14px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 13px;
		background: white;
		font-family: 'Figtree', sans-serif;
		resize: vertical;
		min-height: 60px;
	}

	.commit-description:focus {
		outline: none;
		border-color: #d1d5db;
	}

	.commit-description::placeholder {
		color: #9ca3af;
	}

	.commit-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.action-spacer {
		flex: 1;
	}

	.generate-btn,
	.discard-btn,
	.save-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.generate-btn {
		background: white;
		border: 1px solid #e5e7eb;
		color: #8b5cf6;
	}

	.generate-btn:hover:not(:disabled) {
		background: #f5f3ff;
		border-color: #c4b5fd;
		color: #7c3aed;
	}

	.discard-btn {
		background: white;
		border: 1px solid #e5e7eb;
		color: #6b7280;
	}

	.discard-btn:hover:not(:disabled) {
		background: #fef2f2;
		border-color: #fecaca;
		color: #dc2626;
	}

	.save-btn {
		background: #2563eb;
		border: none;
		color: white;
	}

	.save-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.generate-btn:disabled,
	.save-btn:disabled,
	.discard-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* History Section */
	.history-section {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 20px;
	}

	.history-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 20px 0;
		font-size: 16px;
		font-weight: 600;
		color: #111827;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 40px 20px;
		color: #9ca3af;
		text-align: center;
	}

	.empty-state p {
		margin: 0;
		font-weight: 500;
		color: #6b7280;
	}

	.empty-state span {
		font-size: 13px;
	}

	/* Timeline */
	.timeline {
		display: flex;
		flex-direction: column;
	}

	.timeline-item {
		display: flex;
		gap: 16px;
	}

	.timeline-connector {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 20px;
		flex-shrink: 0;
	}

	.timeline-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #d1d5db;
		border: 2px solid white;
		box-shadow: 0 0 0 2px #e5e7eb;
		flex-shrink: 0;
	}

	.timeline-dot.claude {
		background: #8b5cf6;
		box-shadow: 0 0 0 2px #ddd6fe;
	}

	.timeline-line {
		width: 2px;
		flex: 1;
		background: #e5e7eb;
		margin: 4px 0;
	}

	.commit-card {
		flex: 1;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 14px;
		margin-bottom: 12px;
		transition: all 0.15s ease;
	}

	.commit-card:hover {
		border-color: #d1d5db;
		background: white;
	}

	.commit-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.commit-author {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.author-badge {
		font-size: 14px;
	}

	.author-name {
		font-size: 13px;
		font-weight: 500;
		color: #374151;
	}

	.commit-date {
		font-size: 12px;
		color: #9ca3af;
	}

	.commit-message {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #111827;
		line-height: 1.4;
	}

	.commit-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.commit-stats {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
		color: #6b7280;
	}

	.stat.additions {
		color: #059669;
	}

	.stat.deletions {
		color: #dc2626;
	}

	.restore-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 13px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.restore-btn:hover {
		background: #eff6ff;
		border-color: #bfdbfe;
		color: #2563eb;
	}
</style>
