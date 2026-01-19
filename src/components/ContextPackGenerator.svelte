<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ContextPack, ContextPackRequest, ContextPackConfig } from '$lib/context-pack-types';
	import { DEFAULT_CONTEXT_PACK_CONFIG } from '$lib/context-pack-types';

	let { projectId, onGenerated, onCancel }: {
		projectId: string;
		onGenerated?: (pack: ContextPack) => void;
		onCancel?: () => void;
	} = $props();

	let entryPoint = $state('');
	let entryPointType: 'file' | 'symbol' | 'query' = $state('query');
	let name = $state('');
	let description = $state('');
	let showAdvanced = $state(false);

	// Advanced config
	let maxTokens = $state(DEFAULT_CONTEXT_PACK_CONFIG.maxTokens);
	let maxSymbols = $state(DEFAULT_CONTEXT_PACK_CONFIG.maxSymbols);
	let maxDepth = $state(DEFAULT_CONTEXT_PACK_CONFIG.maxDepth);
	let includeTests = $state(DEFAULT_CONTEXT_PACK_CONFIG.includeTests);

	let isGenerating = $state(false);
	let error = $state<string | null>(null);

	let canGenerate = $derived(entryPoint.trim().length > 0);

	async function generate() {
		if (!canGenerate || isGenerating) return;

		isGenerating = true;
		error = null;

		try {
			const config: Partial<ContextPackConfig> = {
				maxTokens,
				maxSymbols,
				maxDepth,
				includeTests
			};

			const request: ContextPackRequest = {
				name: name.trim() || `Context: ${entryPoint.slice(0, 50)}`,
				entryPoint: entryPoint.trim(),
				entryPointType,
				description: description.trim() || undefined,
				config
			};

			const response = await fetch(`/api/projects/${projectId}/context-packs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request)
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.message || `Generation failed: ${response.status}`);
			}

			const data = await response.json();

			if (data.success && onGenerated) {
				// Fetch full pack for viewer
				const packResponse = await fetch(
					`/api/projects/${projectId}/context-packs?packId=${data.pack.id}`
				);
				if (packResponse.ok) {
					const packData = await packResponse.json();
					onGenerated(packData.pack);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			isGenerating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			generate();
		}
	}
</script>

<div class="context-pack-generator" onkeydown={handleKeydown}>
	<header class="generator-header">
		<div class="header-left">
			<Icon name="package" size={20} />
			<h2>Generate Context Pack</h2>
		</div>
		{#if onCancel}
			<button class="icon-btn" onclick={onCancel}>
				<Icon name="x" size={16} />
			</button>
		{/if}
	</header>

	<div class="generator-form">
		<div class="form-group">
			<label for="entry-point">Entry Point</label>
			<div class="entry-point-input">
				<select bind:value={entryPointType} class="type-select">
					<option value="query">Query</option>
					<option value="symbol">Symbol</option>
					<option value="file">File</option>
				</select>
				<input
					id="entry-point"
					type="text"
					bind:value={entryPoint}
					placeholder={entryPointType === 'query'
						? 'e.g., "user authentication flow"'
						: entryPointType === 'symbol'
						? 'e.g., "handleLogin"'
						: 'e.g., "src/lib/auth.ts"'}
					class="entry-input"
				/>
			</div>
			<p class="form-hint">
				{#if entryPointType === 'query'}
					Describe what you want context for in natural language
				{:else if entryPointType === 'symbol'}
					Enter a function, class, or type name to trace
				{:else}
					Enter a file path relative to project root
				{/if}
			</p>
		</div>

		<div class="form-group">
			<label for="pack-name">Name (optional)</label>
			<input
				id="pack-name"
				type="text"
				bind:value={name}
				placeholder="Auto-generated from entry point"
			/>
		</div>

		<div class="form-group">
			<label for="description">Description (optional)</label>
			<textarea
				id="description"
				bind:value={description}
				placeholder="What is this context pack for?"
				rows="2"
			></textarea>
		</div>

		<button
			class="advanced-toggle"
			onclick={() => showAdvanced = !showAdvanced}
		>
			<Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} size={14} />
			Advanced Options
		</button>

		{#if showAdvanced}
			<div class="advanced-options">
				<div class="form-row">
					<div class="form-group">
						<label for="max-tokens">Max Tokens</label>
						<input
							id="max-tokens"
							type="number"
							bind:value={maxTokens}
							min="1000"
							max="200000"
							step="1000"
						/>
					</div>
					<div class="form-group">
						<label for="max-symbols">Max Symbols</label>
						<input
							id="max-symbols"
							type="number"
							bind:value={maxSymbols}
							min="5"
							max="200"
						/>
					</div>
					<div class="form-group">
						<label for="max-depth">Max Depth</label>
						<input
							id="max-depth"
							type="number"
							bind:value={maxDepth}
							min="0"
							max="5"
						/>
					</div>
				</div>
				<div class="form-group checkbox-group">
					<label>
						<input type="checkbox" bind:checked={includeTests} />
						Include test files
					</label>
				</div>
			</div>
		{/if}

		{#if error}
			<div class="error-message">
				<Icon name="alert-circle" size={14} />
				{error}
			</div>
		{/if}
	</div>

	<footer class="generator-footer">
		{#if onCancel}
			<button class="btn btn-secondary" onclick={onCancel} disabled={isGenerating}>
				Cancel
			</button>
		{/if}
		<button
			class="btn btn-primary"
			onclick={generate}
			disabled={!canGenerate || isGenerating}
		>
			{#if isGenerating}
				<span class="spinner"></span>
				Generating...
			{:else}
				<Icon name="zap" size={14} />
				Generate
			{/if}
		</button>
	</footer>
</div>

<style>
	.context-pack-generator {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #ffffff;
		border-radius: 8px;
		overflow: hidden;
	}

	.generator-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-left h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.icon-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.generator-form {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 13px;
		font-weight: 500;
		color: #374151;
	}

	.form-hint {
		margin: 0;
		font-size: 12px;
		color: #9ca3af;
	}

	.entry-point-input {
		display: flex;
		gap: 8px;
	}

	.type-select {
		padding: 8px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #ffffff;
		font-size: 13px;
		color: #374151;
		cursor: pointer;
	}

	.type-select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	.entry-input {
		flex: 1;
	}

	input[type="text"],
	input[type="number"],
	textarea {
		padding: 10px 12px;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		font-size: 14px;
		color: #111827;
		transition: all 0.15s;
	}

	input[type="text"]:focus,
	input[type="number"]:focus,
	textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	input::placeholder,
	textarea::placeholder {
		color: #9ca3af;
	}

	textarea {
		resize: vertical;
		min-height: 60px;
	}

	.advanced-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		border: none;
		background: none;
		font-size: 13px;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		transition: color 0.15s;
	}

	.advanced-toggle:hover {
		color: #374151;
	}

	.advanced-options {
		padding: 16px;
		background: #f9fafb;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}

	.checkbox-group label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: normal;
		cursor: pointer;
	}

	.checkbox-group input[type="checkbox"] {
		width: 16px;
		height: 16px;
		cursor: pointer;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 6px;
		font-size: 13px;
		color: #991b1b;
	}

	.generator-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #2563eb;
		color: #ffffff;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #ffffff;
		border: 1px solid #e5e7eb;
		color: #374151;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #f9fafb;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
