import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	subscribeToActivity,
	getProjectEvents
} from '$lib/agent-activity-store';
import type { AgentActivityEvent } from '$lib/agent-activity-types';

export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return new Response(JSON.stringify({ error: 'Project not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const projectId = params.id;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			// Send helper
			function send(data: unknown) {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Stream may be closed
				}
			}

			// Send initial events
			const initialEvents = getProjectEvents(projectId, 50);
			send({
				type: 'init',
				events: initialEvents.map(serializeEvent)
			});

			// Subscribe to new events
			const unsubscribe = subscribeToActivity((event: AgentActivityEvent) => {
				// Only send events for this project
				if (event.projectId === projectId) {
					send({
						type: 'event',
						event: serializeEvent(event)
					});
				}
			});

			// Keep-alive ping every 30 seconds
			const pingInterval = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// Stream closed
					clearInterval(pingInterval);
					unsubscribe();
				}
			}, 30000);

			// Cleanup on cancel
			return () => {
				clearInterval(pingInterval);
				unsubscribe();
			};
		},

		cancel() {
			// Cleanup handled in start's return
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};

function serializeEvent(event: AgentActivityEvent): Record<string, unknown> {
	return {
		...event,
		timestamp: event.timestamp.toISOString()
	};
}
