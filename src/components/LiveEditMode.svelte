<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';
	import DevServerPreview from './DevServerPreview.svelte';
	import DevServerStatus from './DevServerStatus.svelte';
	import DevServerSetupModal from './DevServerSetupModal.svelte';
	import PortConflictModal from './PortConflictModal.svelte';
	import ChatSheet from './ChatSheet.svelte';
	import type { Agent } from '$lib/types';

	interface PortConflictInfo {
		port: number;
		pid?: number;
		processName?: string;
		command?: string;
	}

	interface DevServerConfig {
		framework: string;
		devCommand: string;
		defaultPort: number;
		hotReloadSupported: boolean;
		detectedAt: string;
		previewUrl?: string;
	}

	interface ElementSelectionData {
		selector: string;
		tagName: string;
		id: string | null;
		className: string | null;
		text: string | null;
		rect: { x: number; y: number; width: number; height: number };
		styles: Record<string, string>;
	}

	interface Props {
		isOpen: boolean;
		projectId: string;
		projectName: string;
		agent?: Agent | null;
		onclose: () => void;
	}

	let { isOpen, projectId, projectName, agent = null, onclose }: Props = $props();

	// Electron detection
	const isElectron = browser && typeof window !== 'undefined' && window.electronAPI?.isElectron;

	// Animation state
	let visible = $state(false);
	let animating = $state(false);

	// Server state
	let config = $state<DevServerConfig | null>(null);
	let serverStatus = $state<'stopped' | 'starting' | 'running' | 'error'>('stopped');
	let serverReady = $state(false);
	let serverError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let eventSource: EventSource | null = null;

	// UI state
	let showSetupModal = $state(false);
	let showPortConflictModal = $state(false);
	let portConflictInfo = $state<PortConflictInfo | null>(null);
	let chatWidth = $state(450);
	let isResizing = $state(false);
	let isLoadingConfig = $state(false); // Guard against double-loading

	// Chat layout mode: 'docked' = side-by-side, 'floating' = overlay
	let chatLayoutMode = $state<'docked' | 'floating'>('docked');
	let chatVisible = $state(true); // Only used in floating mode

	// Electron-specific features
	let currentNavigationUrl = $state<string | null>(null);
	let inspectorEnabled = $state(false);
	let devToolsOpen = $state(false);
	let selectedElement = $state<ElementSelectionData | null>(null);

	// Framework display info
	const FRAMEWORK_NAMES: Record<string, string> = {
		nextjs: 'Next.js',
		sveltekit: 'SvelteKit',
		vite: 'Vite',
		remix: 'Remix',
		astro: 'Astro',
		nuxt: 'Nuxt',
		gatsby: 'Gatsby',
		expo: 'Expo',
		shopify: 'Shopify Theme',
		cra: 'Create React App'
	};

	// Track if we've already initialized for this open cycle
	let hasInitialized = $state(false);

	$effect(() => {
		if (isOpen && !hasInitialized) {
			hasInitialized = true;
			visible = true;
			requestAnimationFrame(() => {
				animating = true;
			});
			// Load config on open
			if (browser) {
				loadConfig();
			}
		} else if (!isOpen && visible) {
			hasInitialized = false;
			animating = false;
			setTimeout(() => {
				visible = false;
				cleanup();
			}, 300);
		}
	});

	function cleanup() {
		console.log('[LiveEditMode] Cleanup');
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		serverStatus = 'stopped';
		serverReady = false;
		serverError = null;
		previewUrl = null;
		showPortConflictModal = false;
		portConflictInfo = null;
		isLoadingConfig = false;
		isConnectingToStream = false;
		config = null;
	}

	async function loadConfig() {
		// Guard against double-loading
		if (isLoadingConfig) {
			console.log('[LiveEditMode] Already loading config, skipping');
			return;
		}
		isLoadingConfig = true;

		try {
			console.log('[LiveEditMode] Loading config for project:', projectId);
			const response = await fetch(`/api/projects/${projectId}/dev-config`);
			const data = await response.json();

			if (data.hasConfig && data.config) {
				console.log('[LiveEditMode] Config loaded:', data.config);
				config = data.config;
				// Check server status and start if not running
				await checkAndStartServer();
			} else {
				console.log('[LiveEditMode] No config found, showing setup modal');
				// Show setup modal
				showSetupModal = true;
			}
		} catch (error) {
			console.error('[LiveEditMode] Error loading dev config:', error);
			showSetupModal = true;
		} finally {
			isLoadingConfig = false;
		}
	}

	async function checkAndStartServer() {
		if (!config) return;

		try {
			// Check current status
			const statusResponse = await fetch(`/api/projects/${projectId}/dev-server/status`);
			const statusData = await statusResponse.json();

			if (statusData.status?.running) {
				serverStatus = 'running';
				serverReady = statusData.status.ready;
				previewUrl = statusData.previewUrl;
				connectToStream();
			} else {
				await startServer();
			}
		} catch (error) {
			console.error('Error checking server status:', error);
			await startServer();
		}
	}

	async function startServer(overridePort?: number) {
		if (!config) {
			console.error('[LiveEditMode] Cannot start server: no config');
			return;
		}

		console.log('[LiveEditMode] Starting server with config:', config, 'overridePort:', overridePort);
		serverStatus = 'starting';
		serverError = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/dev-server/start`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(overridePort ? { port: overridePort } : {})
			});

			const data = await response.json();
			console.log('[LiveEditMode] Start server response:', data);

			// Handle port conflict (409 status)
			if (response.status === 409 && data.portConflict) {
				console.log('[LiveEditMode] Port conflict detected:', data.portConflict);
				serverStatus = 'stopped';
				portConflictInfo = data.portConflict;
				showPortConflictModal = true;
				return;
			}

			if (data.success) {
				// Set status to running immediately since server process has started
				serverStatus = 'running';
				// Set ready state from response if available
				serverReady = data.status?.ready ?? false;
				previewUrl = data.previewUrl;
				console.log('[LiveEditMode] Server started, previewUrl:', previewUrl, 'ready:', serverReady);
				connectToStream();
			} else {
				serverStatus = 'error';
				serverError = data.error || 'Failed to start server';
				console.error('[LiveEditMode] Start server error:', serverError);
			}
		} catch (error) {
			serverStatus = 'error';
			serverError = error instanceof Error ? error.message : 'Failed to start server';
			console.error('[LiveEditMode] Start server exception:', error);
		}
	}

	async function stopServer() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		try {
			await fetch(`/api/projects/${projectId}/dev-server/stop`, {
				method: 'POST'
			});
		} catch (error) {
			console.error('Error stopping server:', error);
		}

		serverStatus = 'stopped';
		serverReady = false;
	}

	async function handlePortConflictResolve(action: 'kill' | 'random' | 'custom', port?: number) {
		if (!portConflictInfo) {
			console.error('[LiveEditMode] handlePortConflictResolve called but no portConflictInfo');
			return;
		}

		console.log('[LiveEditMode] Resolving port conflict:', action, 'port:', port, 'conflictInfo:', portConflictInfo);

		try {
			if (action === 'kill') {
				console.log('[LiveEditMode] Killing process on port', portConflictInfo.port);

				// Kill the process on the port
				const killResponse = await fetch(`/api/projects/${projectId}/dev-server/kill-port`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ port: portConflictInfo.port, action: 'kill' })
				});

				console.log('[LiveEditMode] Kill response status:', killResponse.status);
				const killData = await killResponse.json();
				console.log('[LiveEditMode] Kill response data:', killData);

				if (!killData.success) {
					console.error('[LiveEditMode] Kill failed:', killData.error);
					serverStatus = 'error';
					serverError = killData.error || 'Failed to kill process';
					showPortConflictModal = false;
					portConflictInfo = null;
					return;
				}

				console.log('[LiveEditMode] Kill succeeded, waiting for port to be fully released');
				// Wait a bit for the OS to fully release the port
				await new Promise(resolve => setTimeout(resolve, 1000));
				console.log('[LiveEditMode] Starting server');
				// Now try to start on the original port
				showPortConflictModal = false;
				portConflictInfo = null;
				await startServer();

			} else if (action === 'random') {
				console.log('[LiveEditMode] Finding available port');

				// Find an available port
				const findResponse = await fetch(`/api/projects/${projectId}/dev-server/kill-port`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ port: portConflictInfo.port, action: 'find-available' })
				});

				console.log('[LiveEditMode] Find response status:', findResponse.status);
				const findData = await findResponse.json();
				console.log('[LiveEditMode] Find response data:', findData);

				if (!findData.success || !findData.port) {
					console.error('[LiveEditMode] Find available port failed:', findData.error);
					serverStatus = 'error';
					serverError = findData.error || 'Could not find available port';
					showPortConflictModal = false;
					portConflictInfo = null;
					return;
				}

				console.log('[LiveEditMode] Found port', findData.port, ', starting server');
				// Start on the found port
				showPortConflictModal = false;
				portConflictInfo = null;
				await startServer(findData.port);

			} else if (action === 'custom' && port) {
				console.log('[LiveEditMode] Using custom port:', port);
				// Use the custom port
				showPortConflictModal = false;
				portConflictInfo = null;
				await startServer(port);
			}
		} catch (error) {
			console.error('[LiveEditMode] Error resolving port conflict:', error);
			serverStatus = 'error';
			serverError = error instanceof Error ? error.message : 'Failed to resolve port conflict';
			showPortConflictModal = false;
			portConflictInfo = null;
		}
	}

	function handlePortConflictCancel() {
		showPortConflictModal = false;
		portConflictInfo = null;
	}

	let isConnectingToStream = false;

	function connectToStream() {
		// Prevent multiple simultaneous connections
		if (isConnectingToStream) {
			console.log('[LiveEditMode] Already connecting to stream, skipping');
			return;
		}

		if (eventSource) {
			console.log('[LiveEditMode] Closing existing EventSource');
			eventSource.close();
			eventSource = null;
		}

		isConnectingToStream = true;
		console.log('[LiveEditMode] Connecting to stream');

		eventSource = new EventSource(`/api/projects/${projectId}/dev-server/stream`);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				handleStreamEvent(data);
			} catch (error) {
				console.error('Error parsing stream event:', error);
			}
		};

		eventSource.onopen = () => {
			console.log('[LiveEditMode] Stream connected');
			isConnectingToStream = false;
		};

		eventSource.onerror = () => {
			console.log('[LiveEditMode] Stream error');
			isConnectingToStream = false;
			// Only try to reconnect if still open and running
			if (isOpen && serverStatus === 'running' && !eventSource) {
				setTimeout(() => {
					if (isOpen && serverStatus === 'running') {
						connectToStream();
					}
				}, 3000);
			}
		};
	}

	function handleStreamEvent(data: { type: string; [key: string]: unknown }) {
		// Log all events except output (too noisy)
		if (data.type !== 'output' && data.type !== 'heartbeat') {
			console.log('[LiveEditMode] Stream event:', data.type, data);
		}

		switch (data.type) {
			case 'init':
				if ((data.status as { running?: boolean; ready?: boolean })?.running) {
					serverStatus = 'running';
					serverReady = (data.status as { ready?: boolean }).ready ?? false;
					console.log('[LiveEditMode] Init event - status: running, ready:', serverReady);
				}
				if (data.previewUrl) {
					previewUrl = data.previewUrl as string;
				}
				break;
			case 'ready':
				console.log('[LiveEditMode] Ready event received!');
				serverStatus = 'running';
				serverReady = true;
				if (data.previewUrl) {
					previewUrl = data.previewUrl as string;
				}
				break;
			case 'preview-url':
				// For Shopify, ignore the preview-url event - we need to use localhost
				// because the Shopify store URL has CSP headers that block embedding
				if (data.previewUrl && config?.framework !== 'shopify') {
					previewUrl = data.previewUrl as string;
				}
				break;
			case 'exit':
				serverStatus = 'stopped';
				serverReady = false;
				break;
			case 'error':
				serverStatus = 'error';
				serverError = data.message as string || 'Server error';
				break;
		}
	}

	async function handleSetupSave(newConfig: DevServerConfig) {
		// Save config to database first
		try {
			const response = await fetch(`/api/projects/${projectId}/dev-config`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newConfig)
			});

			if (!response.ok) {
				console.error('[LiveEditMode] Failed to save config:', await response.text());
				return;
			}
		} catch (error) {
			console.error('[LiveEditMode] Error saving config:', error);
			return;
		}

		config = newConfig;
		showSetupModal = false;
		startServer();
	}

	function handleSetupClose() {
		showSetupModal = false;
		if (!config) {
			onclose();
		}
	}

	async function handleOpenInBrowser() {
		// Compute the URL to open - use previewUrl if set, otherwise construct from config
		const urlToOpen = previewUrl || (config ? `http://localhost:${config.defaultPort}` : null);
		if (!urlToOpen) {
			console.error('[LiveEditMode] No URL to open');
			return;
		}

		console.log('[LiveEditMode] Opening in browser:', urlToOpen);

		// Use window.open for both Electron and browser environments
		// Electron will handle this via shell.openExternal
		window.open(urlToOpen, '_blank');
	}

	function handleRefresh() {
		// Force iframe to reload by toggling the URL
		const currentUrl = previewUrl;
		previewUrl = null;
		requestAnimationFrame(() => {
			previewUrl = currentUrl;
		});
	}

	// Resize handlers
	function startResize(e: MouseEvent) {
		e.preventDefault();
		isResizing = true;
		document.addEventListener('mousemove', handleResize);
		document.addEventListener('mouseup', stopResize);
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	function handleResize(e: MouseEvent) {
		if (!isResizing) return;
		const newWidth = window.innerWidth - e.clientX;
		chatWidth = Math.min(800, Math.max(350, newWidth));
	}

	function stopResize() {
		isResizing = false;
		document.removeEventListener('mousemove', handleResize);
		document.removeEventListener('mouseup', stopResize);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	function handleClose() {
		stopServer();
		onclose();
	}

	// Electron-specific handlers
	function handleUrlChanged(url: string) {
		currentNavigationUrl = url;
	}

	function handleElementSelected(data: ElementSelectionData) {
		selectedElement = data;
		inspectorEnabled = false;
		console.log('Element selected:', data);
	}

	function handleInspectorCancelled() {
		inspectorEnabled = false;
		console.log('Inspector cancelled');
	}

	function copyCurrentUrl() {
		const urlToCopy = currentNavigationUrl || previewUrl;
		if (urlToCopy) {
			navigator.clipboard.writeText(urlToCopy);
		}
	}

	// Chat input ref for programmatic input setting
	let chatInputRef = $state<{ setInput: (text: string) => void } | null>(null);

	function useInChat() {
		if (!selectedElement) return;

		const displayUrl = currentNavigationUrl || previewUrl || 'the current page';
		const context = `I want to edit this element on the page at ${displayUrl}:

Element: <${selectedElement.tagName}>
Selector: ${selectedElement.selector}
${selectedElement.text ? `Text: "${selectedElement.text.slice(0, 100)}${selectedElement.text.length > 100 ? '...' : ''}"` : ''}

Please help me `;

		// Set the text in the chat input
		chatInputRef?.setInput(context);
	}

	function handleChatInputRef(ref: { setInput: (text: string) => void }) {
		chatInputRef = ref;
	}

	async function toggleDevTools() {
		if (!isElectron) return;

		if (devToolsOpen) {
			await window.electronAPI?.closeDevTools();
			devToolsOpen = false;
		} else {
			await window.electronAPI?.openDevTools();
			devToolsOpen = true;
		}
	}

	async function toggleInspector() {
		if (!isElectron) return;

		if (inspectorEnabled) {
			await window.electronAPI?.disableInspector();
			inspectorEnabled = false;
		} else {
			await window.electronAPI?.enableInspector();
			inspectorEnabled = true;
		}
	}

	function clearSelectedElement() {
		selectedElement = null;
	}

	function copySelector() {
		if (selectedElement?.selector) {
			navigator.clipboard.writeText(selectedElement.selector);
		}
	}
</script>

{#if visible}
	<div class="live-edit-overlay" class:open={animating}>
		<div class="live-edit-container" class:open={animating}>
			<!-- Header -->
			<header class="live-edit-header">
				<div class="header-left">
					<button class="back-btn" onclick={handleClose}>
						<Icon name="arrow-left" size={18} />
						<span>Back</span>
					</button>
					<div class="project-info">
						<span class="project-name">{projectName}</span>
						<span class="mode-badge">Live Edit</span>
					</div>
				</div>
				<div class="header-actions">
					{#if serverStatus === 'running'}
						<button class="action-btn stop" onclick={stopServer}>
							<Icon name="square" size={16} />
							<span>Stop Server</span>
						</button>
					{:else if serverStatus === 'stopped'}
						<button class="action-btn start" onclick={startServer} disabled={!config}>
							<Icon name="play" size={16} />
							<span>Start Server</span>
						</button>
					{/if}
					<button class="action-btn" onclick={handleRefresh} disabled={!serverReady}>
						<Icon name="refresh-cw" size={16} />
					</button>

					<!-- Electron-only: DevTools and Inspector buttons -->
					{#if isElectron}
						<button
							class="action-btn"
							class:active={devToolsOpen}
							onclick={toggleDevTools}
							disabled={!serverReady}
							title="Open DevTools for preview"
						>
							<Icon name="code" size={16} />
							<span>DevTools</span>
						</button>
						<button
							class="action-btn"
							class:active={inspectorEnabled}
							onclick={toggleInspector}
							disabled={!serverReady}
							title="Click to select an element"
						>
							<Icon name="crosshair" size={16} />
							<span>Inspect</span>
						</button>
					{/if}

					<button class="action-btn settings" onclick={() => showSetupModal = true}>
						<Icon name="settings" size={16} />
					</button>

					<!-- Chat layout toggle -->
					<div class="chat-controls">
						<button
							class="action-btn layout-toggle"
							class:active={chatLayoutMode === 'floating'}
							onclick={() => chatLayoutMode = chatLayoutMode === 'docked' ? 'floating' : 'docked'}
							title={chatLayoutMode === 'docked' ? 'Switch to floating chat' : 'Switch to docked chat'}
						>
							<Icon name={chatLayoutMode === 'docked' ? 'layers' : 'sidebar'} size={16} />
						</button>
					</div>

					<button class="close-btn" onclick={handleClose}>
						<Icon name="x" size={20} />
					</button>
				</div>
			</header>

			<!-- URL Bar (Electron only) -->
			{#if isElectron && serverReady}
				<div class="url-bar">
					<Icon name="globe" size={14} />
					<span class="url-text">{currentNavigationUrl || previewUrl || 'No URL'}</span>
					<button class="copy-url-btn" onclick={copyCurrentUrl} title="Copy URL">
						<Icon name="copy" size={14} />
					</button>
				</div>
			{/if}

			<!-- Selected Element Panel -->
			{#if selectedElement}
				<div class="element-panel">
					<div class="element-header">
						<span class="element-tag">&lt;{selectedElement.tagName}&gt;</span>
						<div class="element-actions">
							<button class="element-action-btn" onclick={useInChat} title="Use in chat">
								<Icon name="message-square" size={14} />
								<span>Use in Chat</span>
							</button>
							<button class="element-action-btn" onclick={copySelector} title="Copy selector">
								<Icon name="copy" size={14} />
							</button>
							<button class="element-action-btn close" onclick={clearSelectedElement} title="Clear">
								<Icon name="x" size={14} />
							</button>
						</div>
					</div>
					<code class="element-selector">{selectedElement.selector}</code>
					{#if selectedElement.text}
						<p class="element-text-preview">"{selectedElement.text.slice(0, 80)}{selectedElement.text.length > 80 ? '...' : ''}"</p>
					{/if}
				</div>
			{/if}

			<!-- Main content -->
			<div class="live-edit-content" class:resizing={isResizing} class:floating-chat={chatLayoutMode === 'floating'}>
				<!-- Preview pane -->
				<div class="preview-pane">
					<DevServerPreview
						url={previewUrl || ''}
						isReady={serverReady}
						isLoading={serverStatus === 'starting'}
						error={serverError || undefined}
						onRefresh={handleRefresh}
						onUrlChanged={handleUrlChanged}
						onElementSelected={handleElementSelected}
						onInspectorCancelled={handleInspectorCancelled}
					/>
				</div>

				<!-- Resize handle (docked mode only) -->
				{#if chatLayoutMode === 'docked'}
					<div
						class="resize-handle"
						onmousedown={startResize}
						role="separator"
						aria-orientation="vertical"
					></div>
				{/if}

				<!-- Single ChatSheet instance - container changes based on mode -->
				<div
					class="chat-pane-wrapper"
					class:docked={chatLayoutMode === 'docked'}
					class:floating={chatLayoutMode === 'floating'}
					class:hidden={chatLayoutMode === 'floating' && !chatVisible}
					style="width: {chatWidth}px"
				>
					{#if chatLayoutMode === 'floating'}
						<button
							class="floating-collapse-btn"
							onclick={() => chatVisible = false}
							title="Collapse chat"
						>
							<Icon name="chevron-right" size={16} />
						</button>
						<div class="floating-resize-handle" onmousedown={startResize} role="separator"></div>
					{/if}
					<ChatSheet
						isOpen={true}
						onclose={() => chatLayoutMode === 'floating' ? chatVisible = false : null}
						{projectId}
						{agent}
						embedded={true}
						livePreviewUrl={previewUrl}
						{selectedElement}
						{currentNavigationUrl}
						onInputRef={handleChatInputRef}
					/>
				</div>

				<!-- Collapsed chat tab (floating mode only) -->
				{#if chatLayoutMode === 'floating' && !chatVisible}
					<button
						class="floating-expand-btn"
						onclick={() => chatVisible = true}
						title="Open chat"
					>
						<Icon name="message-square" size={18} />
						<Icon name="chevron-left" size={14} />
					</button>
				{/if}
			</div>

			<!-- Status bar -->
			<DevServerStatus
				status={serverStatus}
				port={config?.defaultPort}
				framework={config?.framework}
				frameworkDisplayName={config?.framework ? FRAMEWORK_NAMES[config.framework] : undefined}
				error={serverError || undefined}
				onOpenInBrowser={handleOpenInBrowser}
			/>
		</div>
	</div>

	<!-- Setup Modal -->
	<DevServerSetupModal
		isOpen={showSetupModal}
		{projectId}
		onclose={handleSetupClose}
		onsave={handleSetupSave}
	/>

	<!-- Port Conflict Modal -->
	{#if portConflictInfo}
		<PortConflictModal
			isOpen={showPortConflictModal}
			conflictInfo={portConflictInfo}
			onResolve={handlePortConflictResolve}
			onCancel={handlePortConflictCancel}
		/>
	{/if}
{/if}

<style>
	.live-edit-overlay {
		position: fixed;
		inset: 0;
		background: #111827;
		z-index: 1000;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.live-edit-overlay.open {
		opacity: 1;
		pointer-events: auto;
	}

	.live-edit-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		transform: scale(0.98);
		opacity: 0;
		transition: transform 0.3s ease, opacity 0.3s ease;
	}

	.live-edit-container.open {
		transform: scale(1);
		opacity: 1;
	}

	.live-edit-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		background: #1f2937;
		border-bottom: 1px solid #374151;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 20px;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: transparent;
		border: 1px solid #4b5563;
		border-radius: 8px;
		color: #d1d5db;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.back-btn:hover {
		background: #374151;
		border-color: #6b7280;
		color: #ffffff;
	}

	.project-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.project-name {
		font-size: 16px;
		font-weight: 600;
		color: #f9fafb;
	}

	.mode-badge {
		padding: 4px 10px;
		background: rgba(139, 92, 246, 0.2);
		border: 1px solid rgba(139, 92, 246, 0.4);
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #c4b5fd;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: transparent;
		border: 1px solid #4b5563;
		border-radius: 8px;
		color: #d1d5db;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.action-btn:hover:not(:disabled) {
		background: #374151;
		border-color: #6b7280;
		color: #ffffff;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.stop {
		border-color: rgba(239, 68, 68, 0.5);
		color: #fca5a5;
	}

	.action-btn.stop:hover {
		background: rgba(239, 68, 68, 0.15);
		border-color: #ef4444;
		color: #fca5a5;
	}

	.action-btn.start {
		border-color: rgba(34, 197, 94, 0.5);
		color: #86efac;
	}

	.action-btn.start:hover:not(:disabled) {
		background: rgba(34, 197, 94, 0.15);
		border-color: #22c55e;
		color: #86efac;
	}

	.action-btn.active {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
		color: #93c5fd;
	}

	.action-btn.active:hover:not(:disabled) {
		background: rgba(59, 130, 246, 0.3);
		border-color: rgba(59, 130, 246, 0.7);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: 1px solid #4b5563;
		border-radius: 8px;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-left: 8px;
	}

	.close-btn:hover {
		background: #374151;
		border-color: #6b7280;
		color: #ffffff;
	}

	.live-edit-content {
		flex: 1;
		display: flex;
		min-height: 0;
		overflow: hidden;
	}

	.preview-pane {
		flex: 1;
		min-width: 400px;
		display: flex;
		flex-direction: column;
		background: #0f0f0f;
	}

	/* Disable pointer events on preview during resize to prevent iframe from capturing mouse */
	.live-edit-content.resizing .preview-pane {
		pointer-events: none;
	}

	.resize-handle {
		width: 6px;
		background: #374151;
		cursor: ew-resize;
		transition: background 0.15s ease;
		flex-shrink: 0;
	}

	.resize-handle:hover {
		background: #4b5563;
	}

	/* Unified chat pane wrapper - switches between docked and floating via classes */
	.chat-pane-wrapper {
		min-width: 350px;
		max-width: 800px;
		display: flex;
		flex-direction: column;
	}

	/* Docked mode - side-by-side layout */
	.chat-pane-wrapper.docked {
		flex-shrink: 0;
		background: #f9fafb;
		overflow: hidden;
	}

	/* Floating mode - overlay on preview */
	.chat-pane-wrapper.floating {
		position: absolute;
		top: 16px;
		right: 16px;
		bottom: 16px;
		background: #ffffff;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
		z-index: 10;
	}

	/* Hidden state for floating mode collapse */
	.chat-pane-wrapper.hidden {
		display: none;
	}

	/* Override ChatSheet styles when embedded */
	.chat-pane-wrapper :global(.sheet-overlay) {
		position: relative !important;
		background: transparent !important;
		opacity: 1 !important;
		pointer-events: auto !important;
	}

	.chat-pane-wrapper :global(.chat-sheet) {
		position: relative !important;
		transform: none !important;
		width: 100% !important;
		max-width: 100% !important;
		height: 100% !important;
		box-shadow: none !important;
	}

	.chat-pane-wrapper.floating :global(.chat-sheet) {
		border-radius: 12px !important;
	}

	.chat-pane-wrapper :global(.resize-handle) {
		display: none !important;
	}

	/* Chat controls in header */
	.chat-controls {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 8px;
		padding-left: 12px;
		border-left: 1px solid #374151;
	}

	.action-btn.layout-toggle {
		padding: 8px 10px;
	}

	.action-btn.active {
		background: rgba(139, 92, 246, 0.2);
		border-color: rgba(139, 92, 246, 0.5);
		color: #c4b5fd;
	}

	.action-btn.active:hover {
		background: rgba(139, 92, 246, 0.3);
		border-color: rgba(139, 92, 246, 0.7);
	}

	/* Floating chat mode - preview takes full width */
	.live-edit-content.floating-chat {
		position: relative;
	}

	.live-edit-content.floating-chat .preview-pane {
		width: 100%;
	}

	.floating-collapse-btn {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: 2px solid #ffffff;
		border-radius: 50%;
		color: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 11;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
	}

	.floating-collapse-btn:hover {
		transform: translate(-50%, -50%) scale(1.1);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
	}

	.floating-expand-btn {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 14px 10px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 12px 0 0 12px;
		color: #ffffff;
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 10;
		box-shadow: -2px 0 16px rgba(102, 126, 234, 0.3);
	}

	.floating-expand-btn:hover {
		padding-right: 14px;
		box-shadow: -4px 0 20px rgba(102, 126, 234, 0.4);
	}

	.floating-resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 8px;
		cursor: ew-resize;
		background: transparent;
		transition: background 0.15s ease;
		z-index: 1;
	}

	.floating-resize-handle:hover {
		background: rgba(139, 92, 246, 0.3);
	}

	/* Disable pointer events on preview during resize in floating mode too */
	.live-edit-content.floating-chat.resizing .preview-pane {
		pointer-events: none;
	}

	/* URL Bar */
	.url-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 20px;
		background: #1a1a2e;
		border-bottom: 1px solid #374151;
		color: #9ca3af;
		font-size: 13px;
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.url-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #d1d5db;
	}

	.copy-url-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.copy-url-btn:hover {
		background: #374151;
		border-color: #4b5563;
		color: #d1d5db;
	}

	/* Element Panel */
	.element-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 20px;
		background: #fef3c7;
		border-bottom: 1px solid #fcd34d;
	}

	.element-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.element-tag {
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 14px;
		font-weight: 600;
		color: #92400e;
	}

	.element-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.element-action-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		background: #ffffff;
		border: 1px solid #fcd34d;
		border-radius: 6px;
		color: #92400e;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: 'Figtree', sans-serif;
	}

	.element-action-btn:hover {
		background: #fef9c3;
		border-color: #f59e0b;
	}

	.element-action-btn.close {
		padding: 6px;
		background: transparent;
		border-color: transparent;
	}

	.element-action-btn.close:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #dc2626;
	}

	.element-selector {
		padding: 8px 12px;
		background: #ffffff;
		border: 1px solid #fcd34d;
		border-radius: 6px;
		font-family: 'SF Mono', 'Consolas', monospace;
		font-size: 12px;
		color: #78350f;
		word-break: break-all;
	}

	.element-text-preview {
		margin: 0;
		font-size: 12px;
		color: #a16207;
		font-style: italic;
	}
</style>
