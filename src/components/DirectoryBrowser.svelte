<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';

	interface DirectoryEntry {
		name: string;
		path: string;
		isBeadsProject: boolean;
	}

	interface BrowseResponse {
		currentPath: string;
		parentPath: string | null;
		directories: DirectoryEntry[];
		isBeadsProject: boolean;
	}

	interface ExistingProject {
		id: string;
		path: string;
	}

	let {
		onSelect,
		onCancel
	}: {
		onSelect: (path: string) => void;
		onCancel: () => void;
	} = $props();

	let currentPath = $state('');
	let parentPath = $state<string | null>(null);
	let directories = $state<DirectoryEntry[]>([]);
	let isBeadsProject = $state(false);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let existingProjectPaths = $state<Set<string>>(new Set());

	// Check if a path is already added to the dashboard
	function isAlreadyAdded(path: string): boolean {
		return existingProjectPaths.has(path);
	}

	// Fetch existing projects to know which ones are already added
	async function fetchExistingProjects() {
		try {
			const response = await fetch('/api/projects');
			if (response.ok) {
				const projects: ExistingProject[] = await response.json();
				existingProjectPaths = new Set(projects.map(p => p.path));
			}
		} catch {
			// Ignore errors - we'll just not show "Already added" badges
		}
	}

	async function browse(path?: string) {
		loading = true;
		error = null;

		try {
			const url = path ? `/api/filesystem/browse?path=${encodeURIComponent(path)}` : '/api/filesystem/browse';
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error('Failed to browse directory');
			}

			const data: BrowseResponse = await response.json();
			currentPath = data.currentPath;
			parentPath = data.parentPath;
			directories = data.directories;
			isBeadsProject = data.isBeadsProject;
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			loading = false;
		}
	}

	// Select a specific folder directly
	function selectFolder(path: string, event: MouseEvent) {
		event.stopPropagation();
		onSelect(path);
	}

	function navigateTo(path: string) {
		browse(path);
	}

	function goUp() {
		if (parentPath) {
			browse(parentPath);
		}
	}

	function selectCurrent() {
		onSelect(currentPath);
	}

	function getPathParts(pathStr: string): { name: string; path: string }[] {
		const parts = pathStr.split('/').filter(Boolean);
		const result: { name: string; path: string }[] = [];

		let accumulated = '';
		for (const part of parts) {
			accumulated += '/' + part;
			result.push({ name: part, path: accumulated });
		}

		return result;
	}

	$effect(() => {
		if (browser) {
			fetchExistingProjects();
			browse();
		}
	});

	let pathParts = $derived(getPathParts(currentPath));
</script>

