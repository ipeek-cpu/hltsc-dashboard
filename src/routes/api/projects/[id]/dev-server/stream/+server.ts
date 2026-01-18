import type { RequestHandler } from './$types';
import { getProjectById, getProjectDevConfig } from '$lib/dashboard-db';
import { getServerStatus, getServerEmitter, getServerOutput, getPreviewUrl } from '$lib/dev-server-manager';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const project = getProjectById(id);
	if (!project) {
		return new Response(JSON.stringify({ error: 'Project not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const config = getProjectDevConfig(id);
	const status = getServerStatus(id);

	if (!status.running) {
		return new Response(JSON.stringify({ error: 'Server not running' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const emitter = getServerEmitter(id);
	if (!emitter) {
		return new Response(JSON.stringify({ error: 'Server emitter not found' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Create SSE stream
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let isClosed = false;

			function sendEvent(type: string, data: Record<string, unknown>) {
				if (isClosed) return;
				const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
				try {
					controller.enqueue(encoder.encode(message));
				} catch {
					// Stream closed
					isClosed = true;
				}
			}

			function closeController() {
				if (isClosed) return;
				isClosed = true;
				try {
					controller.close();
				} catch {
					// Already closed
				}
			}

			// Send initial status and recent output
			sendEvent('init', {
				status: getServerStatus(id),
				config,
				previewUrl: config ? getPreviewUrl(id, config) : null,
				recentOutput: getServerOutput(id, 50)
			});

			// Handle output events
			const outputHandler = (output: string) => {
				sendEvent('output', { content: output });
			};

			// Handle ready event
			const readyHandler = () => {
				sendEvent('ready', {
					previewUrl: config ? getPreviewUrl(id, config) : null
				});
			};

			// Handle preview URL (Shopify)
			const previewUrlHandler = (url: string) => {
				sendEvent('preview-url', { previewUrl: url });
			};

			// Handle exit
			const exitHandler = (code: number) => {
				sendEvent('exit', { code });
				cleanup();
				closeController();
			};

			// Handle error
			const errorHandler = (error: string) => {
				sendEvent('error', { message: error });
			};

			emitter.on('output', outputHandler);
			emitter.on('ready', readyHandler);
			emitter.on('preview-url', previewUrlHandler);
			emitter.on('exit', exitHandler);
			emitter.on('error', errorHandler);

			function cleanup() {
				emitter?.off('output', outputHandler);
				emitter?.off('ready', readyHandler);
				emitter?.off('preview-url', previewUrlHandler);
				emitter?.off('exit', exitHandler);
				emitter?.off('error', errorHandler);
			}

			// Heartbeat to keep connection alive
			const heartbeat = setInterval(() => {
				if (isClosed) {
					clearInterval(heartbeat);
					cleanup();
					return;
				}
				try {
					sendEvent('heartbeat', { timestamp: Date.now() });
				} catch {
					clearInterval(heartbeat);
					cleanup();
				}
			}, 30000);

			// Return cleanup function
			return () => {
				clearInterval(heartbeat);
				cleanup();
			};
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
