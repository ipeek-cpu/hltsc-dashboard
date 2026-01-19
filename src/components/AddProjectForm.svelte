<script lang="ts">
	import { goto } from '$app/navigation';
	import DirectoryBrowser from './DirectoryBrowser.svelte';
	import Icon from './Icon.svelte';

	let pathInput = $state('');
	let showBrowser = $state(false);
	let validating = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	let needsInit = $state(false);
	let initPath = $state<string | null>(null);
	let initializing = $state(false);
	let beadsNotInstalled = $state(false);

	async function validateAndAdd(projectPath: string) {
		if (!projectPath.trim()) {
			error = 'Please enter a path';
			return;
		}

		validating = true;
		error = null;
		needsInit = false;
		initPath = null;

		try {
			// First validate the path
			const validateResponse = await fetch('/api/projects/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: projectPath.trim() })
			});

			const validation = await validateResponse.json();

			if (!validation.valid) {
				// Check if the folder needs beads initialization
				if (validation.needsInit) {
					// If .beads directory already exists, auto-repair without showing dialog
					if (validation.hasBeadsDir) {
						initPath = projectPath.trim();
						await autoRepairBeads();
						return;
					}
					// Otherwise show the init dialog
					needsInit = true;
					initPath = projectPath.trim();
					error = null;
				} else {
					error = validation.error;
				}
				return;
			}

			// If valid, add the project
			await addProject(projectPath.trim());
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			validating = false;
		}
	}

	async function addProject(projectPath: string) {
		const addResponse = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: projectPath })
		});

		if (!addResponse.ok) {
			const result = await addResponse.json();
			error = result.error || 'Failed to add project';
			return;
		}

		success = true;
		setTimeout(() => {
			goto('/');
		}, 500);
	}

	// Auto-repair beads when .beads dir exists but db is missing
	async function autoRepairBeads() {
		if (!initPath) return;

		// Don't show init dialog, just repair silently
		validating = true;
		error = null;

		try {
			const response = await fetch('/api/projects/init-beads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: initPath })
			});

			const result = await response.json();

			if (!result.success) {
				if (result.alreadyInitialized) {
					// Already initialized - just add the project
					await addProject(initPath);
					initPath = null;
					return;
				}
				// Show error but don't show init dialog
				error = result.error || 'Failed to repair beads';
				return;
			}

			// Repair succeeded, add the project
			await addProject(initPath);
			initPath = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			validating = false;
		}
	}

	async function initializeBeads() {
		if (!initPath) return;

		initializing = true;
		error = null;
		beadsNotInstalled = false;

		try {
			const response = await fetch('/api/projects/init-beads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: initPath })
			});

			const result = await response.json();

			if (!result.success) {
				if (result.notInstalled) {
					beadsNotInstalled = true;
					return;
				} else if (result.alreadyInitialized) {
					// Beads is already initialized - just add the project directly
					await addProject(initPath);
					needsInit = false;
					initPath = null;
					return;
				} else {
					error = result.error || 'Failed to initialize beads';
				}
				return;
			}

			// Now add the project
			await addProject(initPath);
			needsInit = false;
			initPath = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			initializing = false;
		}
	}

	function cancelInit() {
		needsInit = false;
		initPath = null;
		beadsNotInstalled = false;
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		validateAndAdd(pathInput);
	}

	function handleBrowserSelect(path: string) {
		showBrowser = false;
		pathInput = path;
		validateAndAdd(path);
	}

	function handleBrowserCancel() {
		showBrowser = false;
	}

	function openBrowser() {
		showBrowser = true;
		error = null;
	}
</script>

