<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';
	import GlobalTaskIndicator from '../components/GlobalTaskIndicator.svelte';
	import NotificationListener from '../components/NotificationListener.svelte';
	import { initAuth } from '$lib/auth-store.svelte';

	let { children }: { children: Snippet } = $props();

	// Initialize Firebase auth on browser
	$effect(() => {
		if (browser) {
			initAuth();
		}
	});

	let showUpdateModal = $state(false);
	let hasChecked = false;
	let UpdateModalComponent = $state<any>(null);

	$effect(() => {
		if (browser && !hasChecked) {
			hasChecked = true;

			// Check for updates after a short delay
			setTimeout(async () => {
				const internals = (window as any).__TAURI_INTERNALS__;
				if (!internals?.invoke) {
					console.log('[Updater] Not in Tauri environment');
					return;
				}

				try {
					console.log('[Updater] Checking for updates...');
					const { check } = await import('@tauri-apps/plugin-updater');
					const update = await check();

					console.log('[Updater] Update available:', update?.available);
					console.log('[Updater] Current version:', update?.currentVersion);
					console.log('[Updater] Remote version:', update?.version);

					if (update?.available) {
						// Dynamically import the modal component
						const module = await import('../components/UpdateModal.svelte');
						UpdateModalComponent = module.default;
						showUpdateModal = true;
					}
				} catch (e) {
					console.error('[Updater] Error:', e);
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

{@render children()}
