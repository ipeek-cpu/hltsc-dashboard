<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from './Icon.svelte';

	interface Props {
		enabled?: boolean;
		title?: string;
		subtitle?: string;
		icon?: string;
		onDrop: (paths: string[]) => void;
	}

	let {
		enabled = true,
		title = 'Drop files here',
		subtitle = 'Files will be attached',
		icon = 'upload',
		onDrop
	}: Props = $props();

	let isDragOver = $state(false);
	let tauriEvent: typeof import('@tauri-apps/api/event') | null = null;
	let unlistenDragDrop: (() => void) | null = null;

	// Set up/tear down Tauri drag-drop listeners
	$effect(() => {
		if (!enabled || !browser) {
			// Cleanup listeners when disabled
			if (unlistenDragDrop) {
				unlistenDragDrop();
				unlistenDragDrop = null;
			}
			isDragOver = false;
			return;
		}

		// Set up Tauri drag-drop listeners
		async function setupDragDrop() {
			// Check if Tauri is available (with retry)
			const checkTauri = () => (window as any).__TAURI_INTERNALS__?.invoke;
			let internals = checkTauri();

			if (!internals) {
				// Wait for Tauri to be available
				for (let i = 0; i < 30; i++) {
					await new Promise(r => setTimeout(r, 100));
					internals = checkTauri();
					if (internals) break;
				}
			}

			if (!internals) {
				console.log('[GlobalDropZone] Tauri not available');
				return;
			}

			try {
				tauriEvent = await import('@tauri-apps/api/event');

				// Listen for file drop
				const unlistenDrop = await tauriEvent.listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
					console.log('[GlobalDropZone] Drop event:', event.payload);
					isDragOver = false;
					if (event.payload.paths && event.payload.paths.length > 0) {
						onDrop(event.payload.paths);
					}
				});

				// Listen for drag over
				const unlistenOver = await tauriEvent.listen('tauri://drag-over', () => {
					isDragOver = true;
				});

				// Listen for drag cancelled
				const unlistenCancelled = await tauriEvent.listen('tauri://drag-cancelled', () => {
					isDragOver = false;
				});

				// Listen for drag leave (window boundary)
				const unlistenLeave = await tauriEvent.listen('tauri://drag-leave', () => {
					isDragOver = false;
				});

				// Store cleanup function
				unlistenDragDrop = () => {
					unlistenDrop();
					unlistenOver();
					unlistenCancelled();
					unlistenLeave();
				};

				console.log('[GlobalDropZone] Listeners registered');
			} catch (e) {
				console.error('[GlobalDropZone] Failed to set up drag-drop:', e);
			}
		}

		setupDragDrop();

		return () => {
			if (unlistenDragDrop) {
				unlistenDragDrop();
				unlistenDragDrop = null;
			}
		};
	});
</script>

{#if isDragOver}
	<div class="drop-overlay">
		<div class="drop-content">
			<Icon name={icon} size={48} />
			<span class="drop-title">{title}</span>
			{#if subtitle}
				<span class="drop-subtitle">{subtitle}</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.drop-overlay {
		position: fixed;
		inset: 0;
		background: rgba(250, 250, 248, 0.92);
		backdrop-filter: blur(4px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: drop-overlay-in 0.15s ease;
		pointer-events: none;
	}

	@keyframes drop-overlay-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: #1f2937;
		text-align: center;
	}

	.drop-content :global(.icon) {
		opacity: 0.7;
	}

	.drop-title {
		font-size: 24px;
		font-weight: 600;
		font-family: 'Hedvig Letters Serif', Georgia, serif;
	}

	.drop-subtitle {
		font-size: 14px;
		opacity: 0.6;
	}
</style>
