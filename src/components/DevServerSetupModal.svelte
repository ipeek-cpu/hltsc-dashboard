<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';

	interface DevServerConfig {
		framework: string;
		devCommand: string;
		defaultPort: number;
		hotReloadSupported: boolean;
		detectedAt: string;
		previewUrl?: string;
	}

	interface FrameworkInfo {
		displayName: string;
		hotReloadSupported: boolean;
	}

	interface Props {
		isOpen: boolean;
		projectId: string;
		onclose: () => void;
		onsave: (config: DevServerConfig) => void;
	}

	let { isOpen, projectId, onclose, onsave }: Props = $props();

	let visible = $state(false);
	let animating = $state(false);

	// Claude initialization state
	let checkingClaudeInit = $state(false);
	let claudeInitialized = $state<boolean | null>(null);
	let initializing = $state(false);
	let initError = $state<string | null>(null);

	// Detection state
	let detecting = $state(false);
	let detected = $state(false);
	let detectionError = $state<string | null>(null);
	let frameworkInfo = $state<FrameworkInfo | null>(null);

	// Form state
	let framework = $state('');
	let devCommand = $state('npm run dev');
	let defaultPort = $state(3000);

	// Shopify store URL state
	let needsStoreUrl = $state(false);
	let storeUrl = $state('');

	const FRAMEWORKS = [
		{ value: 'nextjs', label: 'Next.js', port: 3000 },
		{ value: 'sveltekit', label: 'SvelteKit', port: 5173 },
		{ value: 'vite', label: 'Vite', port: 5173 },
		{ value: 'remix', label: 'Remix', port: 3000 },
		{ value: 'astro', label: 'Astro', port: 4321 },
		{ value: 'nuxt', label: 'Nuxt', port: 3000 },
		{ value: 'gatsby', label: 'Gatsby', port: 8000 },
		{ value: 'expo', label: 'Expo', port: 8081 },
		{ value: 'shopify', label: 'Shopify Theme', port: 9292 },
		{ value: 'cra', label: 'Create React App', port: 3000 },
		{ value: 'angular', label: 'Angular', port: 4200 },
		{ value: 'vue', label: 'Vue', port: 5173 },
		{ value: 'other', label: 'Other', port: 3000 }
	];

	$effect(() => {
		if (isOpen) {
			visible = true;
			requestAnimationFrame(() => {
				animating = true;
			});
			// Check Claude init status first
			if (claudeInitialized === null && browser) {
				checkClaudeInitStatus();
			}
		} else if (visible) {
			animating = false;
			setTimeout(() => {
				visible = false;
				resetState();
			}, 300);
		}
	});

	function resetState() {
		checkingClaudeInit = false;
		claudeInitialized = null;
		initializing = false;
		initError = null;
		detecting = false;
		detected = false;
		detectionError = null;
		frameworkInfo = null;
		framework = '';
		devCommand = 'npm run dev';
		defaultPort = 3000;
		needsStoreUrl = false;
		storeUrl = '';
	}

	async function checkClaudeInitStatus() {
		checkingClaudeInit = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/claude-status`);
			const data = await response.json();
			claudeInitialized = data.initialized;

			// If Claude is initialized, proceed to detection
			if (data.initialized && !detected) {
				detectFramework();
			}
		} catch (error) {
			console.error('Failed to check Claude init status:', error);
			// Assume not initialized on error
			claudeInitialized = false;
		} finally {
			checkingClaudeInit = false;
		}
	}

	async function initializeClaude() {
		initializing = true;
		initError = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/claude-init`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to initialize Claude');
			}

			// Read the SSE stream for init progress
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.slice(6));
							if (data.type === 'done') {
								// Initialization complete
								claudeInitialized = true;
								// Now detect framework
								detectFramework();
								return;
							} else if (data.type === 'error') {
								throw new Error(data.content || 'Initialization failed');
							}
						} catch (e) {
							// Ignore JSON parse errors for partial data
						}
					}
				}
			}

			// If we get here without a 'done' event, assume success
			claudeInitialized = true;
			detectFramework();
		} catch (error) {
			console.error('Failed to initialize Claude:', error);
			initError = error instanceof Error ? error.message : 'Initialization failed';
		} finally {
			initializing = false;
		}
	}

	async function detectFramework() {
		detecting = true;
		detectionError = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/dev-config/detect`, {
				method: 'POST'
			});

			const data = await response.json();

			if (data.detected && data.config) {
				detected = true;
				framework = data.config.framework;
				devCommand = data.config.devCommand;
				defaultPort = data.config.defaultPort;
				frameworkInfo = data.frameworkInfo;
				needsStoreUrl = data.needsStoreUrl || false;
			} else {
				detectionError = data.message || 'Could not auto-detect framework';
			}
		} catch (error) {
			detectionError = 'Failed to detect framework';
		} finally {
			detecting = false;
		}
	}

	function handleFrameworkChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		framework = select.value;
		// Update default port when framework changes
		const fw = FRAMEWORKS.find(f => f.value === framework);
		if (fw) {
			defaultPort = fw.port;
		}
	}

	function handleSave() {
		if (!framework) return;

		// If store URL is needed and provided, add it to the dev command
		let finalDevCommand = devCommand;
		if (needsStoreUrl && storeUrl) {
			// Clean up the store URL (remove https:// if present, ensure .myshopify.com)
			let cleanStoreUrl = storeUrl.trim();
			cleanStoreUrl = cleanStoreUrl.replace(/^https?:\/\//, '');
			if (!cleanStoreUrl.includes('.myshopify.com')) {
				cleanStoreUrl = `${cleanStoreUrl}.myshopify.com`;
			}
			finalDevCommand = `${devCommand} --store=${cleanStoreUrl}`;
		}

		const config: DevServerConfig = {
			framework,
			devCommand: finalDevCommand,
			defaultPort,
			hotReloadSupported: true,
			detectedAt: new Date().toISOString()
		};

		onsave(config);
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}
</script>

{#if visible}
	<div class="modal-overlay" class:open={animating} onclick={handleBackdropClick} role="presentation">
		<div class="modal" class:open={animating}>
			<div class="modal-header">
				<h2>Configure Dev Server</h2>
				<button class="close-btn" onclick={onclose}>
					<Icon name="x" size={20} />
				</button>
			</div>

			<div class="modal-content">
				{#if checkingClaudeInit}
					<div class="detecting-state">
						<Icon name="loader" size={32} />
						<p>Checking Claude status...</p>
					</div>
				{:else if claudeInitialized === false && !initializing}
					<div class="init-required-state">
						<div class="init-icon">
							<Icon name="alert-triangle" size={48} />
						</div>
						<h3>Claude Code Not Initialized</h3>
						<p>Claude Code must be initialized in this project before we can detect your dev server configuration.</p>
						{#if initError}
							<div class="init-error">
								<Icon name="alert-circle" size={16} />
								<span>{initError}</span>
							</div>
						{/if}
						<button class="init-btn" onclick={initializeClaude}>
							<Icon name="play" size={16} />
							<span>Initialize Claude Code</span>
						</button>
					</div>
				{:else if initializing}
					<div class="detecting-state">
						<Icon name="loader" size={32} />
						<p>Initializing Claude Code...</p>
						<span class="detecting-hint">This may take a moment</span>
					</div>
				{:else if detecting}
					<div class="detecting-state">
						<Icon name="loader" size={32} />
						<p>Analyzing project with Claude...</p>
						<span class="detecting-hint">This may take a few seconds</span>
					</div>
				{:else}
					{#if detected && frameworkInfo}
						<div class="detection-success">
							<Icon name="check-circle" size={20} />
							<span>Detected <strong>{frameworkInfo.displayName}</strong></span>
						</div>
					{:else if detectionError}
						<div class="detection-error">
							<Icon name="alert-circle" size={16} />
							<span>{detectionError}</span>
							<button class="retry-link" onclick={detectFramework}>Retry detection</button>
						</div>
					{/if}

					<div class="form-group">
						<label for="framework">Framework</label>
						<select
							id="framework"
							value={framework}
							onchange={handleFrameworkChange}
						>
							<option value="">Select a framework...</option>
							{#each FRAMEWORKS as fw}
								<option value={fw.value}>{fw.label}</option>
							{/each}
						</select>
					</div>

					<div class="form-group">
						<label for="devCommand">Dev Command</label>
						<input
							id="devCommand"
							type="text"
							bind:value={devCommand}
							placeholder="npm run dev"
						/>
						<span class="help-text">The command to start the development server</span>
					</div>

					<div class="form-group">
						<label for="port">Port</label>
						<input
							id="port"
							type="number"
							bind:value={defaultPort}
							min="1"
							max="65535"
						/>
						<span class="help-text">The port your dev server runs on</span>
					</div>

					{#if needsStoreUrl}
						<div class="form-group store-url-group">
							<label for="storeUrl">Shopify Store URL <span class="required">*</span></label>
							<input
								id="storeUrl"
								type="text"
								bind:value={storeUrl}
								placeholder="your-store.myshopify.com"
							/>
							<span class="help-text">Your Shopify store URL (e.g., my-store or my-store.myshopify.com)</span>
						</div>
					{/if}
				{/if}
			</div>

			<div class="modal-footer">
				<button class="cancel-btn" onclick={onclose}>Cancel</button>
				{#if claudeInitialized !== false}
					<button
						class="save-btn"
						onclick={handleSave}
						disabled={!framework || detecting || checkingClaudeInit || initializing || (needsStoreUrl && !storeUrl.trim())}
					>
						<Icon name="check" size={16} />
						<span>Save Configuration</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1001;
		opacity: 0;
		transition: opacity 0.2s ease;
		pointer-events: none;
	}

	.modal-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.modal {
		width: 100%;
		max-width: 480px;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
		transform: scale(0.95) translateY(10px);
		transition: transform 0.2s ease;
	}

	.modal.open {
		transform: scale(1) translateY(0);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1f2937;
		font-family: 'Figtree', sans-serif;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: #f3f4f6;
		border-radius: 8px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.modal-content {
		padding: 24px;
	}

	.detecting-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 20px;
		color: #6b7280;
	}

	.detecting-state :global(.icon) {
		animation: spin 1s linear infinite;
		color: #3b82f6;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.detecting-state p {
		margin: 0;
		font-size: 14px;
	}

	.detecting-hint {
		font-size: 12px;
		color: #9ca3af;
	}

	.init-required-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 32px 20px;
		text-align: center;
	}

	.init-icon {
		color: #f59e0b;
	}

	.init-required-state h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1f2937;
	}

	.init-required-state p {
		margin: 0;
		font-size: 14px;
		color: #6b7280;
		max-width: 320px;
		line-height: 1.5;
	}

	.init-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		font-size: 14px;
		color: #dc2626;
	}

	.init-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		background: #3b82f6;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
		margin-top: 8px;
	}

	.init-btn:hover {
		background: #2563eb;
	}

	.detection-success {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: #ecfdf5;
		border: 1px solid #a7f3d0;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 14px;
		color: #059669;
	}

	.detection-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 16px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		margin-bottom: 20px;
		font-size: 14px;
		color: #dc2626;
	}

	.retry-link {
		background: none;
		border: none;
		color: #2563eb;
		cursor: pointer;
		font-size: 14px;
		text-decoration: underline;
		margin-left: auto;
		font-family: 'Figtree', sans-serif;
	}

	.retry-link:hover {
		color: #1d4ed8;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		background: #ffffff;
		color: #1f2937;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.help-text {
		display: block;
		margin-top: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	.required {
		color: #dc2626;
	}

	.store-url-group {
		background: #fefce8;
		border: 1px solid #fef08a;
		border-radius: 8px;
		padding: 16px;
		margin-top: 8px;
	}

	.store-url-group label {
		color: #854d0e;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0 0 12px 12px;
	}

	.cancel-btn {
		padding: 10px 20px;
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.cancel-btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: #3b82f6;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.save-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.save-btn:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}
</style>
