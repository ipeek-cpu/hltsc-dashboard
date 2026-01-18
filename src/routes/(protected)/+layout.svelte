<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';
	import { auth } from '$lib/auth-store.svelte';

	let { children }: { children: Snippet } = $props();

	// Redirect to login if not authenticated
	$effect(() => {
		if (browser && !auth.loading && !auth.isAuthenticated) {
			goto('/login');
		}
	});
</script>

{#if auth.loading}
	<div class="loading-screen">
		<div class="loading-content">
			<div class="spinner"></div>
			<p>Loading...</p>
		</div>
	</div>
{:else if auth.isAuthenticated}
	{@render children()}
{:else}
	<div class="loading-screen">
		<div class="loading-content">
			<p>Redirecting to login...</p>
		</div>
	</div>
{/if}

<style>
	.loading-screen {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fafafa;
		font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.loading-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		color: #888888;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e5e5e5;
		border-top-color: #1a1a1a;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-content p {
		margin: 0;
		font-size: 14px;
	}
</style>