<div class="browser">
	<div class="browser-header">
		<h3>Select Project Folder</h3>
		<button class="close-btn" onclick={onCancel}>
			<Icon name="x" size={20} />
		</button>
	</div>

	<div class="breadcrumbs">
		<button class="breadcrumb root" onclick={() => navigateTo('/')}>
			/
		</button>
		{#each pathParts as part, i}
			<span class="separator">/</span>
			<button
				class="breadcrumb"
				class:current={i === pathParts.length - 1}
				onclick={() => navigateTo(part.path)}
			>
				{part.name}
			</button>
		{/each}
	</div>

	{#if isBeadsProject}
		<div class="project-found">
			<span class="found-icon">
				<Icon name="check" size={16} strokeWidth={3} />
			</span>
			<span>Beads project found!</span>
			<button class="select-btn" onclick={selectCurrent}>Select This Project</button>
		</div>
	{/if}

	<div class="directory-list">
		{#if loading}
			<div class="loading">Loading...</div>
		{:else if error}
			<div class="error">{error}</div>
		{:else}
			{#if parentPath}
				<button class="directory-item parent" onclick={goUp}>
					<span class="folder-icon">
						<Icon name="folder" size={18} />
					</span>
					<span class="folder-name">..</span>
					<span class="folder-hint">Parent directory</span>
				</button>
			{/if}

			{#if directories.length === 0}
				<div class="empty">No subdirectories</div>
			{:else}
				{#each directories as dir}
					{@const alreadyAdded = isAlreadyAdded(dir.path)}
					<div
						class="directory-item"
						class:is-beads={dir.isBeadsProject && !alreadyAdded}
						class:is-added={alreadyAdded}
						class:disabled={alreadyAdded}
						onclick={() => !alreadyAdded && navigateTo(dir.path)}
						role="button"
						tabindex={alreadyAdded ? -1 : 0}
						onkeydown={(e) => e.key === 'Enter' && !alreadyAdded && navigateTo(dir.path)}
					>
						<span class="folder-icon">
							<Icon name={dir.isBeadsProject ? 'grid' : 'folder'} size={18} />
						</span>
						<span class="folder-name">{dir.name}</span>
						<div class="folder-actions">
							{#if alreadyAdded}
								<span class="added-badge">Already added</span>
							{:else if dir.isBeadsProject}
								<span class="beads-badge">Beads Project</span>
							{/if}
							{#if !alreadyAdded}
								<button
									class="select-folder-btn"
									onclick={(e) => selectFolder(dir.path, e)}
								>
									Select Folder
								</button>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		{/if}
	</div>

	<div class="browser-footer">
		<div class="current-path" title={currentPath}>
			{currentPath}
		</div>
		<div class="footer-actions">
			<button class="cancel-btn" onclick={onCancel}>Cancel</button>
			<button class="confirm-btn" onclick={selectCurrent}>
				{isBeadsProject ? 'Select' : 'Select Folder'}
			</button>
		</div>
	</div>
</div>

<style>
	.browser {
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 16px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		width: 600px;
		max-width: 90vw;
		max-height: 70vh;
		min-height: 400px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
	}

	.browser-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 18px 20px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.browser-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 400;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #cccccc;
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		color: #1a1a1a;
		background: #f5f5f5;
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		padding: 12px 20px;
		background: #f8f8f8;
		border-bottom: 1px solid #eaeaea;
		overflow-x: auto;
		flex-wrap: nowrap;
		gap: 2px;
	}

	.breadcrumb {
		background: transparent;
		border: none;
		color: #3b82f6;
		font-size: 13px;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 6px;
		white-space: nowrap;
		font-family: 'Figtree', sans-serif;
	}

	.breadcrumb:hover {
		background: #e8e8e8;
	}

	.breadcrumb.current {
		color: #1a1a1a;
		font-weight: 500;
	}

	.breadcrumb.root {
		color: #888888;
	}

	.separator {
		color: #cccccc;
		font-size: 13px;
	}

	.project-found {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 20px;
		background: #f0fdf4;
		border-bottom: 1px solid #86efac;
	}

	.found-icon {
		display: flex;
		align-items: center;
		color: #22c55e;
	}

	.project-found span {
		color: #166534;
		font-size: 14px;
	}

	.select-btn {
		margin-left: auto;
		background: #22c55e;
		color: #ffffff;
		border: none;
		padding: 8px 18px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.select-btn:hover {
		background: #16a34a;
		transform: translateY(-1px);
	}

	.directory-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		background: #fafafa;
	}

	.loading,
	.error,
	.empty {
		padding: 24px;
		text-align: center;
		color: #888888;
		font-size: 14px;
	}

	.error {
		color: #dc3545;
	}

	.directory-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		background: transparent;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		text-align: left;
		color: #1a1a1a;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.directory-item:hover {
		background: #ffffff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
	}

	.directory-item.is-beads {
		background: #eff6ff;
	}

	.directory-item.is-beads:hover {
		background: #dbeafe;
	}

	.directory-item.is-added {
		background: #f5f3ff;
	}

	.directory-item.is-added .folder-icon {
		color: #8b5cf6;
	}

	.directory-item.disabled {
		opacity: 0.6;
		cursor: not-allowed;
		pointer-events: auto;
	}

	.directory-item.disabled:hover {
		background: #f5f3ff;
		box-shadow: none;
	}

	.directory-item.parent {
		color: #888888;
	}

	.folder-icon {
		display: flex;
		align-items: center;
		color: #888888;
		flex-shrink: 0;
	}

	.directory-item.is-beads .folder-icon {
		color: #3b82f6;
	}

	.folder-name {
		flex: 1;
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.folder-hint {
		font-size: 12px;
		color: #888888;
	}

	.folder-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	.beads-badge {
		font-size: 11px;
		background: #3b82f6;
		color: #ffffff;
		padding: 3px 10px;
		border-radius: 12px;
		font-weight: 500;
	}

	.added-badge {
		font-size: 11px;
		background: #8b5cf6;
		color: #ffffff;
		padding: 3px 10px;
		border-radius: 12px;
		font-weight: 500;
	}

	.select-folder-btn {
		font-size: 11px;
		background: #f5f5f5;
		color: #666666;
		border: none;
		padding: 4px 12px;
		border-radius: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
		opacity: 0;
	}

	.directory-item:hover .select-folder-btn {
		opacity: 1;
	}

	.select-folder-btn:hover {
		background: #1a1a1a;
		color: #ffffff;
	}

	.browser-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 20px;
		background: #ffffff;
		border-top: 1px solid #eaeaea;
		gap: 16px;
	}

	.current-path {
		flex: 1;
		font-family: monospace;
		font-size: 12px;
		color: #888888;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.footer-actions {
		display: flex;
		gap: 10px;
		flex-shrink: 0;
	}

	.cancel-btn {
		background: #f5f5f5;
		color: #666666;
		border: none;
		padding: 10px 18px;
		border-radius: 20px;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.cancel-btn:hover {
		background: #e8e8e8;
	}

	.confirm-btn {
		background: #1a1a1a;
		color: #ffffff;
		border: none;
		padding: 10px 18px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.confirm-btn:hover {
		background: #333333;
		transform: translateY(-1px);
	}
</style>