<div class="add-form">
	{#if showBrowser}
		<DirectoryBrowser onSelect={handleBrowserSelect} onCancel={handleBrowserCancel} />
	{:else if needsInit && initPath}
		<div class="init-prompt">
			{#if beadsNotInstalled}
				<div class="init-icon warning">
					<Icon name="alert-triangle" size={48} strokeWidth={1.5} />
				</div>
				<h2>Beads CLI Not Found</h2>
				<p class="init-desc">
					To use this dashboard, you need to install the Beads CLI first.
				</p>
				<div class="install-instructions">
					<p>Install Beads using pip:</p>
					<code class="install-command">pip install beads-cli</code>
					<p class="install-note">
						Or visit <a href="https://github.com/steveyegge/beads" target="_blank" rel="noopener">github.com/steveyegge/beads</a> for more options.
					</p>
				</div>
				<div class="init-actions">
					<button class="cancel-btn" onclick={cancelInit}>
						Go Back
					</button>
					<button class="init-btn" onclick={initializeBeads}>
						<Icon name="refresh-cw" size={16} />
						Try Again
					</button>
				</div>
			{:else}
				<div class="init-icon">
					<Icon name="package" size={48} strokeWidth={1.5} />
				</div>
				<h2>Initialize Beads?</h2>
				<p class="init-path"><code>{initPath}</code></p>
				<p class="init-desc">
					This folder doesn't have Beads set up yet. Would you like to initialize it?
				</p>
				<p class="init-info">
					This will create a <code>.beads</code> directory with a database to track issues.
				</p>
				<div class="init-actions">
					<button class="cancel-btn" onclick={cancelInit} disabled={initializing}>
						Cancel
					</button>
					<button class="init-btn" onclick={initializeBeads} disabled={initializing}>
						{#if initializing}
							<Icon name="loader" size={16} />
							Initializing...
						{:else}
							<Icon name="plus" size={16} />
							Initialize Beads
						{/if}
					</button>
				</div>
				{#if error}
					<div class="error-message">{error}</div>
				{/if}
			{/if}
		</div>
	{:else}
		<button class="browse-card" onclick={openBrowser} disabled={validating || success}>
			<span class="browse-icon">
				<Icon name="folder" size={48} strokeWidth={1.5} />
			</span>
			<span class="browse-title">Browse for Project</span>
			<span class="browse-desc">Navigate to find your Beads project folder</span>
		</button>

		<div class="divider">
			<span>or enter path manually</span>
		</div>

		<form onsubmit={handleSubmit}>
			<div class="input-group">
				<input
					type="text"
					bind:value={pathInput}
					placeholder="/path/to/your/project"
					class="path-input"
					disabled={validating || success}
				/>
				<button type="submit" class="submit-btn" disabled={validating || success || !pathInput.trim()}>
					{#if validating}
						Validating...
					{:else if success}
						Added!
					{:else}
						Add Project
					{/if}
				</button>
			</div>
		</form>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		{#if success}
			<div class="success-message">Project added successfully! Redirecting...</div>
		{/if}

		<div class="help-text">
			<p>Select any folder - we'll set up Beads for you if it's not already configured.</p>
			<p>Example: <code>/Users/yourname/projects/my-app</code></p>
		</div>
	{/if}
</div>

<style>
	.add-form {
		max-width: 600px;
		margin: 0 auto;
	}

	.browse-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 48px 24px;
		background: #ffffff;
		border: 2px dashed #e0e0e0;
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.browse-card:hover:not(:disabled) {
		border-color: #3b82f6;
		background: #fafafa;
	}

	.browse-card:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.browse-icon {
		color: #cccccc;
	}

	.browse-title {
		font-size: 20px;
		font-weight: 400;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.browse-desc {
		font-size: 14px;
		color: #888888;
	}

	.divider {
		display: flex;
		align-items: center;
		margin: 28px 0;
		color: #888888;
		font-size: 14px;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #eaeaea;
	}

	.divider span {
		padding: 0 16px;
	}

	form {
		margin-bottom: 16px;
	}

	.input-group {
		display: flex;
		gap: 12px;
	}

	.path-input {
		flex: 1;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		border-radius: 12px;
		padding: 14px 18px;
		font-size: 14px;
		color: #1a1a1a;
		font-family: monospace;
		transition: all 0.2s ease;
	}

	.path-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.path-input::placeholder {
		color: #aaaaaa;
	}

	.path-input:disabled {
		opacity: 0.6;
		background: #f5f5f5;
	}

	.submit-btn {
		background: #1a1a1a;
		color: #ffffff;
		border: none;
		padding: 14px 28px;
		border-radius: 24px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		font-family: 'Figtree', sans-serif;
	}

	.submit-btn:hover:not(:disabled) {
		background: #333333;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc3545;
		padding: 14px 18px;
		border-radius: 12px;
		margin-bottom: 16px;
		font-size: 14px;
		white-space: pre-wrap;
	}

	.success-message {
		background: #f0fdf4;
		border: 1px solid #86efac;
		color: #166534;
		padding: 14px 18px;
		border-radius: 12px;
		margin-bottom: 16px;
		font-size: 14px;
	}

	.help-text {
		color: #888888;
		font-size: 13px;
		line-height: 1.6;
	}

	.help-text p {
		margin: 8px 0;
	}

	.help-text code {
		background: #f5f5f5;
		padding: 2px 8px;
		border-radius: 6px;
		font-family: monospace;
		color: #666666;
	}

	/* Init prompt styles */
	.init-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 48px 32px;
		background: #ffffff;
		border: 1px solid #e0e0e0;
		border-radius: 16px;
	}

	.init-icon {
		color: #3b82f6;
		margin-bottom: 16px;
	}

	.init-icon.warning {
		color: #f59e0b;
	}

	.init-prompt h2 {
		margin: 0 0 16px 0;
		font-size: 24px;
		font-weight: 400;
		color: #1a1a1a;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.init-path {
		margin: 0 0 16px 0;
	}

	.init-path code {
		background: #f5f5f5;
		padding: 8px 16px;
		border-radius: 8px;
		font-family: monospace;
		font-size: 13px;
		color: #666666;
		word-break: break-all;
	}

	.init-desc {
		margin: 0 0 8px 0;
		font-size: 15px;
		color: #1a1a1a;
	}

	.init-info {
		margin: 0 0 24px 0;
		font-size: 13px;
		color: #888888;
	}

	.init-info code {
		background: #f5f5f5;
		padding: 2px 6px;
		border-radius: 4px;
		font-family: monospace;
	}

	.init-actions {
		display: flex;
		gap: 12px;
	}

	.cancel-btn {
		background: #ffffff;
		color: #666666;
		border: 1px solid #e0e0e0;
		padding: 12px 24px;
		border-radius: 24px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.cancel-btn:hover:not(:disabled) {
		background: #f5f5f5;
		border-color: #cccccc;
	}

	.cancel-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.init-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #3b82f6;
		color: #ffffff;
		border: none;
		padding: 12px 24px;
		border-radius: 24px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: 'Figtree', sans-serif;
	}

	.init-btn:hover:not(:disabled) {
		background: #2563eb;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.init-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.init-btn :global(.icon) {
		flex-shrink: 0;
	}

	.init-prompt .error-message {
		margin-top: 16px;
		width: 100%;
	}

	/* Install instructions */
	.install-instructions {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 20px 24px;
		margin: 16px 0 24px 0;
		text-align: left;
		width: 100%;
	}

	.install-instructions p {
		margin: 0 0 12px 0;
		font-size: 14px;
		color: #475569;
	}

	.install-instructions p:last-child {
		margin-bottom: 0;
	}

	.install-command {
		display: block;
		background: #1e293b;
		color: #e2e8f0;
		padding: 12px 16px;
		border-radius: 8px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 14px;
		margin-bottom: 12px;
		user-select: all;
	}

	.install-note {
		font-size: 13px !important;
		color: #64748b !important;
	}

	.install-note a {
		color: #3b82f6;
		text-decoration: none;
	}

	.install-note a:hover {
		text-decoration: underline;
	}
</style>
