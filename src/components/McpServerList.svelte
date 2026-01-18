<script lang="ts">
	import Icon from './Icon.svelte';
	import McpServerCard from './McpServerCard.svelte';
	import McpServerEditModal from './McpServerEditModal.svelte';
	import type { McpServerWithScope, McpServerConfig } from '$lib/types';

	let {
		servers,
		onDelete,
		onUpdate,
		emptyMessage = 'No MCP servers configured'
	}: {
		servers: McpServerWithScope[];
		onDelete?: (name: string) => void;
		onUpdate?: (name: string, config: McpServerConfig) => void;
		emptyMessage?: string;
	} = $props();

	// Edit modal state
	let editingServer = $state<McpServerWithScope | null>(null);
	let showAddModal = $state(false);

	function handleEdit(server: McpServerWithScope) {
		editingServer = server;
	}

	function handleCloseEdit() {
		editingServer = null;
	}

	function handleSaveEdit(name: string, config: McpServerConfig) {
		onUpdate?.(name, config);
		editingServer = null;
	}

	function handleDelete(name: string) {
		if (confirm(`Are you sure you want to remove the "${name}" MCP server?`)) {
			onDelete?.(name);
		}
	}
</script>

<div class="server-list">
	{#if servers.length === 0}
		<div class="empty-state">
			<Icon name="cpu" size={32} strokeWidth={1.5} />
			<p>{emptyMessage}</p>
		</div>
	{:else}
		<div class="servers">
			{#each servers as server (server.name)}
				<McpServerCard
					{server}
					onEdit={() => handleEdit(server)}
					onDelete={() => handleDelete(server.name)}
				/>
			{/each}
		</div>
	{/if}
</div>

{#if editingServer}
	<McpServerEditModal
		server={editingServer}
		onSave={handleSaveEdit}
		onClose={handleCloseEdit}
	/>
{/if}

<style>
	.server-list {
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 32px;
		color: #888888;
		text-align: center;
	}

	.empty-state p {
		margin: 0;
		font-size: 14px;
	}

	.servers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
