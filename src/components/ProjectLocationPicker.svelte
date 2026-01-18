<script lang="ts">
	import Icon from './Icon.svelte';
	import DirectoryBrowser from './DirectoryBrowser.svelte';

	let {
		parentDirectory = $bindable(''),
		projectName = $bindable(''),
		onValidationChange = () => {}
	}: {
		parentDirectory?: string;
		projectName?: string;
		onValidationChange?: (isValid: boolean, error?: string) => void;
	} = $props();

	let showBrowser = $state(false);
	let validationError = $state<string | null>(null);
	let isChecking = $state(false);

	// Validate project name format
	function validateProjectName(name: string): string | null {
		if (!name.trim()) {
			return 'Project name is required';
		}
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			return 'Only letters, numbers, hyphens, and underscores allowed';
		}
		if (name.length > 50) {
			return 'Name must be 50 characters or less';
		}
		return null;
	}

	// Check if directory already exists
	async function checkDirectoryExists(parent: string, name: string): Promise<boolean> {
		if (!parent || !name) return false;

		try {
			const fullPath = `${parent}/${name}`;
			const response = await fetch(`/api/filesystem/exists?path=${encodeURIComponent(fullPath)}`);
			const data = await response.json();
			return data.exists;
		} catch {
			return false;
		}
	}

	// Full validation
	async function validate() {
		const nameError = validateProjectName(projectName);
		if (nameError) {
			validationError = nameError;
			onValidationChange(false, nameError);
			return;
		}

		if (!parentDirectory) {
			validationError = 'Please select a parent folder';
			onValidationChange(false, validationError);
			return;
		}

		isChecking = true;
		const exists = await checkDirectoryExists(parentDirectory, projectName);
		isChecking = false;

		if (exists) {
			validationError = 'A folder with this name already exists';
			onValidationChange(false, validationError);
			return;
		}

		validationError = null;
		onValidationChange(true);
	}

	// Re-validate when inputs change
	$effect(() => {
		if (projectName || parentDirectory) {
			validate();
		}
	});

	function handleDirectorySelect(path: string) {
		parentDirectory = path;
		showBrowser = false;
	}

	function handleBrowserCancel() {
		showBrowser = false;
	}

	let fullPath = $derived(
		parentDirectory && projectName ? `${parentDirectory}/${projectName}` : ''
	);
</script>

<div class="location-picker">
	<div class="field">
		<label for="projectName">Project Name</label>
		<input
			type="text"
			id="projectName"
			bind:value={projectName}
			placeholder="my-new-project"
			class:error={validationError && projectName}
		/>
		{#if validationError && projectName}
			<span class="field-error">{validationError}</span>
		{/if}
	</div>

	<div class="field">
		<label>Parent Folder</label>
		<button class="folder-select-btn" onclick={() => showBrowser = true}>
			{#if parentDirectory}
				<Icon name="folder" size={18} />
				<span class="folder-path">{parentDirectory}</span>
			{:else}
				<Icon name="folder-plus" size={18} />
				<span class="folder-placeholder">Choose folder...</span>
			{/if}
			<Icon name="chevron-right" size={16} />
		</button>
	</div>

	{#if fullPath}
		<div class="full-path-preview">
			<Icon name="corner-down-right" size={14} />
			<span class="path-label">Will create:</span>
			<code class="path-value">{fullPath}</code>
			{#if isChecking}
				<Icon name="loader" size={14} class="spinner" />
			{/if}
		</div>
	{/if}
</div>

{#if showBrowser}
	<div class="browser-overlay">
		<div class="browser-modal">
			<DirectoryBrowser
				onSelect={handleDirectorySelect}
				onCancel={handleBrowserCancel}
			/>
		</div>
	</div>
{/if}

<style>
	.location-picker {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field label {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.field input {
		padding: 12px 14px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		background: #ffffff;
		color: #1f2937;
		transition: border-color 0.15s ease;
	}

	.field input:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.field input.error {
		border-color: #dc2626;
	}

	.field-error {
		font-size: 12px;
		color: #dc2626;
	}

	.folder-select-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		background: #f9fafb;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.folder-select-btn:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.folder-path {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: monospace;
		font-size: 13px;
	}

	.folder-placeholder {
		flex: 1;
		color: #9ca3af;
	}

	.full-path-preview {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 14px;
		background: #f0fdf4;
		border: 1px solid #86efac;
		border-radius: 8px;
		font-size: 13px;
		color: #166534;
	}

	.path-label {
		color: #15803d;
		font-weight: 500;
	}

	.path-value {
		flex: 1;
		font-family: monospace;
		font-size: 12px;
		background: transparent;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.full-path-preview :global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.browser-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
	}

	.browser-modal {
		width: 100%;
		max-width: 600px;
		max-height: 80vh;
	}
</style>
