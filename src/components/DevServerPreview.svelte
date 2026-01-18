<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		isReady: boolean;
		isLoading: boolean;
		error?: string;
		onRefresh?: () => void;
		onOpenInBrowser?: () => void;
		onUrlChanged?: (url: string) => void;
		onElementSelected?: (data: ElementSelectionData) => void;
		onInspectorCancelled?: () => void;
		cannotEmbed?: boolean; // For sites with frame-ancestors CSP (e.g., Shopify)
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

	let {
		url,
		isReady,
		isLoading,
		error,
		onRefresh,
		onOpenInBrowser,
		onUrlChanged,
		onElementSelected,
		onInspectorCancelled,
		cannotEmbed = false
	}: Props = $props();

	// Detect if running in Electron
	const isElectron = browser && typeof window !== 'undefined' && window.electronAPI?.isElectron;

	let iframeEl: HTMLIFrameElement | null = $state(null);
	let containerEl: HTMLDivElement | null = $state(null);
	let iframeLoading = $state(true);
	let iframeError = $state(false);
	let currentPreviewUrl = $state<string | null>(null);
	let cleanupFns: (() => void)[] = [];

	function handleIframeLoad() {
		iframeLoading = false;
		iframeError = false;
	}

	function handleIframeError() {
		iframeLoading = false;
		iframeError = true;
	}

	async function refreshPreview() {
		if (isElectron) {
			iframeLoading = true;
			iframeError = false;
			const result = await window.electronAPI?.refreshPreview();
			if (result?.success) {
				setTimeout(() => {
					iframeLoading = false;
				}, 500);
			} else {
				iframeError = true;
				iframeLoading = false;
			}
		} else if (iframeEl) {
			iframeLoading = true;
			iframeError = false;
			// Force reload by updating src
			const currentSrc = iframeEl.src;
			iframeEl.src = '';
			setTimeout(() => {
				if (iframeEl) {
					iframeEl.src = currentSrc;
				}
			}, 50);
		}
		onRefresh?.();
	}

	// Load URL in Electron's BrowserView
	async function loadElectronPreview(previewUrl: string) {
		if (!isElectron || !previewUrl) return;

		iframeLoading = true;
		iframeError = false;
		currentPreviewUrl = previewUrl;

		const result = await window.electronAPI?.loadPreview(previewUrl);
		if (result?.success) {
			// Show the preview and set initial bounds
			await window.electronAPI?.showPreview();
			updatePreviewBounds();
			setTimeout(() => {
				iframeLoading = false;
			}, 500);
		} else {
			console.error('Failed to load preview:', result?.error);
			iframeError = true;
			iframeLoading = false;
		}
	}

	// Update BrowserView bounds to match container
	function updatePreviewBounds() {
		if (!isElectron || !containerEl) return;

		const rect = containerEl.getBoundingClientRect();
		window.electronAPI?.setPreviewBounds({
			x: Math.round(rect.left),
			y: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height)
		});
	}

	// Set up Electron event listeners
	function setupElectronListeners() {
		if (!isElectron) return;

		// Listen for URL changes from the preview
		const urlCleanup = window.electronAPI?.onUrlChanged((newUrl: string) => {
			currentPreviewUrl = newUrl;
			onUrlChanged?.(newUrl);
		});
		if (urlCleanup) cleanupFns.push(urlCleanup);

		// Listen for element selection from inspector
		const elementCleanup = window.electronAPI?.onElementSelected((data: ElementSelectionData) => {
			onElementSelected?.(data);
		});
		if (elementCleanup) cleanupFns.push(elementCleanup);

		// Listen for inspector cancelled (ESC pressed)
		const inspectorCancelCleanup = window.electronAPI?.onInspectorCancelled(() => {
			onInspectorCancelled?.();
		});
		if (inspectorCancelCleanup) cleanupFns.push(inspectorCancelCleanup);
	}

	// Handle window resize
	function handleResize() {
		if (isElectron) {
			updatePreviewBounds();
		}
	}

	// Setup and cleanup using $effect
	$effect(() => {
		if (isElectron) {
			setupElectronListeners();
			window.addEventListener('resize', handleResize);

			// Use ResizeObserver for more accurate container size tracking
			let resizeObserver: ResizeObserver | null = null;
			if (containerEl) {
				resizeObserver = new ResizeObserver(() => {
					updatePreviewBounds();
				});
				resizeObserver.observe(containerEl);
			}

			// Cleanup function
			return () => {
				// Clean up Electron listeners
				cleanupFns.forEach(fn => fn());
				cleanupFns = [];

				window.removeEventListener('resize', handleResize);
				resizeObserver?.disconnect();

				// Hide the preview when component is destroyed
				window.electronAPI?.hidePreview();
			};
		}
	});

	// Reset state and load URL when URL changes
	$effect(() => {
		if (url && isReady) {
			if (isElectron) {
				loadElectronPreview(url);
			} else {
				iframeLoading = true;
				iframeError = false;
			}
		}
	});

	// Update bounds when visibility changes
	$effect(() => {
		if (isElectron && isReady && !iframeLoading && containerEl) {
			updatePreviewBounds();
		}
	});
