import { getProjectById } from '$lib/dashboard-db';
import { queryEvents, subscribeToActivity } from '$lib/agent-activity-store';
import { taskRunnerStore } from '$lib/task-runner-store';
import type { RequestHandler } from './$types';

/**
 * SSE endpoint for orchestration view - streams combined agent activity
 * and task run status for all active agents in a project
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return new Response(JSON.stringify({ error: 'Project not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const projectId = params.id;

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function send(data: unknown) {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch (e) {
					// Controller might be closed
					console.error('[orchestration/stream] Error sending:', e);
				}
			}

			// Send initial state
			const initialRuns = taskRunnerStore.getForProject(projectId);
			const initialEvents = queryEvents({
				projectId,
				limit: 50
			});

			send({
				type: 'init',
				runs: initialRuns.map((run) => ({
					id: run.id,
					issueId: run.issueId,
					issueTitle: run.issueTitle,
					issueType: run.issueType,
					status: run.status,
					mode: run.mode,
					startedAt: run.startedAt,
					lastActivityAt: run.lastActivityAt,
					awaitingUserInput: run.awaitingUserInput,
					epicSequence: run.epicSequence
				})),
				events: initialEvents.map((event) => ({
					...event,
					timestamp: event.timestamp.toISOString()
				}))
			});

			// Subscribe to new activity events
			const unsubscribe = subscribeToActivity((event) => {
				if (event.projectId === projectId) {
					send({
						type: 'event',
						event: {
							...event,
							timestamp: event.timestamp.toISOString()
						}
					});
				}
			});

			// Poll for task run status changes
			let lastRunsHash = JSON.stringify(initialRuns.map((r) => ({ id: r.id, status: r.status })));
			const pollInterval = setInterval(() => {
				const currentRuns = taskRunnerStore.getForProject(projectId);
				const currentHash = JSON.stringify(currentRuns.map((r) => ({ id: r.id, status: r.status })));

				if (currentHash !== lastRunsHash) {
					lastRunsHash = currentHash;
					send({
						type: 'runs_update',
						runs: currentRuns.map((run) => ({
							id: run.id,
							issueId: run.issueId,
							issueTitle: run.issueTitle,
							issueType: run.issueType,
							status: run.status,
							mode: run.mode,
							startedAt: run.startedAt,
							lastActivityAt: run.lastActivityAt,
							awaitingUserInput: run.awaitingUserInput,
							epicSequence: run.epicSequence
						}))
					});
				}
			}, 1000);

			// Send keepalive every 30 seconds
			const keepaliveInterval = setInterval(() => {
				send({ type: 'keepalive', timestamp: new Date().toISOString() });
			}, 30000);

			// Cleanup when client disconnects
			return () => {
				unsubscribe();
				clearInterval(pollInterval);
				clearInterval(keepaliveInterval);
			};
		},

		cancel() {
			// Stream cancelled by client
			console.log('[orchestration/stream] Client disconnected');
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
