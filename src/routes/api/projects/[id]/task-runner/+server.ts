import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { startTaskRun, getActiveRuns } from '$lib/task-runner-manager';
import { taskRunnerStore } from '$lib/task-runner-store';
import type { RequestHandler } from './$types';

/**
 * GET - List all task runs for a project
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const runs = taskRunnerStore.getForProject(params.id);

	return json({
		runs: runs.map(run => ({
			id: run.id,
			issueId: run.issueId,
			issueTitle: run.issueTitle,
			issueType: run.issueType,
			mode: run.mode,
			status: run.status,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
			epicSequence: run.epicSequence ? {
				totalTasks: run.epicSequence.totalTasks,
				currentIndex: run.epicSequence.currentIndex,
				completedCount: run.epicSequence.completedTaskIds.length,
				failedCount: run.epicSequence.failedTaskIds.length
			} : undefined,
			awaitingUserInput: run.awaitingUserInput,
			eventCount: run.events.length
		}))
	});
};

/**
 * POST - Start a new task run
 * Body: { issueId: string, mode: 'autonomous' | 'guided', agentFilename?: string }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const body = await request.json().catch(() => ({}));
	const { issueId, mode = 'autonomous', agentFilename } = body as {
		issueId?: string;
		mode?: 'autonomous' | 'guided';
		agentFilename?: string;
	};

	if (!issueId) {
		return json({ error: 'issueId is required' }, { status: 400 });
	}

	if (mode !== 'autonomous' && mode !== 'guided') {
		return json({ error: 'mode must be "autonomous" or "guided"' }, { status: 400 });
	}

	// Check if there's already an active run for this issue
	const existingRun = taskRunnerStore.getForIssue(issueId);
	if (existingRun && (existingRun.status === 'running' || existingRun.status === 'paused')) {
		return json({
			error: 'A run is already active for this issue',
			existingRunId: existingRun.id
		}, { status: 409 });
	}

	// Start the run
	const run = startTaskRun(params.id, issueId, mode, agentFilename);

	if (!run) {
		return json({ error: 'Failed to start task run' }, { status: 500 });
	}

	return json({
		runId: run.id,
		issueId: run.issueId,
		issueTitle: run.issueTitle,
		issueType: run.issueType,
		mode: run.mode,
		status: run.status,
		isEpic: !!run.epicSequence,
		epicSequence: run.epicSequence ? {
			totalTasks: run.epicSequence.totalTasks,
			taskIds: run.epicSequence.taskIds
		} : undefined
	});
};
