<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';
	import GlobalTaskIndicator from '../components/GlobalTaskIndicator.svelte';
	import NotificationListener from '../components/NotificationListener.svelte';
	import ErrorBoundary from '../components/ErrorBoundary.svelte';
	import Toast from '../components/Toast.svelte';

	let { children }: { children: Snippet } = $props();

	let showUpdateModal = $state(false);
	let hasChecked = false;
	let UpdateModalComponent = $state<any>(null);

	$effect(() => {
		if (browser && !hasChecked) {
			hasChecked = true;

			// Check for updates after a short delay (Electron environment only)
			setTimeout(async () => {
				// Check if we're in Electron environment with updater support
				const electronAPI = (window as any).electronAPI;
				if (electronAPI?.checkForUpdates) {
					try {
						console.log('[Updater] Checking for updates via Electron...');
						const updateInfo = await electronAPI.checkForUpdates();
						if (updateInfo?.updateAvailable) {
							const module = await import('../components/UpdateModal.svelte');
							UpdateModalComponent = module.default;
							showUpdateModal = true;
						}
					} catch (e) {
						console.error('[Updater] Electron update check error:', e);
					}
				} else {
					console.log('[Updater] Not in Electron environment or updater not available');
				}
			}, 2000);
		}
	});

	function closeUpdateModal() {
		showUpdateModal = false;
	}
</script>

{#if showUpdateModal && UpdateModalComponent}
	<UpdateModalComponent onClose={closeUpdateModal} />
{/if}

<!-- Temporarily disabled for debugging
{#if browser}
	<GlobalTaskIndicator />
	<NotificationListener />
{/if}
-->

{#snippet errorBoundaryContent()}
	{@render children()}
{/snippet}

<ErrorBoundary children={errorBoundaryContent} />

<Toast />
