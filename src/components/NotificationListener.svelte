<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';

	interface NotificationRequest {
		type: 'awaiting_input' | 'completed' | 'failed';
		title: string;
		body: string;
		taskRunId: string;
		projectId: string;
		issueId: string;
	}

	let eventSource: EventSource | null = null;
	let notificationApi: typeof import('@tauri-apps/plugin-notification') | null = null;
	let hasPermission = false;

	onMount(async () => {
		if (!browser) return;

		// Try to load Tauri notification API
		try {
			notificationApi = await import('@tauri-apps/plugin-notification');

			// Check/request permission
			const granted = await notificationApi.isPermissionGranted();
			if (!granted) {
				const result = await notificationApi.requestPermission();
				hasPermission = result === 'granted';
			} else {
				hasPermission = true;
			}

			console.log('[NotificationListener] Permission:', hasPermission);
		} catch (e) {
			console.log('[NotificationListener] Tauri notification API not available:', e);
			return;
		}

		if (!hasPermission) {
			console.log('[NotificationListener] Notification permission not granted');
			return;
		}

		// Connect to notification SSE stream
		eventSource = new EventSource('/api/notifications/stream');

		eventSource.onmessage = (event) => {
			try {
				const notification: NotificationRequest = JSON.parse(event.data);
				showNotification(notification);
			} catch (e) {
				console.error('[NotificationListener] Failed to parse notification:', e);
			}
		};

		eventSource.onerror = (e) => {
			console.error('[NotificationListener] SSE error:', e);
		};
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	});

	async function showNotification(notification: NotificationRequest) {
		if (!notificationApi || !hasPermission) return;

		try {
			await notificationApi.sendNotification({
				title: notification.title,
				body: notification.body
			});
			console.log('[NotificationListener] Sent notification:', notification.title);
		} catch (e) {
			console.error('[NotificationListener] Failed to send notification:', e);
		}
	}
</script>
