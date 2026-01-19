<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/toast-store';
	import Icon from './Icon.svelte';

	let toastList: Toast[] = $state([]);

	// Subscribe to toast store
	$effect(() => {
		const unsubscribe = toasts.subscribe((value) => {
			toastList = value;
		});
		return unsubscribe;
	});

	function getIcon(type: Toast['type']): string {
		switch (type) {
			case 'success':
				return 'check-circle';
			case 'error':
				return 'alert-circle';
			case 'warning':
				return 'alert-triangle';
			case 'info':
				return 'info';
			default:
				return 'info';
		}
	}

	function dismiss(id: string) {
		toasts.remove(id);
	}
</script>

{#if toastList.length > 0}
	<div class="toast-container">
		{#each toastList as toast (toast.id)}
			<div class="toast toast-{toast.type}" role="alert">
				<Icon name={getIcon(toast.type)} size={18} />
				<span class="toast-message">{toast.message}</span>
				<button class="toast-dismiss" onclick={() => dismiss(toast.id)} aria-label="Dismiss">
					<Icon name="x" size={14} />
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 9999;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-radius: 10px;
		background: #ffffff;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		font-size: 14px;
		font-family: 'Figtree', sans-serif;
		max-width: 400px;
		animation: slideIn 0.2s ease-out;
		pointer-events: auto;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.toast-success {
		border-left: 4px solid #10b981;
		color: #065f46;
	}

	.toast-success :global(.icon) {
		color: #10b981;
	}

	.toast-error {
		border-left: 4px solid #ef4444;
		color: #991b1b;
	}

	.toast-error :global(.icon) {
		color: #ef4444;
	}

	.toast-warning {
		border-left: 4px solid #f59e0b;
		color: #92400e;
	}

	.toast-warning :global(.icon) {
		color: #f59e0b;
	}

	.toast-info {
		border-left: 4px solid #3b82f6;
		color: #1e40af;
	}

	.toast-info :global(.icon) {
		color: #3b82f6;
	}

	.toast-message {
		flex: 1;
	}

	.toast-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: inherit;
		opacity: 0.5;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.toast-dismiss:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.05);
	}
</style>
