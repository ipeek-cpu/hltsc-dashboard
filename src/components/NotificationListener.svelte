<script lang="ts">
	import { browser } from '$app/environment';
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
	let hasPermission = false;

	onMount(async () => {
		if (!browser) return;

		// Check if browser supports notifications
		if (!('Notification' in window)) {
			console.log('[NotificationListener] Browser does not support notifications');
			return;
		}

		// Request permission
		if (Notification.permission === 'granted') {
			hasPermission = true;
		} else if (Notification.permission !== 'denied') {
			const permission = await Notification.requestPermission();
			hasPermission = permission === 'granted';
		}

		console.log('[NotificationListener] Permission:', hasPermission);

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

	function showNotification(notification: NotificationRequest) {
		if (!hasPermission) return;

		try {
			new Notification(notification.title, {
				body: notification.body,
				icon: '/favicon.png'
			});
			console.log('[NotificationListener] Sent notification:', notification.title);
		} catch (e) {
			console.error('[NotificationListener] Failed to send notification:', e);
		}
	}
</script>
