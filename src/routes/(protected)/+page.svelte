<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type { ProjectWithStats } from '$lib/dashboard-db';
	import ProjectCard from '../../components/ProjectCard.svelte';
	import DirectoryBrowser from '../../components/DirectoryBrowser.svelte';
	import Icon from '../../components/Icon.svelte';

	async function handleLogout() {
		const { logOut } = await import('$lib/firebase');
		await logOut();
		goto('/login');
	}

	let projects: ProjectWithStats[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let updatingProject = $state<string | null>(null);

	// Relocate modal state
	let relocateProject = $state<ProjectWithStats | null>(null);
	let relocateError = $state<string | null>(null);
	let isRelocating = $state(false);

	// Update check moved to +layout.svelte

	async function loadProjects() {
		try {
			loading = true;
			error = null;
			const response = await fetch('/api/projects');
			if (!response.ok) {
				throw new Error('Failed to load projects');
			}
			projects = await response.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			loading = false;
		}
	}

	async function handleDelete(id: string) {
		try {
			const response = await fetch(`/api/projects/${id}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				throw new Error('Failed to remove project');
			}
			projects = projects.filter((p) => p.id !== id);
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Failed to remove project');
		}
	}

	async function handleUpdateBeads(project: ProjectWithStats) {
		if (updatingProject) return; // Already updating

		try {
			updatingProject = project.id;
			const response = await fetch(`/api/projects/${project.id}/update-beads`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to update beads');
			}

			// Refresh projects to get updated version info
			await loadProjects();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Failed to update beads');
		} finally {
			updatingProject = null;
		}
	}

	function handleRelocate(project: ProjectWithStats) {
		relocateProject = project;
		relocateError = null;
	}

	function handleRelocateCancel() {
		relocateProject = null;
		relocateError = null;
	}

	async function handleRelocateSelect(newPath: string) {
		if (!relocateProject || isRelocating) return;

		isRelocating = true;
		relocateError = null;

		try {
			const response = await fetch(`/api/projects/${relocateProject.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: newPath })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to update project path');
			}

			// Refresh projects and close modal
			await loadProjects();
			relocateProject = null;
		} catch (e) {
			relocateError = e instanceof Error ? e.message : 'Failed to update project path';
		} finally {
			isRelocating = false;
		}
	}

	$effect(() => {
		if (browser) {
			loadProjects();
		}
	});
</script>

<svelte:head>
	<title>Beads Dashboard - Projects</title>
</svelte:head>

