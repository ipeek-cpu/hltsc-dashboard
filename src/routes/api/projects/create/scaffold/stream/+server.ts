import type { RequestHandler } from './$types';
import {
	getScaffoldSession,
	registerSSEController,
	unregisterSSEController
} from '$lib/scaffold-manager';

/**
 * GET - SSE stream for scaffold progress (Claude output)
 */
export const GET: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get('sessionId');

	if (!sessionId) {
		return new Response('Session ID is required', { status: 400 });
	}

	const session = getScaffoldSession(sessionId);
	if (!session) {
		return new Response('Session not found', { status: 404 });
	}

	// Create SSE stream
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Register this controller to receive broadcasts
			registerSSEController(sessionId, controller);

			// Send initial status
			const initMessage = `data: ${JSON.stringify({
				type: 'init',
				status: session.status,
				projectName: session.projectName,
				projectPath: session.projectPath
			})}\n\n`;
			controller.enqueue(encoder.encode(initMessage));

			// If already complete or error, send that status
			if (session.status === 'complete') {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({
					type: 'done',
					projectId: session.createdProjectId,
					projectName: session.projectName,
					projectPath: session.projectPath
				})}\n\n`));
			} else if (session.status === 'error') {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({
					type: 'error',
					content: session.error
				})}\n\n`));
			}
		},
		cancel() {
			// Unregister when client disconnects
			unregisterSSEController(sessionId, this as unknown as ReadableStreamDefaultController);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*'
		}
	});
};
