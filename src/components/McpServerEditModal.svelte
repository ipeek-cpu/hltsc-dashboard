<script lang="ts">
	import Icon from './Icon.svelte';
	import type { McpServerWithScope, McpServerConfig } from '$lib/types';

	let {
		server,
		onSave,
		onClose
	}: {
		server?: McpServerWithScope | null;
		onSave: (name: string, config: McpServerConfig) => void;
		onClose: () => void;
	} = $props();

	// Form state
	let name = $state(server?.name || '');
	let command = $state(server?.config.command || '');
	let argsText = $state(server?.config.args?.join(' ') || '');
	let envPairs = $state<Array<{ key: string; value: string }>>(
		server?.config.env
			? Object.entries(server.config.env).map(([key, value]) => ({ key, value }))
			: []
	);
	let disabled = $state(server?.config.disabled || false);

	let error = $state<string | null>(null);
	let saving = $state(false);

	const isEditing = !!server;

	function addEnvVar() {
		envPairs = [...envPairs, { key: '', value: '' }];
	}

	function removeEnvVar(index: number) {
		envPairs = envPairs.filter((_, i) => i !== index);
	}

	function updateEnvKey(index: number, key: string) {
		envPairs = envPairs.map((pair, i) => i === index ? { ...pair, key } : pair);
	}

	function updateEnvValue(index: number, value: string) {
		envPairs = envPairs.map((pair, i) => i === index ? { ...pair, value } : pair);
	}

	async function handleSubmit() {
		error = null;

		// Validation
		if (!name.trim()) {
			error = 'Server name is required';
			return;
		}

		if (!command.trim()) {
			error = 'Command is required';
			return;
		}

		// Parse args
		const args = argsText.trim() ? argsText.trim().split(/\s+/) : undefined;

		// Build env object
		const env: Record<string, string> = {};
		for (const pair of envPairs) {
			if (pair.key.trim()) {
				env[pair.key.trim()] = pair.value;
			}
		}

		const config: McpServerConfig = {
			type: 'stdio',
			command: command.trim(),
			args,
			env: Object.keys(env).length > 0 ? env : undefined,
			disabled: disabled || undefined
		};

		saving = true;
		try {
			onSave(name.trim(), config);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save';
			saving = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}
</script>

<div class="modal-overlay" onclick={handleBackdropClick} role="presentation">
	<div class="modal">
		<div class="modal-header">
			<h2>{isEditing ? 'Edit' : 'Add'} MCP Server</h2>
			<button class="close-btn" onclick={onClose}>
				<Icon name="x" size={20} />
			</button>
		</div>

		<form class="modal-body" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			{#if error}
				<div class="error-message">
					<Icon name="alert-circle" size={16} />
					{error}
				</div>
			{/if}

			<div class="form-group">
				<label for="name">Server Name</label>
				<input
					id="name"
					type="text"
					bind:value={name}
					placeholder="e.g., github"
					disabled={isEditing}
				/>
				{#if isEditing}
					<span class="hint">Name cannot be changed after creation</span>
				{/if}
			</div>

			<div class="form-group">
				<label for="command">Command</label>
				<input
					id="command"
					type="text"
					bind:value={command}
					placeholder="e.g., npx"
				/>
			</div>

			<div class="form-group">
				<label for="args">Arguments</label>
				<input
					id="args"
					type="text"
					bind:value={argsText}
					placeholder="e.g., -y @modelcontextprotocol/server-github"
				/>
				<span class="hint">Space-separated arguments</span>
			</div>

			<div class="form-group">
				<label>Environment Variables</label>
				<div class="env-list">
					{#each envPairs as pair, index (index)}
						<div class="env-row">
							<input
								type="text"
								value={pair.key}
								oninput={(e) => updateEnvKey(index, e.currentTarget.value)}
								placeholder="KEY"
								class="env-key"
							/>
							<span class="env-equals">=</span>
							<input
								type="text"
								value={pair.value}
								oninput={(e) => updateEnvValue(index, e.currentTarget.value)}
								placeholder="value"
								class="env-value"
							/>
							<button type="button" class="remove-env" onclick={() => removeEnvVar(index)}>
								<Icon name="x" size={14} />
							</button>
						</div>
					{/each}
					<button type="button" class="add-env" onclick={addEnvVar}>
						<Icon name="plus" size={14} />
						Add Variable
					</button>
				</div>
			</div>

			<div class="form-group checkbox-group">
				<label>
					<input type="checkbox" bind:checked={disabled} />
					<span>Disabled</span>
				</label>
				<span class="hint">Server won't be loaded by Claude Code</span>
			</div>
		</form>

		<div class="modal-footer">
			<button type="button" class="btn-cancel" onclick={onClose} disabled={saving}>
				Cancel
			</button>
			<button type="submit" class="btn-save" onclick={handleSubmit} disabled={saving}>
				{#if saving}
					<Icon name="loader" size={16} />
					Saving...
				{:else}
					<Icon name="check" size={16} />
					{isEditing ? 'Save Changes' : 'Add Server'}
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: #ffffff;
		border-radius: 12px;
		width: 480px;
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
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
		font-weight: 600;
		color: #1a1a1a;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		border-radius: 8px;
		color: #888888;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.modal-body {
		padding: 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: #fee2e2;
		color: #dc2626;
		border-radius: 8px;
		font-size: 14px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 14px;
		font-weight: 500;
		color: #1a1a1a;
	}

	.form-group input[type="text"] {
		padding: 10px 12px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		font-size: 14px;
		font-family: inherit;
		transition: border-color 0.15s ease;
	}

	.form-group input[type="text"]:focus {
		outline: none;
		border-color: #2563eb;
	}

	.form-group input[type="text"]:disabled {
		background: #f5f5f5;
		color: #888888;
	}

	.hint {
		font-size: 12px;
		color: #888888;
	}

	.env-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.env-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.env-key {
		flex: 0 0 140px;
		font-family: monospace !important;
	}

	.env-equals {
		color: #888888;
	}

	.env-value {
		flex: 1;
	}

	.remove-env {
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

	.remove-env:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.add-env {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1px dashed #d0d0d0;
		background: transparent;
		border-radius: 6px;
		font-size: 13px;
		color: #666666;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.add-env:hover {
		border-color: #2563eb;
		color: #2563eb;
	}

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-group input[type="checkbox"] {
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 16px 24px;
		border-top: 1px solid #eaeaea;
	}

	.btn-cancel,
	.btn-save {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 18px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.btn-cancel {
		background: #ffffff;
		border: 1px solid #e0e0e0;
		color: #4b5563;
	}

	.btn-cancel:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.btn-save {
		background: #2563eb;
		border: 1px solid #2563eb;
		color: #ffffff;
	}

	.btn-save:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-cancel:disabled,
	.btn-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
