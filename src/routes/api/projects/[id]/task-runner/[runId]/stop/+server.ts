import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { taskRunnerStore } from '$lib/task-runner-store';
import { stopRun } from '$lib/task-runner-manager';
import type { RequestHandler } from './$types';

/**
 * POST - Stop a running task
 */
export const POST: RequestHandler = async ({ params }) => {
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

	if (run.status !== 'running' && run.status !== 'paused' && run.status !== 'queued') {
		return json({ error: 'Run is not active' }, { status: 400 });
	}

	const success = stopRun(params.runId);

	if (!success) {
		return json({ error: 'Failed to stop run' }, { status: 500 });
	}

	return json({
		success: true,
		status: 'cancelled'
	});
};
