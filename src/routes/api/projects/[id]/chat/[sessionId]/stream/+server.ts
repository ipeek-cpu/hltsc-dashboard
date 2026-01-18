import { getProjectById } from '$lib/dashboard-db';
import { sessionStore } from '$lib/session-store';
import { registerSSEController, unregisterSSEController } from '$lib/chat-manager';
import type { RequestHandler } from './$types';

/**
 * GET - SSE stream for chat updates
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);
	if (!project) {
		return new Response('Project not found', { status: 404 });
	}

	const session = sessionStore.get(params.sessionId);
	if (!session) {
		return new Response('Session not found', { status: 404 });
	}

	let controllerRef: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			controllerRef = controller;
			const encoder = new TextEncoder();

			// Register this controller to receive updates
			registerSSEController(params.sessionId, controller);

			// Send initial connection message
			const initMessage = JSON.stringify({
				type: 'connected',
				sessionId: params.sessionId,
				agentName: session.agentName,
				messageCount: session.messageHistory.length
			});
			controller.enqueue(encoder.encode(`data: ${initMessage}\n\n`));

			// Send existing message history
			for (const msg of session.messageHistory) {
				const historyMessage = JSON.stringify({
					type: 'history',
					message: msg
				});
				controller.enqueue(encoder.encode(`data: ${historyMessage}\n\n`));
			}
		},
		cancel() {
			// Unregister when client disconnects
			if (controllerRef) {
				unregisterSSEController(params.sessionId, controllerRef);
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
