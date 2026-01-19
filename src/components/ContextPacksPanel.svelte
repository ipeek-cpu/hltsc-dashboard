<script lang="ts">
	import Icon from './Icon.svelte';
	import ContextPackGenerator from './ContextPackGenerator.svelte';
	import ContextPackViewer from './ContextPackViewer.svelte';
	import type { ContextPack, ContextPackSummary } from '$lib/context-pack-types';

	let { projectId }: {
		projectId: string;
	} = $props();

	type ViewMode = 'list' | 'generate' | 'view';

	let viewMode: ViewMode = $state('list');
	let packs = $state<ContextPackSummary[]>([]);
	let selectedPack = $state<ContextPack | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Load packs on mount
	$effect(() => {
		loadPacks();
	});

	async function loadPacks() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/context-packs`);
			if (!response.ok) throw new Error('Failed to load context packs');

			const data = await response.json();
			packs = data.packs || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
		}
	}

	async function viewPack(packId: string) {
		try {
			const response = await fetch(
				`/api/projects/${projectId}/context-packs?packId=${packId}`
			);
			if (!response.ok) throw new Error('Failed to load pack');

			const data = await response.json();
			selectedPack = data.pack;
			viewMode = 'view';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load pack';
		}
	}

	function handleGenerated(pack: ContextPack) {
		selectedPack = pack;
		viewMode = 'view';
		loadPacks(); // Refresh list
	}

	function formatTokens(tokens: number): string {
		if (tokens >= 1000) {
			return `${(tokens / 1000).toFixed(1)}K`;
		}
		return tokens.toString();
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}
</script>

<div class="context-packs-panel">
	{#if viewMode === 'list'}
		<header class="panel-header">
			<div class="header-left">
				<Icon name="package" size={18} />
				<h3>Context Packs</h3>
				<span class="pack-count">{packs.length}</span>
			</div>
			<button class="btn-icon-text" onclick={() => viewMode = 'generate'}>
				<Icon name="plus" size={14} />
				New
			</button>
		</header>

		<div class="panel-content">
			{#if isLoading}
				<div class="loading-state">
					<span class="spinner"></span>
					<span>Loading packs...</span>
				</div>
			{:else if error}
				<div class="error-state">
					<Icon name="alert-circle" size={16} />
					<span>{error}</span>
					<button class="retry-btn" onclick={loadPacks}>Retry</button>
				</div>
			{:else if packs.length === 0}
				<div class="empty-state">
					<Icon name="package" size={32} />
					<p>No context packs yet</p>
					<p class="hint">Generate a pack to capture code context for Claude sessions</p>
					<button class="btn btn-primary" onclick={() => viewMode = 'generate'}>
						<Icon name="zap" size={14} />
						Generate First Pack
					</button>
				</div>
			{:else}
				<div class="packs-list">
					{#each packs as pack}
						<button class="pack-item" onclick={() => viewPack(pack.id)}>
							<div class="pack-info">
								<span class="pack-name">{pack.name}</span>
								<span class="pack-meta">
									{pack.symbolCount} symbols &middot; {pack.fileCount} files &middot; {formatTokens(pack.totalTokens)} tok
								</span>
							</div>
							<div class="pack-right">
								<span class="pack-method" class:codegraph={pack.generationMethod === 'codegraph'}>
									{pack.generationMethod}
								</span>
								<span class="pack-time">{formatDate(pack.createdAt)}</span>
							</div>
							<Icon name="chevron-right" size={14} />
						</button>
					{/each}
				</div>
			{/if}
		</div>

	{:else if viewMode === 'generate'}
		<ContextPackGenerator
			{projectId}
			onGenerated={handleGenerated}
			onCancel={() => viewMode = 'list'}
		/>

	{:else if viewMode === 'view' && selectedPack}
		<ContextPackViewer
			pack={selectedPack}
			onClose={() => {
				selectedPack = null;
				viewMode = 'list';
			}}
		/>
	{/if}
</div>

<style>
	.context-packs-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
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
		gap: 8px;
	}

	.header-left h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}

	.pack-count {
		padding: 2px 6px;
		font-size: 11px;
		background: #e5e7eb;
		border-radius: 10px;
		color: #6b7280;
	}

	.btn-icon-text {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		font-size: 12px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-icon-text:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
	}

	.loading-state, .error-state, .empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		gap: 12px;
		color: #6b7280;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-state {
		color: #dc2626;
	}

	.retry-btn {
		padding: 6px 12px;
		border: 1px solid #fecaca;
		border-radius: 4px;
		background: #fef2f2;
		font-size: 12px;
		color: #991b1b;
		cursor: pointer;
	}

	.retry-btn:hover {
		background: #fee2e2;
	}

	.empty-state p {
		margin: 0;
		text-align: center;
	}

	.empty-state .hint {
		font-size: 13px;
		color: #9ca3af;
		max-width: 250px;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		margin-top: 8px;
	}

	.btn-primary {
		background: #2563eb;
		color: #ffffff;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.packs-list {
		display: flex;
		flex-direction: column;
	}

	.pack-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border: none;
		border-bottom: 1px solid #f3f4f6;
		background: #ffffff;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
	}

	.pack-item:hover {
		background: #f9fafb;
	}

	.pack-item:last-child {
		border-bottom: none;
	}

	.pack-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.pack-name {
		font-size: 13px;
		font-weight: 500;
		color: #111827;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pack-meta {
		font-size: 11px;
		color: #9ca3af;
	}

	.pack-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}

	.pack-method {
		padding: 2px 6px;
		font-size: 10px;
		font-weight: 500;
		background: #f3f4f6;
		border-radius: 4px;
		color: #6b7280;
	}

	.pack-method.codegraph {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.pack-time {
		font-size: 11px;
		color: #9ca3af;
	}
</style>
