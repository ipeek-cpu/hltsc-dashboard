<script lang="ts">
	import Icon from './Icon.svelte';
	import type { McpServerWithScope } from '$lib/types';

	let {
		server,
		onEdit,
		onDelete,
		showScope = true
	}: {
		server: McpServerWithScope;
		onEdit?: () => void;
		onDelete?: () => void;
		showScope?: boolean;
	} = $props();

	const scopeColors = {
		global: { bg: '#dbeafe', text: '#1d4ed8' },
		project: { bg: '#dcfce7', text: '#16a34a' },
		agent: { bg: '#fef3c7', text: '#d97706' }
	};

	let scopeStyle = $derived(scopeColors[server.scope]);

	// Format the command display
	let commandDisplay = $derived(() => {
		const cmd = server.config.command;
		const args = server.config.args || [];
		if (args.length === 0) return cmd;
		if (args.length <= 2) return `${cmd} ${args.join(' ')}`;
		return `${cmd} ${args.slice(0, 2).join(' ')}...`;
	});

	// Count environment variables
	let envCount = $derived(server.config.env ? Object.keys(server.config.env).length : 0);
</script>

<div class="server-card" class:disabled={server.config.disabled}>
	<div class="card-header">
		<div class="name-row">
			<span class="server-name">{server.name}</span>
			{#if showScope}
				<span class="scope-badge" style="background: {scopeStyle.bg}; color: {scopeStyle.text}">
					{server.scope}
				</span>
			{/if}
			{#if server.config.disabled}
				<span class="disabled-badge">Disabled</span>
			{/if}
		</div>
		<div class="actions">
			{#if onEdit}
				<button class="action-btn" onclick={onEdit} title="Edit">
					<Icon name="edit-2" size={14} />
				</button>
			{/if}
			{#if onDelete}
				<button class="action-btn delete" onclick={onDelete} title="Delete">
					<Icon name="trash-2" size={14} />
				</button>
			{/if}
		</div>
	</div>

	<div class="card-body">
		<div class="info-row">
			<Icon name="terminal" size={14} />
			<code class="command">{commandDisplay()}</code>
		</div>
		{#if envCount > 0}
			<div class="info-row">
				<Icon name="key" size={14} />
				<span class="env-count">{envCount} environment variable{envCount !== 1 ? 's' : ''}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.server-card {
		background: #ffffff;
		border: 1px solid #eaeaea;
		border-radius: 10px;
		padding: 16px;
		transition: all 0.15s ease;
	}

	.server-card:hover {
		border-color: #d0d0d0;
	}

	.server-card.disabled {
		opacity: 0.6;
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.server-name {
		font-size: 15px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.scope-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 12px;
		text-transform: capitalize;
	}

	.disabled-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 12px;
		background: #fee2e2;
		color: #dc2626;
	}

	.actions {
		display: flex;
		gap: 4px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		border-radius: 6px;
		color: #888888;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.action-btn.delete:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.info-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #666666;
		font-size: 13px;
	}

	.command {
		background: #f5f5f5;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 12px;
		color: #1a1a1a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 300px;
	}

	.env-count {
		color: #666666;
	}
</style>
