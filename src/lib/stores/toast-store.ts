/**
 * Toast Notification Store
 *
 * Simple toast notification system using Svelte 5 runes.
 * Supports success, error, warning, and info toast types.
 */

import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	let idCounter = 0;

	function add(type: ToastType, message: string, duration = 4000): string {
		const id = `toast-${++idCounter}`;
		const toast: Toast = { id, type, message, duration };

		update((toasts) => [...toasts, toast]);

		// Auto-remove after duration
		if (duration > 0) {
			setTimeout(() => {
				remove(id);
			}, duration);
		}

		return id;
	}

	function remove(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	function clear() {
		update(() => []);
	}

	return {
		subscribe,
		add,
		remove,
		clear,
		success: (message: string, duration?: number) => add('success', message, duration),
		error: (message: string, duration?: number) => add('error', message, duration ?? 6000),
		warning: (message: string, duration?: number) => add('warning', message, duration),
		info: (message: string, duration?: number) => add('info', message, duration)
	};
}

export const toasts = createToastStore();
