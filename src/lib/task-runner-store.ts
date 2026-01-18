/**
 * Task Runner Store - In-memory state management for task runs
 */
import { randomUUID } from 'crypto';
import type { TaskRun, TaskRunEvent, TaskRunStatus, TaskRunMode, EpicSequence } from './types';

// In-memory store for active runs
const runs = new Map<string, TaskRun>();

// Index by project for quick lookup
const runsByProject = new Map<string, Set<string>>();

// Index by issue (only one run per issue at a time)
const runsByIssue = new Map<string, string>();

// SSE controllers for broadcasting updates
const sseControllers = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Create a new task run
 */
export function createRun(params: {
	projectId: string;
	issueId: string;
	issueTitle: string;
	issueType: string;
	mode: TaskRunMode;
	epicSequence?: EpicSequence;
}): TaskRun {
	const { projectId, issueId, issueTitle, issueType, mode, epicSequence } = params;

	// Check if there's already a run for this issue
	const existingRunId = runsByIssue.get(issueId);
	if (existingRunId) {
		const existingRun = runs.get(existingRunId);
		if (existingRun && existingRun.status === 'running') {
			throw new Error(`A run is already active for issue ${issueId}`);
		}
		// Clean up old run
		deleteRun(existingRunId);
	}

	const now = new Date();
	const run: TaskRun = {
		id: randomUUID(),
		projectId,
		issueId,
		issueTitle,
		issueType,
		mode,
		status: 'queued',
		epicSequence,
		startedAt: now,
		lastActivityAt: now,
		events: [],
		awaitingUserInput: false
	};

	runs.set(run.id, run);

	// Update indexes
	if (!runsByProject.has(projectId)) {
		runsByProject.set(projectId, new Set());
	}
	runsByProject.get(projectId)!.add(run.id);
	runsByIssue.set(issueId, run.id);

	return run;
}

/**
 * Get a run by ID
 */
export function getRun(runId: string): TaskRun | undefined {
	return runs.get(runId);
}

/**
 * Get all runs for a project
 */
