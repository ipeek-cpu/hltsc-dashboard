import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { taskRunnerStore } from '$lib/task-runner-store';
import { sendMessage, resumeRun } from '$lib/task-runner-manager';
import type { RequestHandler } from './$types';

/**
 * POST - Send a message to a running task (guided mode or resume)
 * Body: { message: string }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const run = taskRunnerStore.get(params.runId);

	if (!run) {
		return json({ error: 'Run not found' }, { status: 404 });
	}

	if (run.projectId !== params.id) {
		return json({ error: 'Run does not belong to this project' }, { status: 403 });
	}

	const body = await request.json().catch(() => ({}));
	const { message } = body as { message?: string };

	if (!message || typeof message !== 'string' || !message.trim()) {
		return json({ error: 'message is required' }, { status: 400 });
	}

	// If paused/awaiting input, resume with the message
	if (run.status === 'paused' || run.awaitingUserInput) {
		const success = resumeRun(params.runId, message.trim());

		if (!success) {
			return json({ error: 'Failed to resume run' }, { status: 500 });
		}

		return json({
			success: true,
			resumed: true
		});
	}

	// If running in guided mode, send the message
	if (run.status === 'running') {
		const success = sendMessage(params.runId, message.trim());

		if (!success) {
			return json({ error: 'Failed to send message' }, { status: 500 });
		}

		return json({
			success: true,
			sent: true
		});
	}

	return json({
		error: 'Run is not in a state that accepts messages',
		status: run.status
	}, { status: 400 });
};
