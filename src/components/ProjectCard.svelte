<script lang="ts">
	import type { ProjectWithStats } from '$lib/dashboard-db';
	import Icon from './Icon.svelte';

	let {
		project,
		onDelete,
		onUpdateBeads,
		onRelocate
	}: {
		project: ProjectWithStats;
		onDelete: (id: string) => void;
		onUpdateBeads?: (project: ProjectWithStats) => void;
		onRelocate?: (project: ProjectWithStats) => void;
	} = $props();

	function truncatePath(pathStr: string, maxLen: number): string {
		if (pathStr.length <= maxLen) return pathStr;
		const parts = pathStr.split('/');
		if (parts.length <= 3) return pathStr;
		return '.../' + parts.slice(-3).join('/');
	}

	function handleDelete(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (confirm(`Remove "${project.name}" from dashboard?\n\nThis will not delete the actual project files.`)) {
			onDelete(project.id);
		}
	}

	function handleUpdateBeads(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onUpdateBeads?.(project);
	}

	function handleRelocate(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onRelocate?.(project);
	}

	function handleCardClick(e: MouseEvent) {
		if (project.folder_missing) {
			e.preventDefault();
		}
	}
</script>

<a
	href={project.folder_missing ? '#' : `/projects/${project.id}`}
	class="project-card"
	class:folder-missing={project.folder_missing}
	onclick={handleCardClick}
>
	<div class="card-header">
		<span class="project-icon" class:error={project.folder_missing}>
			<Icon name={project.folder_missing ? "alert-triangle" : "folder"} size={20} />
		</span>
		<h3 class="project-name">{project.name}</h3>
		{#if !project.folder_missing && project.beads_outdated && onUpdateBeads}
			<button class="update-btn" onclick={handleUpdateBeads} title="Update Beads to latest version">
				<Icon name="download" size={14} />
				Update
			</button>
		{/if}
		<button class="delete-btn" onclick={handleDelete} title="Remove from dashboard">
			<Icon name="x" size={18} />
		</button>
	</div>

	{#if project.folder_missing}
		<div class="missing-folder-banner">
			<Icon name="alert-circle" size={14} />
			<span>Folder Missing</span>
		</div>
		<p class="project-path missing" title={project.path}>{truncatePath(project.path, 40)}</p>
		<div class="missing-folder-actions">
			<button class="action-btn relocate" onclick={handleRelocate}>
				<Icon name="folder" size={14} />
				Locate Folder
			</button>
			<button class="action-btn remove" onclick={handleDelete}>
				<Icon name="trash-2" size={14} />
				Remove Project
			</button>
		</div>
	{:else}
		{#if project.beads_outdated}
			<div class="outdated-badge">
				<Icon name="alert-circle" size={12} />
				<span>Beads update available</span>
			</div>
		{/if}

		<p class="project-path" title={project.path}>{truncatePath(project.path, 40)}</p>

		<div class="card-stats">
			<div class="stat open">
				<span class="stat-value">{project.open_count}</span>
				<span class="stat-label">Open</span>
			</div>
			<div class="stat in-progress">
				<span class="stat-value">{project.in_progress_count}</span>
				<span class="stat-label">In Progress</span>
			</div>
			<div class="stat total">
				<span class="stat-value">{project.total_count}</span>
				<span class="stat-label">Total</span>
			</div>
		</div>
	{/if}
</a>

<style>
	.project-card {
		display: block;
		background: #ffffff;
		border-radius: 16px;
		padding: 24px;
		border: none;
		transition: all 0.2s ease;
		cursor: pointer;
		text-decoration: none;
		color: inherit;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
	}

	.project-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.project-icon {
		color: #888888;
	}

	.project-name {
		flex: 1;
		margin: 0;
		font-size: 20px;
		font-weight: 400;
		color: #1a1a1a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: #cccccc;
		cursor: pointer;
		padding: 6px;
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.delete-btn:hover {
		background: #fee2e2;
		color: #dc3545;
	}

	.update-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #fef3c7;
		border: 1px solid #fbbf24;
		color: #92400e;
		cursor: pointer;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		transition: all 0.2s ease;
	}

	.update-btn:hover {
		background: #fde68a;
		border-color: #f59e0b;
	}

	.outdated-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: #fef3c7;
		color: #92400e;
		font-size: 11px;
		font-weight: 500;
		padding: 4px 8px;
		border-radius: 4px;
		margin-bottom: 8px;
	}

	.project-path {
		font-family: monospace;
		font-size: 12px;
		color: #888888;
		margin: 0 0 20px 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-stats {
		display: flex;
		gap: 12px;
	}

	.stat {
		flex: 1;
		text-align: center;
		padding: 12px 8px;
		background: #f8f8f8;
		border-radius: 12px;
		min-width: 0;
	}

	.stat-value {
		display: block;
		font-size: 22px;
		font-weight: 600;
		margin-bottom: 4px;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.stat-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #888888;
		white-space: nowrap;
	}

	.stat.open .stat-value {
		color: #3b82f6;
	}

	.stat.in-progress .stat-value {
		color: #f59e0b;
	}

	.stat.total .stat-value {
		color: #666666;
	}

	/* Missing folder state */
	.project-card.folder-missing {
		border: 2px solid #fecaca;
		background: #fef2f2;
		cursor: default;
	}

	.project-card.folder-missing:hover {
		transform: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
	}

	.project-icon.error {
		color: #dc2626;
	}

	.missing-folder-banner {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #fee2e2;
		color: #dc2626;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 6px;
		margin-bottom: 8px;
	}

	.project-path.missing {
		color: #dc2626;
		text-decoration: line-through;
		margin-bottom: 16px;
	}

	.missing-folder-actions {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		font-family: 'Figtree', sans-serif;
		cursor: pointer;
		transition: all 0.15s ease;
		flex: 1;
		justify-content: center;
	}

	.action-btn.relocate {
		background: #ffffff;
		border: 1px solid #d1d5db;
		color: #374151;
	}

	.action-btn.relocate:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.action-btn.remove {
		background: #fee2e2;
		border: 1px solid #fecaca;
		color: #dc2626;
	}

	.action-btn.remove:hover {
		background: #fecaca;
		border-color: #f87171;
	}
</style>
