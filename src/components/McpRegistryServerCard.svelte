<script lang="ts">
	import Icon from './Icon.svelte';
	import type { McpRegistryResult } from '$lib/types';

	let {
		server,
		onAdd,
		adding = false
	}: {
		server: McpRegistryResult;
		onAdd?: () => void;
		adding?: boolean;
	} = $props();

	// Get package type badge
	let packageType = $derived(() => {
		const pkg = server.server.packages[0];
		if (!pkg) return 'unknown';
		return pkg.registryType;
	});

	let packageTypeColor = $derived(() => {
		const type = packageType();
		switch (type) {
			case 'npm': return { bg: '#fee2e2', text: '#dc2626' };
			case 'pip': return { bg: '#dbeafe', text: '#2563eb' };
			case 'docker': return { bg: '#e0e7ff', text: '#4f46e5' };
			default: return { bg: '#f5f5f5', text: '#666666' };
		}
	});

	// Check for required env vars
	let requiredEnvVars = $derived(() => {
		const pkg = server.server.packages[0];
		return pkg?.environmentVariables || [];
	});
</script>

<div class="registry-card">
	<div class="card-header">
		<div class="name-row">
			<span class="server-name">{server.server.name}</span>
			<span
				class="package-badge"
				style="background: {packageTypeColor().bg}; color: {packageTypeColor().text}"
			>
				{packageType()}
			</span>
		</div>
		<button
			class="add-btn"
			onclick={onAdd}
			disabled={adding}
			title="Add to global config"
		>
			{#if adding}
				<Icon name="loader" size={14} />
			{:else}
				<Icon name="plus" size={14} />
			{/if}
		</button>
	</div>

	<p class="description">{server.server.description || 'No description'}</p>

	<div class="card-footer">
		{#if requiredEnvVars().length > 0}
			<div class="env-hint">
				<Icon name="key" size={12} />
				<span>Requires: {requiredEnvVars().slice(0, 2).join(', ')}{requiredEnvVars().length > 2 ? '...' : ''}</span>
			</div>
		{/if}
		{#if server.server.repository?.url}
			<a
				href={server.server.repository.url}
				target="_blank"
				rel="noopener noreferrer"
				class="repo-link"
			>
				<Icon name="external-link" size={12} />
				Repo
			</a>
		{/if}
	</div>
</div>

<style>
	.registry-card {
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 10px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		transition: all 0.15s ease;
	}

	.registry-card:hover {
		border-color: #d0d0d0;
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.server-name {
		font-size: 14px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.package-badge {
		font-size: 10px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 10px;
		text-transform: uppercase;
	}

	.add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid #e0e0e0;
		background: #ffffff;
		border-radius: 6px;
		color: #666666;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-btn:hover:not(:disabled) {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
	}

	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.description {
		margin: 0;
		font-size: 13px;
		color: #666666;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: auto;
	}

	.env-hint {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #888888;
	}

	.repo-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: #2563eb;
		text-decoration: none;
	}

	.repo-link:hover {
		text-decoration: underline;
	}
</style>
