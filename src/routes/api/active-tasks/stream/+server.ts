/**
 * SSE endpoint for global active task updates
 *
 * Clients subscribe to this stream to receive real-time updates about
 * all active tasks across all projects. Used by GlobalTaskIndicator.
 */
import { registerGlobalSSE, unregisterGlobalSSE } from '$lib/active-tasks-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let controller: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(ctrl) {
			controller = ctrl;
			registerGlobalSSE(ctrl);
		},
		cancel() {
			if (controller) {
				unregisterGlobalSSE(controller);
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