<div class="page">
	<header>
		<div class="header-left">
			<img src="/logo.svg" alt="Beads" class="logo" width="56" height="56" />
			<h1>Beads Dashboard</h1>
		</div>
		<div class="header-actions">
			<a href="/settings" class="settings-btn" title="Settings">
				<Icon name="settings" size={18} />
			</a>
			<button
				class="logout-btn"
				title="Sign out"
				onclick={handleLogout}
			>
				<Icon name="log-out" size={18} />
			</button>
			<a href="/projects/add" class="add-btn">
				<Icon name="plus" size={16} strokeWidth={2.5} />
				Add Project
			</a>
		</div>
	</header>

	<main>
		{#if loading}
			<div class="loading">Loading projects...</div>
		{:else if error}
			<div class="error">
				<p>{error}</p>
				<button onclick={loadProjects}>Retry</button>
			</div>
		{:else if projects.length === 0}
			<div class="empty-state">
				<div class="empty-icon">
					<Icon name="folder" size={64} strokeWidth={1.5} />
				</div>
				<h2>No Projects Yet</h2>
				<p>Add a project folder that contains a Beads issue tracker to get started.</p>
				<a href="/projects/add" class="add-btn-large">
					<Icon name="plus" size={18} strokeWidth={2.5} />
					Add Your First Project
				</a>
			</div>
		{:else}
			<div class="projects-grid">
				{#each projects as project (project.id)}
					<ProjectCard
						{project}
						onDelete={handleDelete}
						onUpdateBeads={handleUpdateBeads}
						onRelocate={handleRelocate}
					/>
				{/each}
			</div>
		{/if}
	</main>
</div>

{#if relocateProject}
	<div class="modal-overlay">
		<div class="modal">
			<div class="modal-header">
				<h2>Locate Project Folder</h2>
				<button class="close-btn" onclick={handleRelocateCancel}>
					<Icon name="x" size={20} />
				</button>
			</div>
			<div class="modal-body">
				<p class="modal-description">
					The folder for <strong>{relocateProject.name}</strong> is missing.
					Please select the new location of this project.
				</p>
				<p class="old-path">
					<Icon name="folder-minus" size={14} />
					<span>Previous location:</span>
					<code>{relocateProject.path}</code>
				</p>
				{#if relocateError}
					<div class="modal-error">
						<Icon name="alert-circle" size={16} />
						<span>{relocateError}</span>
					</div>
				{/if}
				<div class="browser-container">
					<DirectoryBrowser
						onSelect={handleRelocateSelect}
						onCancel={handleRelocateCancel}
					/>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #fafafa;
		color: #1a1a1a;
		font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(h1, h2, h3, h4, h5, h6) {
		font-family: 'Hedvig Letters Serif', Georgia, serif;
		font-weight: 400;
	}

	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		background: #ffffff;
		border-bottom: 1px solid #eaeaea;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 400;
		color: #1a1a1a;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.settings-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: transparent;
		color: #666666;
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.settings-btn:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.logout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: transparent;
		border: none;
		color: #666666;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.logout-btn:hover {
		background: #fef2f2;
		color: #dc2626;
	}

	.add-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #1a1a1a;
		color: #ffffff;
		padding: 10px 20px;
		border-radius: 24px;
		text-decoration: none;
		font-weight: 500;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.add-btn:hover {
		background: #333333;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	main {
		flex: 1;
		padding: 32px;
		background: #fafafa;
	}

	.loading {
		text-align: center;
		padding: 60px;
		color: #888888;
		font-size: 16px;
	}

	.error {
		text-align: center;
		padding: 60px;
		color: #dc3545;
	}

	.error button {
		margin-top: 16px;
		background: #ffffff;
		color: #1a1a1a;
		border: 1px solid #eaeaea;
		padding: 10px 20px;
		border-radius: 24px;
		cursor: pointer;
		font-family: 'Figtree', sans-serif;
		transition: all 0.2s ease;
	}

	.error button:hover {
		background: #f5f5f5;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 20px;
		text-align: center;
	}

	.empty-icon {
		margin-bottom: 20px;
		color: #cccccc;
	}

	.empty-state h2 {
		margin: 0 0 12px 0;
		font-size: 28px;
		color: #1a1a1a;
	}

	.empty-state p {
		margin: 0 0 24px 0;
		color: #888888;
		max-width: 400px;
		line-height: 1.6;
	}

	.add-btn-large {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #1a1a1a;
		color: #ffffff;
		padding: 14px 28px;
		border-radius: 24px;
		text-decoration: none;
		font-weight: 500;
		font-size: 16px;
		transition: all 0.2s ease;
	}

	.add-btn-large:hover {
		background: #333333;
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
	}

	.projects-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: 24px;
		max-width: 1400px;
	}

	/* Relocate Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
	}

	.modal {
		background: #ffffff;
		border-radius: 16px;
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
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
		color: #1a1a1a;
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

	.close-btn:hover {
		background: #f3f4f6;
		color: #1a1a1a;
	}

	.modal-body {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow: hidden;
	}

	.modal-description {
		margin: 0;
		color: #4b5563;
		line-height: 1.5;
	}

	.old-path {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 10px 12px;
		background: #fef2f2;
		border-radius: 8px;
		font-size: 13px;
		color: #991b1b;
	}

	.old-path code {
		font-family: monospace;
		font-size: 12px;
		text-decoration: line-through;
	}

	.modal-error {
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

	.browser-container {
		flex: 1;
		overflow: hidden;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
	}
</style>
