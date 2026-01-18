/**
 * SSE endpoint for native notification triggers
 *
 * Clients subscribe to this stream to receive notification requests.
 * When a notification is received, the client uses Tauri's notification API
 * to display the native OS notification.
 */
import { registerNotificationSSE, unregisterNotificationSSE } from '$lib/notification-helper';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let controller: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(ctrl) {
			controller = ctrl;
			registerNotificationSSE(ctrl);
		},
		cancel() {
			if (controller) {
				unregisterNotificationSSE(controller);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