export function getRunsForProject(projectId: string): TaskRun[] {
	const runIds = runsByProject.get(projectId);
	if (!runIds) return [];

	return Array.from(runIds)
		.map(id => runs.get(id))
		.filter((run): run is TaskRun => run !== undefined)
		.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

/**
 * Get run for a specific issue
 */
export function getRunForIssue(issueId: string): TaskRun | undefined {
	const runId = runsByIssue.get(issueId);
	return runId ? runs.get(runId) : undefined;
}

/**
 * Update run status
 */
export function updateRunStatus(runId: string, status: TaskRunStatus, reason?: string): TaskRun | undefined {
	const run = runs.get(runId);
	if (!run) return undefined;

	run.status = status;
	run.lastActivityAt = new Date();

	if (status === 'completed' || status === 'failed' || status === 'cancelled') {
		run.completedAt = new Date();
	}

	if (reason) {
		run.completionReason = reason;
	}

	// Add status change event
	addEvent(runId, {
		type: 'status_change',
		content: `Status changed to ${status}${reason ? `: ${reason}` : ''}`
	});

	// Broadcast update
	broadcastToRun(runId, { type: 'status', status, reason });

	return run;
}

/**
 * Update run's awaiting input state
 */
export function setAwaitingInput(runId: string, awaiting: boolean, message?: string): TaskRun | undefined {
	const run = runs.get(runId);
	if (!run) return undefined;

	run.awaitingUserInput = awaiting;
	run.lastActivityAt = new Date();

	if (awaiting) {
		run.status = 'paused';
	}

	broadcastToRun(runId, { type: 'awaiting_input', awaiting, message });

	return run;
}

/**
 * Update epic sequence progress
 */
export function updateEpicProgress(
	runId: string,
	currentIndex: number,
	completedTaskId?: string,
	failedTaskId?: string
): TaskRun | undefined {
	const run = runs.get(runId);
	if (!run || !run.epicSequence) return undefined;

	run.epicSequence.currentIndex = currentIndex;
	run.lastActivityAt = new Date();

	if (completedTaskId) {
		run.epicSequence.completedTaskIds.push(completedTaskId);
	}

	if (failedTaskId) {
		run.epicSequence.failedTaskIds.push(failedTaskId);
	}

	broadcastToRun(runId, {
		type: 'epic_progress',
		epicSequence: run.epicSequence
	});

	return run;
}

/**
 * Add an event to a run
 */
export function addEvent(
	runId: string,
	event: Omit<TaskRunEvent, 'id' | 'timestamp'>
): TaskRunEvent | undefined {
	const run = runs.get(runId);
	if (!run) return undefined;

	const fullEvent: TaskRunEvent = {
		...event,
		id: randomUUID(),
		timestamp: new Date()
	};

	run.events.push(fullEvent);
	run.lastActivityAt = new Date();

	// Broadcast event to SSE clients
	broadcastToRun(runId, { type: 'event', event: fullEvent });

	return fullEvent;
}

/**
 * Set Claude session ID for a run
 */
export function setClaudeSession(runId: string, claudeSessionId: string): TaskRun | undefined {
	const run = runs.get(runId);
	if (!run) return undefined;

	run.claudeSessionId = claudeSessionId;
	return run;
}

/**
 * Delete a run
 */
export function deleteRun(runId: string): boolean {
	const run = runs.get(runId);
	if (!run) return false;

	// Remove from indexes
	const projectRuns = runsByProject.get(run.projectId);
	if (projectRuns) {
		projectRuns.delete(runId);
		if (projectRuns.size === 0) {
			runsByProject.delete(run.projectId);
		}
	}

	runsByIssue.delete(run.issueId);

	// Close SSE connections
	const controllers = sseControllers.get(runId);
	if (controllers) {
		for (const controller of controllers) {
			try {
				controller.close();
			} catch {
				// Ignore errors
			}
		}
		sseControllers.delete(runId);
	}

	return runs.delete(runId);
}

/**
 * Register an SSE controller for a run
 */
export function registerSSEController(runId: string, controller: ReadableStreamDefaultController): void {
	if (!sseControllers.has(runId)) {
		sseControllers.set(runId, new Set());
	}
	sseControllers.get(runId)!.add(controller);
}

/**
 * Unregister an SSE controller
 */
export function unregisterSSEController(runId: string, controller: ReadableStreamDefaultController): void {
	const controllers = sseControllers.get(runId);
	if (controllers) {
		controllers.delete(controller);
		if (controllers.size === 0) {
			sseControllers.delete(runId);
		}
	}
}

/**
 * Broadcast a message to all SSE clients for a run
 */
export function broadcastToRun(runId: string, message: Record<string, unknown>): void {
	const controllers = sseControllers.get(runId);
	if (!controllers) return;

	const encoder = new TextEncoder();
	const data = `data: ${JSON.stringify(message)}\n\n`;

	for (const controller of controllers) {
		try {
			controller.enqueue(encoder.encode(data));
		} catch {
			// Controller might be closed
			controllers.delete(controller);
		}
	}
}

/**
 * Get counts of runs by status
 */
export function getRunCounts(): { total: number; running: number; paused: number; completed: number } {
	let running = 0;
	let paused = 0;
	let completed = 0;

	for (const run of runs.values()) {
		switch (run.status) {
			case 'running':
			case 'queued':
				running++;
				break;
			case 'paused':
				paused++;
				break;
			case 'completed':
			case 'failed':
			case 'cancelled':
				completed++;
				break;
		}
	}

	return { total: runs.size, running, paused, completed };
}

/**
 * Cleanup old completed runs (older than 1 hour)
 */
export function cleanupOldRuns(): number {
	const ONE_HOUR = 60 * 60 * 1000;
	const now = Date.now();
	let cleaned = 0;

	for (const [id, run] of runs) {
		if (
			run.completedAt &&
			now - run.completedAt.getTime() > ONE_HOUR
		) {
			deleteRun(id);
			cleaned++;
		}
	}

	return cleaned;
}

// Export store as object for convenience
export const taskRunnerStore = {
	create: createRun,
	get: getRun,
	getForProject: getRunsForProject,
	getForIssue: getRunForIssue,
	updateStatus: updateRunStatus,
	setAwaitingInput,
	updateEpicProgress,
	addEvent,
	setClaudeSession,
	delete: deleteRun,
	registerSSE: registerSSEController,
	unregisterSSE: unregisterSSEController,
	broadcast: broadcastToRun,
	getCounts: getRunCounts,
	cleanup: cleanupOldRuns
};
