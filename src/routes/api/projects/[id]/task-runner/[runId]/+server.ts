import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { taskRunnerStore } from '$lib/task-runner-store';
import type { RequestHandler } from './$types';

/**
 * GET - Get details of a specific task run
 */
export const GET: RequestHandler = async ({ params }) => {
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

	return json({
		id: run.id,
		projectId: run.projectId,
		issueId: run.issueId,
		issueTitle: run.issueTitle,
		issueType: run.issueType,
		mode: run.mode,
		status: run.status,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		lastActivityAt: run.lastActivityAt,
		epicSequence: run.epicSequence,
		awaitingUserInput: run.awaitingUserInput,
		completionReason: run.completionReason,
		events: run.events
	});
};

/**
 * DELETE - Delete a task run (cleanup)
 */
export const DELETE: RequestHandler = async ({ params }) => {
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

	// Don't delete running tasks
	if (run.status === 'running') {
		return json({ error: 'Cannot delete a running task. Stop it first.' }, { status: 400 });
	}

	taskRunnerStore.delete(params.runId);

	return json({ success: true });
};
