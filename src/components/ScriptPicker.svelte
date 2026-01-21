<script lang="ts">
	import Icon from './Icon.svelte';

	interface DetectedScript {
		id: string;
		label: string;
		command: string;
		source: string;
		description?: string;
		icon?: string;
	}

	interface CustomAction {
		id: string;
		label: string;
		icon: string;
		command: string;
		description?: string;
		requiresConfirmation?: boolean;
	}

	let {
		projectId,
		detectedScripts = [],
		existingActions = [],
		onActionAdded
	}: {
		projectId: string;
		detectedScripts: DetectedScript[];
		existingActions: CustomAction[];
		onActionAdded?: (action: CustomAction) => void;
	} = $props();

	let isExpanded = $state(false);
	let addingScriptId = $state<string | null>(null);

	// Filter out scripts that already exist as custom actions
	const availableScripts = $derived(
		detectedScripts.filter(
			(script) => !existingActions.some((action) => action.command === script.command)
		)
	);

	// Group scripts by source
	const scriptsBySource = $derived(() => {
		const grouped: Record<string, DetectedScript[]> = {};
		for (const script of availableScripts) {
			if (!grouped[script.source]) {
				grouped[script.source] = [];
			}
			grouped[script.source].push(script);
		}
		return grouped;
	});

	const sourceLabels: Record<string, string> = {
		'package.json': 'NPM Scripts',
		Makefile: 'Make Targets',
		'docker-compose': 'Docker Compose'
	};

	const sourceIcons: Record<string, string> = {
		'package.json': 'package',
		Makefile: 'tool',
		'docker-compose': 'box'
	};

	async function addScript(script: DetectedScript) {
		addingScriptId = script.id;

		try {
			const action: CustomAction = {
				id: script.id,
				label: script.label,
				icon: script.icon || 'terminal',
				command: script.command,
				description: script.description
			};

			const response = await fetch(`/api/projects/${projectId}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ addAction: action })
			});

			if (response.ok) {
				onActionAdded?.(action);
			}
		} catch (error) {
			console.error('Failed to add action:', error);
		} finally {
			addingScriptId = null;
		}
	}
</script>

{#if availableScripts.length > 0}
	<div class="script-picker">
		<button class="picker-header" onclick={() => (isExpanded = !isExpanded)}>
			<div class="header-content">
				<Icon name="zap" size={14} />
				<span class="header-title">
					{availableScripts.length} scripts detected
				</span>
			</div>
			<Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
		</button>

		{#if isExpanded}
			<div class="scripts-list">
				<p class="hint">Click to add scripts as quick actions:</p>

				{#each Object.entries(scriptsBySource()) as [source, scripts]}
					<div class="source-group">
						<div class="source-header">
							<Icon name={sourceIcons[source] || 'file'} size={12} />
							<span>{sourceLabels[source] || source}</span>
						</div>

						{#each scripts as script}
							<button
								class="script-item"
								onclick={() => addScript(script)}
								disabled={addingScriptId === script.id}
							>
								<Icon name={script.icon || 'terminal'} size={14} />
								<div class="script-info">
									<span class="script-label">{script.label}</span>
									<span class="script-command">{script.command}</span>
								</div>
								{#if addingScriptId === script.id}
									<Icon name="loader" size={14} class="spinning" />
								{:else}
									<Icon name="plus" size={14} class="add-icon" />
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.script-picker {
		border-top: 1px solid #e5e7eb;
		margin-top: 8px;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 10px 14px;
		background: #fefce8;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}

	.picker-header:hover {
		background: #fef9c3;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #854d0e;
	}

	.header-title {
		font-size: 12px;
		font-weight: 500;
	}

	.scripts-list {
		padding: 12px 14px;
		background: #fffbeb;
	}

	.hint {
		margin: 0 0 12px;
		font-size: 11px;
		color: #92400e;
	}

	.source-group {
		margin-bottom: 12px;
	}

	.source-group:last-child {
		margin-bottom: 0;
	}

	.source-header {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #78716c;
		margin-bottom: 6px;
	}

	.script-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
		margin-bottom: 4px;
		transition: all 0.15s;
	}

	.script-item:hover:not(:disabled) {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.script-item:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.script-info {
		flex: 1;
		min-width: 0;
		text-align: left;
	}

	.script-label {
		display: block;
		font-size: 12px;
		font-weight: 500;
		color: #111827;
	}

	.script-command {
		display: block;
		font-size: 10px;
		color: #6b7280;
		font-family: 'SF Mono', Monaco, monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.add-icon {
		color: #9ca3af;
		transition: color 0.15s;
	}

	.script-item:hover:not(:disabled) .add-icon {
		color: #3b82f6;
	}

	:global(.spinning) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
