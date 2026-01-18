/**
 * Active Tasks Store - Global tracking of active task runs across all projects
 *
 * This store provides a global view of all active tasks and SSE broadcasting
 * for the GlobalTaskIndicator component.
 */
import type { TaskRun, TaskRunStatus } from './types';

// Re-export access to the underlying store
export {
	getRun,
	getRunsForProject,
	getRunForIssue,
	getRunCounts
} from './task-runner-store';

// Global SSE controllers for broadcasting active task updates
const globalSSEControllers = new Set<ReadableStreamDefaultController>();

// In-memory tracking of all active runs (mirrors task-runner-store but provides global access)
const activeRuns = new Map<string, TaskRun>();

export interface ActiveTaskUpdate {
	type: 'task_added' | 'task_updated' | 'task_removed' | 'awaiting_input' | 'full_sync';
	task?: TaskRun;
	tasks?: TaskRun[];
	runId?: string;
}

/**
 * Register a new active task
 */
export function registerActiveTask(run: TaskRun): void {
	activeRuns.set(run.id, run);
	broadcastGlobalUpdate({
		type: 'task_added',
		task: run
	});
}

/**
 * Update an active task's status
 */
export function updateActiveTask(runId: string, updates: Partial<TaskRun>): void {
	const run = activeRuns.get(runId);
	if (!run) return;

	// Apply updates
	Object.assign(run, updates, { lastActivityAt: new Date() });

	broadcastGlobalUpdate({
		type: 'task_updated',
		task: run
	});

	// If awaiting input changed to true, send special notification
	if (updates.awaitingUserInput === true) {
		broadcastGlobalUpdate({
			type: 'awaiting_input',
			task: run
		});
	}
}

/**
 * Remove an active task (on completion/cancellation)
 */
export function removeActiveTask(runId: string): void {
	const run = activeRuns.get(runId);
	if (!run) return;

	activeRuns.delete(runId);
	broadcastGlobalUpdate({
		type: 'task_removed',
		runId
	});
}

/**
 * Get all active tasks across all projects
 */
export function getAllActiveTasks(): TaskRun[] {
	return Array.from(activeRuns.values())
		.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

/**
 * Get all tasks that are awaiting user input
 */
export function getTasksNeedingAttention(): TaskRun[] {
	return getAllActiveTasks().filter(run => run.awaitingUserInput);
}

/**
 * Get counts for the global indicator
 */
export function getActiveTaskCounts(): {
	total: number;
	running: number;
	awaitingInput: number;
} {
	let running = 0;
	let awaitingInput = 0;

	for (const run of activeRuns.values()) {
		if (run.status === 'running' || run.status === 'queued') {
			running++;
		}
		if (run.awaitingUserInput) {
			awaitingInput++;
		}
	}

	return { total: activeRuns.size, running, awaitingInput };
}

/**
 * Register a global SSE controller for the active tasks stream
 */
export function registerGlobalSSE(controller: ReadableStreamDefaultController): void {
	globalSSEControllers.add(controller);

	// Send initial state
	const encoder = new TextEncoder();
	const initialData = `data: ${JSON.stringify({
		type: 'full_sync',
		tasks: getAllActiveTasks()
	})}\n\n`;

	try {
		controller.enqueue(encoder.encode(initialData));
	} catch {
		globalSSEControllers.delete(controller);
	}
}

/**
 * Unregister a global SSE controller
 */
export function unregisterGlobalSSE(controller: ReadableStreamDefaultController): void {
	globalSSEControllers.delete(controller);
}

/**
 * Broadcast an update to all global SSE clients
 */
function broadcastGlobalUpdate(update: ActiveTaskUpdate): void {
	const encoder = new TextEncoder();
	const data = `data: ${JSON.stringify(update)}\n\n`;

	for (const controller of globalSSEControllers) {
		try {
			controller.enqueue(encoder.encode(data));
		} catch {
			// Controller might be closed
			globalSSEControllers.delete(controller);
		}
	}
}

/**
 * Check if a run is active
 */
export function isRunActive(runId: string): boolean {
	return activeRuns.has(runId);
}

/**
 * Get a specific active task
 */
export function getActiveTask(runId: string): TaskRun | undefined {
	return activeRuns.get(runId);
}

// Export store as object for convenience
export const activeTasksStore = {
	register: registerActiveTask,
	update: updateActiveTask,
	remove: removeActiveTask,
	getAll: getAllActiveTasks,
	getNeedingAttention: getTasksNeedingAttention,
	getCounts: getActiveTaskCounts,
	get: getActiveTask,
	isActive: isRunActive,
	registerSSE: registerGlobalSSE,
	unregisterSSE: unregisterGlobalSSE
};
