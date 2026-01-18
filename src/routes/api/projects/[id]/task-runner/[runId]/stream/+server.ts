import { getProjectById } from '$lib/dashboard-db';
import { taskRunnerStore } from '$lib/task-runner-store';
import type { RequestHandler } from './$types';

/**
 * GET - SSE stream for task run updates
 * Query params:
 *   - skipHistory=true: Don't send existing events (for reconnection after loading via REST)
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return new Response(JSON.stringify({ error: 'Project not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const run = taskRunnerStore.get(params.runId);

	if (!run) {
		return new Response(JSON.stringify({ error: 'Run not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (run.projectId !== params.id) {
		return new Response(JSON.stringify({ error: 'Run does not belong to this project' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Check if we should skip sending existing events (reconnection case)
	const skipHistory = url.searchParams.get('skipHistory') === 'true';

	const encoder = new TextEncoder();

	// Store controller reference for cleanup
	let streamController: ReadableStreamDefaultController | null = null;

	const stream = new ReadableStream({
		start(controller) {
			streamController = controller;

			// Register this controller for updates
			taskRunnerStore.registerSSE(params.runId, controller);

			// Send initial connection message
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

			// Send current run state
			controller.enqueue(encoder.encode(`data: ${JSON.stringify({
				type: 'state',
				run: {
					id: run.id,
					issueId: run.issueId,
					issueTitle: run.issueTitle,
					issueType: run.issueType,
					mode: run.mode,
					status: run.status,
					startedAt: run.startedAt,
					epicSequence: run.epicSequence,
					awaitingUserInput: run.awaitingUserInput
				}
			})}\n\n`));

			// Send existing events only if not skipping history
			if (!skipHistory) {
				for (const event of run.events) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({
						type: 'event',
						event
					})}\n\n`));
				}
			}
		},
		cancel() {
			// Unregister when client disconnects
			if (streamController) {
				taskRunnerStore.unregisterSSE(params.runId, streamController);
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