</script>

<div class="preview-container" bind:this={containerEl}>
	{#if error}
		<div class="preview-error">
			<Icon name="alert-circle" size={48} />
			<h3>Connection Error</h3>
			<p>{error}</p>
			<button class="retry-btn" onclick={refreshPreview}>
				<Icon name="refresh-cw" size={16} />
				<span>Retry</span>
			</button>
		</div>
	{:else if !isReady || isLoading}
		<div class="preview-loading">
			<Icon name="loader" size={48} />
			<h3>{isLoading ? 'Starting dev server...' : 'Waiting for server to be ready...'}</h3>
			<p>This may take a moment while dependencies are compiled</p>
		</div>
	{:else}
		{#if iframeLoading || iframeError}
			<div class="iframe-overlay" class:error={iframeError}>
				{#if iframeError}
					<Icon name="alert-circle" size={48} />
					<h3>Failed to load preview</h3>
					<p>The development server may still be starting up</p>
					<button class="retry-btn" onclick={refreshPreview}>
						<Icon name="refresh-cw" size={16} />
						<span>Retry</span>
					</button>
				{:else}
					<Icon name="loader" size={32} />
					<p>Loading preview...</p>
				{/if}
			</div>
		{/if}

		<!-- In Electron, the BrowserView is positioned over this container -->
		<!-- In browser, use iframe -->
		{#if !isElectron}
			<iframe
				bind:this={iframeEl}
				src={url}
				title="Dev Server Preview"
				class:hidden={iframeLoading || iframeError}
				onload={handleIframeLoad}
				onerror={handleIframeError}
			></iframe>
		{:else}
			<!-- Placeholder for BrowserView (Electron positions the native view here) -->
			<div class="electron-preview-placeholder" class:hidden={iframeLoading || iframeError}>
				<!-- BrowserView renders on top of this element -->
			</div>
		{/if}
	{/if}

	{#if isReady && !error}
		<button
			class="refresh-btn"
			onclick={refreshPreview}
			title="Refresh preview"
		>
			<Icon name="refresh-cw" size={16} />
		</button>
	{/if}
</div>

<style>
	.preview-container {
		flex: 1;
		position: relative;
		display: flex;
		flex-direction: column;
		background: #0f0f0f;
		overflow: hidden;
	}

	iframe {
		flex: 1;
		width: 100%;
		height: 100%;
		border: none;
		background: #ffffff;
	}

	iframe.hidden,
	.electron-preview-placeholder.hidden {
		visibility: hidden;
		position: absolute;
	}

	.electron-preview-placeholder {
		flex: 1;
		width: 100%;
		height: 100%;
		background: #ffffff;
	}

	.preview-loading,
	.preview-error,
	.iframe-overlay {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px;
		text-align: center;
		color: #9ca3af;
	}

	.iframe-overlay {
		position: absolute;
		inset: 0;
		background: #0f0f0f;
		z-index: 1;
	}

	.iframe-overlay.error {
		background: #1a1a1a;
	}

	.preview-loading :global(.icon),
	.iframe-overlay :global(.icon[data-name="loader"]) {
		animation: spin 1s linear infinite;
		color: #60a5fa;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.preview-error :global(.icon),
	.iframe-overlay.error :global(.icon) {
		color: #f87171;
	}

	h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #e5e7eb;
	}

	p {
		margin: 0;
		font-size: 14px;
		max-width: 360px;
		line-height: 1.5;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: #3b82f6;
		border: none;
		border-radius: 8px;
		color: #ffffff;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
		font-family: 'Figtree', sans-serif;
		margin-top: 8px;
	}

	.retry-btn:hover {
		background: #2563eb;
	}

	.refresh-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: #ffffff;
		cursor: pointer;
		transition: all 0.15s ease;
		z-index: 10;
	}

	.refresh-btn:hover {
		background: rgba(0, 0, 0, 0.8);
		border-color: rgba(255, 255, 255, 0.2);
	}
</style>
