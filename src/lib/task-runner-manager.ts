/**
 * Task Runner Manager - Orchestrates task execution and epic sequencing
 */
import {
	createClaudeSession,
	sendMessage as claudeSendMessage,
	cancelResponse as claudeCancel,
	closeSession as claudeClose,
	type ClaudeSession,
	type ClaudeOutputChunk
} from './claude-cli';
import { taskRunnerStore } from './task-runner-store';
import { registerActiveTask, updateActiveTask, removeActiveTask } from './active-tasks-store';
import { notifyAwaitingInput, notifyTaskCompleted } from './notification-helper';
import { getProjectById } from './dashboard-db';
import { getIssueWithDetails, getChildIssuesSorted, getIssueById, updateIssue, refreshProjectDb, notifyDbChange } from './project-db';
import { buildTaskPrompt, detectCompletionSignal, buildMessagePrompt } from './task-prompt-builder';
import { parseFrontmatter } from './agents';
import { emitActivity } from './agent-activity-store';
import type { TaskRun, TaskRunMode, Issue, IssueWithDetails } from './types';
import fs from 'fs';
import path from 'path';

// Store for active Claude sessions by run ID
const claudeSessions = new Map<string, ClaudeSession>();

// Polling intervals for status monitoring
const statusPollers = new Map<string, NodeJS.Timeout>();

/**
 * Start a new task run
 */
export function startTaskRun(
	projectId: string,
	issueId: string,
	mode: TaskRunMode,
	agentFilename?: string
): TaskRun | null {
	const project = getProjectById(projectId);
	if (!project) {
		console.error('[TaskRunner] Project not found:', projectId);
		return null;
	}

	const issue = getIssueWithDetails(project.path, issueId);
	if (!issue) {
		console.error('[TaskRunner] Issue not found:', issueId);
		return null;
	}

	// Check if this is an epic with children
	const isEpic = issue.issue_type === 'epic' && issue.children && issue.children.length > 0;

	// Build epic sequence if this is an epic
	let epicSequence;
	if (isEpic) {
		// Get topologically sorted child tasks
		const sortedTasks = getChildIssuesSorted(project.path, issueId);
		const nonClosedTasks = sortedTasks.filter(t => t.status !== 'closed');

		if (nonClosedTasks.length === 0) {
			console.log('[TaskRunner] All tasks in epic are already completed');
			return null;
		}

		epicSequence = {
			totalTasks: nonClosedTasks.length,
			currentIndex: 0,
			taskIds: nonClosedTasks.map(t => t.id),
			completedTaskIds: [],
			failedTaskIds: []
		};
	}

	// Create the run
	const run = taskRunnerStore.create({
		projectId,
		issueId,
		issueTitle: issue.title,
		issueType: issue.issue_type,
		mode,
		epicSequence
	});

	// Load agent prompt if specified
	let agentPrompt: string | undefined;
	if (agentFilename) {
		const agentPath = path.join(project.path, '.claude', 'agents', agentFilename);
		if (fs.existsSync(agentPath)) {
			try {
				agentPrompt = fs.readFileSync(agentPath, 'utf-8');
			} catch (err) {
				console.error('[TaskRunner] Error reading agent file:', err);
			}
		}
	}

	// Create Claude session
	const claudeSession = createClaudeSession({
		projectPath: project.path,
		agentPrompt,
		onData: (chunk) => handleClaudeOutput(run.id, chunk),
		onError: (error) => handleClaudeError(run.id, error),
		onClose: (code) => handleClaudeClose(run.id, code)
	});

	if (!claudeSession) {
		console.error('[TaskRunner] Failed to create Claude session');
		taskRunnerStore.delete(run.id);
		return null;
	}

	claudeSessions.set(run.id, claudeSession);
	taskRunnerStore.setClaudeSession(run.id, claudeSession.id);

	// Register with active tasks store for global tracking
	registerActiveTask(run);

	// Start execution
	if (isEpic) {
		executeNextEpicTask(run.id, project.path, agentPrompt);
	} else {
		executeTask(run.id, issue, project.path, mode, agentPrompt);
	}

	return run;
}

/**
 * Execute a single task
 */
function executeTask(
	runId: string,
	issue: IssueWithDetails,
	projectPath: string,
	mode: TaskRunMode,
	agentPrompt?: string,
	epicContext?: Parameters<typeof buildTaskPrompt>[0]['epicContext']
): void {
	const run = taskRunnerStore.get(runId);
	if (!run) return;

	const claudeSession = claudeSessions.get(runId);
	if (!claudeSession) {
		console.error('[TaskRunner] No Claude session for run:', runId);
		taskRunnerStore.updateStatus(runId, 'failed', 'No Claude session');
		return;
	}

	// Update status to running
	taskRunnerStore.updateStatus(runId, 'running');

	// Update active task store
	updateActiveTask(runId, { status: 'running' });

	// Update the issue status to in_progress in beads database
	if (issue.status === 'open') {
		const updated = updateIssue(projectPath, issue.id, { status: 'in_progress' });
		if (updated) {
			console.log('[TaskRunner] Updated issue status to in_progress:', issue.id);
			// Notify that we changed the DB and refresh connection so stream picks up change
			notifyDbChange(projectPath);
			refreshProjectDb(projectPath);
		}
	}

	// Build the prompt
	const prompt = buildTaskPrompt({
		issue,
		mode,
		agentPrompt,
		epicContext
	});

	// Log the task start
	taskRunnerStore.addEvent(runId, {
		type: 'status_change',
		content: `Starting ${mode} execution of: ${issue.title}`
	});

	// Send to Claude
	claudeSendMessage(
		claudeSession,
		prompt,
		(chunk) => handleClaudeOutput(runId, chunk),
		(error) => handleClaudeError(runId, error),
		(code) => handleClaudeClose(runId, code)
	);

	// Start status polling for this issue
	startStatusPolling(runId, projectPath, issue.id);
}

/**
 * Execute the next task in an epic sequence
 */
function executeNextEpicTask(runId: string, projectPath: string, agentPrompt?: string): void {
	const run = taskRunnerStore.get(runId);
	if (!run || !run.epicSequence) return;

	const { currentIndex, taskIds, completedTaskIds } = run.epicSequence;

	if (currentIndex >= taskIds.length) {
		// All tasks done
		taskRunnerStore.updateStatus(runId, 'completed', 'All epic tasks completed');
		return;
	}

	const currentTaskId = taskIds[currentIndex];
	const currentTask = getIssueWithDetails(projectPath, currentTaskId);

	if (!currentTask) {
		console.error('[TaskRunner] Could not find task:', currentTaskId);
		taskRunnerStore.updateEpicProgress(runId, currentIndex + 1, undefined, currentTaskId);
		executeNextEpicTask(runId, projectPath, agentPrompt);
		return;
	}

	// Check if task is already closed
	if (currentTask.status === 'closed') {
		taskRunnerStore.updateEpicProgress(runId, currentIndex + 1, currentTaskId);
		executeNextEpicTask(runId, projectPath, agentPrompt);
		return;
	}

	// Get epic info for context
	const epicIssue = getIssueById(projectPath, run.issueId);

	// Build epic context
	const completedTasks = completedTaskIds
		.map(id => getIssueById(projectPath, id))
		.filter((t): t is Issue => t !== null);

	const remainingTaskIds = taskIds.slice(currentIndex + 1);
	const remainingTasks = remainingTaskIds
		.map(id => getIssueById(projectPath, id))
		.filter((t): t is Issue => t !== null);

	const epicContext = {
		epicId: run.issueId,
		epicTitle: epicIssue?.title || 'Unknown Epic',
		completedTasks,
		remainingTasks,
		currentTaskIndex: currentIndex,
		totalTasks: taskIds.length
	};

	// Execute this task
	executeTask(runId, currentTask, projectPath, run.mode, agentPrompt, epicContext);
}

/**
 * Handle output from Claude
 */
function handleClaudeOutput(runId: string, chunk: ClaudeOutputChunk): void {
	const run = taskRunnerStore.get(runId);
	if (!run) return;

	// Get agent info for activity events
	const agentId = run.claudeSessionId || 'claude';

	switch (chunk.type) {
		case 'text':
			if (chunk.content) {
				taskRunnerStore.addEvent(runId, {
					type: 'output',
					content: chunk.content
				});

				// Emit activity for text output
				emitActivity('message', run.projectId, agentId, {
					issueId: run.issueId,
					issueTitle: run.issueTitle,
					runId,
					content: chunk.content.slice(0, 200) // Truncate for activity feed
				});

				// Check for completion signals
				const signal = detectCompletionSignal(chunk.content);
				if (signal.type) {
					handleCompletionSignal(runId, signal.type, signal.message);
				}
			}
			break;

		case 'tool_use':
			taskRunnerStore.addEvent(runId, {
				type: 'tool_use',
				toolName: chunk.toolName,
				toolInput: chunk.toolInput
			});

			// Emit activity for tool use
			emitActivity('tool_use', run.projectId, agentId, {
				issueId: run.issueId,
				issueTitle: run.issueTitle,
				runId,
				toolName: chunk.toolName,
				toolInput: chunk.toolInput
			});
			break;

		case 'tool_result':
			taskRunnerStore.addEvent(runId, {
				type: 'tool_result',
				toolResult: chunk.toolResult
			});

			// Emit activity for tool result
			emitActivity('tool_result', run.projectId, agentId, {
				issueId: run.issueId,
				issueTitle: run.issueTitle,
				runId,
				toolName: chunk.toolName
			});
			break;

		case 'error':
			taskRunnerStore.addEvent(runId, {
				type: 'error',
				content: chunk.content
			});
			break;

		case 'auth_expired':
			// Auth expired - stop the run and notify the UI
			taskRunnerStore.addEvent(runId, {
				type: 'error',
				content: 'Claude authentication expired. Please log in again.'
			});
			taskRunnerStore.updateStatus(runId, 'failed');
			// Clean up the Claude session
			const runForAuth = taskRunnerStore.get(runId);
			if (runForAuth?.claudeSessionId) {
				claudeSessions.delete(runForAuth.claudeSessionId);
			}
			break;

		case 'done':
			// Response complete - check if we should advance epic or wait
			handleResponseComplete(runId);
			break;
	}
}

/**
 * Handle completion signals from Claude's response
 */
function handleCompletionSignal(
	runId: string,
	signalType: 'completed' | 'awaiting_input' | 'blocked',
	message?: string
): void {
	const run = taskRunnerStore.get(runId);
	if (!run) return;

	const agentId = run.claudeSessionId || 'claude';

	taskRunnerStore.addEvent(runId, {
		type: 'completion_signal',
		content: `${signalType}: ${message || ''}`
	});

	// Emit activity for the signal type
	emitActivity(signalType, run.projectId, agentId, {
		issueId: run.issueId,
		issueTitle: run.issueTitle,
		runId,
		content: message
	});

	switch (signalType) {
		case 'completed':
			if (run.epicSequence) {
				// Advance to next task in epic
				const project = getProjectById(run.projectId);
				if (project) {
					const currentTaskId = run.epicSequence.taskIds[run.epicSequence.currentIndex];
					taskRunnerStore.updateEpicProgress(runId, run.epicSequence.currentIndex + 1, currentTaskId);
					stopStatusPolling(runId);

					// Small delay before next task
					setTimeout(() => {
						executeNextEpicTask(runId, project.path);
					}, 1000);
				}
			} else {
				// Single task completed
				stopStatusPolling(runId);
				taskRunnerStore.updateStatus(runId, 'completed', message);

				// Remove from active tasks and notify
				removeActiveTask(runId);
				notifyTaskCompleted({
					taskRunId: runId,
					projectId: run.projectId,
					issueId: run.issueId,
					issueTitle: run.issueTitle,
					success: true
				});
			}
			break;

		case 'awaiting_input':
			taskRunnerStore.setAwaitingInput(runId, true, message);

			// Update active task store and send notification
			updateActiveTask(runId, { awaitingUserInput: true, status: 'paused' });
			notifyAwaitingInput({
				taskRunId: runId,
				projectId: run.projectId,
				issueId: run.issueId,
				issueTitle: run.issueTitle
			});
			break;

		case 'blocked':
			if (run.epicSequence) {
				// Mark task as failed and try next
				const currentTaskId = run.epicSequence.taskIds[run.epicSequence.currentIndex];
				taskRunnerStore.updateEpicProgress(runId, run.epicSequence.currentIndex + 1, undefined, currentTaskId);
				stopStatusPolling(runId);

				const project = getProjectById(run.projectId);
				if (project) {
					setTimeout(() => {
						executeNextEpicTask(runId, project.path);
					}, 1000);
				}
			} else {
				stopStatusPolling(runId);
				taskRunnerStore.updateStatus(runId, 'failed', message);

				// Remove from active tasks and notify
				removeActiveTask(runId);
				notifyTaskCompleted({
					taskRunId: runId,
					projectId: run.projectId,
					issueId: run.issueId,
					issueTitle: run.issueTitle,
					success: false
				});
			}
			break;
	}
}

/**
 * Handle when Claude's response is complete
 */
function handleResponseComplete(runId: string): void {
	const run = taskRunnerStore.get(runId);
	if (!run) return;

	// If we're in guided mode, just wait for next user input
	if (run.mode === 'guided') {
		return;
	}

	// In autonomous mode, if we didn't get a completion signal,
	// the task might still be in progress (Claude may continue)
	// We rely on status polling to detect actual completion
}

/**
 * Handle Claude errors
 */
function handleClaudeError(runId: string, error: Error): void {
	console.error('[TaskRunner] Claude error:', error);

	taskRunnerStore.addEvent(runId, {
		type: 'error',
		content: error.message
	});

	// Don't immediately fail - Claude might recover
}

/**
 * Handle Claude session close
 */
function handleClaudeClose(runId: string, code: number): void {
	console.log('[TaskRunner] Claude session closed with code:', code);

	const run = taskRunnerStore.get(runId);
	if (!run) return;

	stopStatusPolling(runId);

	// If the run wasn't already marked complete, mark it
	if (run.status === 'running') {
		const success = code === 0;
		if (success) {
			// Normal exit - might be complete
			taskRunnerStore.updateStatus(runId, 'completed', 'Session ended normally');
		} else {
			// Error exit
			taskRunnerStore.updateStatus(runId, 'failed', `Session ended with code ${code}`);
		}

		// Remove from active tasks and notify
		removeActiveTask(runId);
		notifyTaskCompleted({
			taskRunId: runId,
			projectId: run.projectId,
			issueId: run.issueId,
			issueTitle: run.issueTitle,
			success
		});
	}

	// Clean up
	claudeSessions.delete(runId);
}

/**
 * Start polling for issue status changes
 */
function startStatusPolling(runId: string, projectPath: string, issueId: string): void {
	// Stop any existing poller
	stopStatusPolling(runId);

	const initialStatus = getIssueById(projectPath, issueId)?.status;

	const interval = setInterval(() => {
		const run = taskRunnerStore.get(runId);
		if (!run || run.status !== 'running') {
			stopStatusPolling(runId);
			return;
		}

		const currentIssue = getIssueById(projectPath, issueId);
		if (currentIssue && currentIssue.status !== initialStatus && currentIssue.status === 'closed') {
			// Issue was closed - task complete!
			handleCompletionSignal(runId, 'completed', 'Issue status changed to closed');
		}
	}, 2000);

	statusPollers.set(runId, interval);
}

/**
 * Stop status polling
 */
function stopStatusPolling(runId: string): void {
	const interval = statusPollers.get(runId);
	if (interval) {
		clearInterval(interval);
		statusPollers.delete(runId);
	}
}

/**
 * Send a message to a running task (guided mode)
 */
export function sendMessage(runId: string, message: string): boolean {
	const run = taskRunnerStore.get(runId);
	if (!run) return false;

	const claudeSession = claudeSessions.get(runId);
	if (!claudeSession) return false;

	// Clear awaiting input state
	if (run.awaitingUserInput) {
		taskRunnerStore.setAwaitingInput(runId, false);
		taskRunnerStore.updateStatus(runId, 'running');

		// Update active task store
		updateActiveTask(runId, { awaitingUserInput: false, status: 'running' });
	}

	// Build message with context
	const contextualMessage = buildMessagePrompt(message, {
		id: run.issueId,
		title: run.issueTitle
	});

	// Add user message as event
	taskRunnerStore.addEvent(runId, {
		type: 'output',
		content: `[User] ${message}`
	});

	// Send to Claude
	claudeSendMessage(
		claudeSession,
		contextualMessage,
		(chunk) => handleClaudeOutput(runId, chunk),
		(error) => handleClaudeError(runId, error),
		(code) => handleClaudeClose(runId, code)
	);

	return true;
}

/**
 * Stop a running task
 */
export function stopRun(runId: string): boolean {
	const run = taskRunnerStore.get(runId);
	if (!run) return false;

	// Stop status polling
	stopStatusPolling(runId);

	// Cancel Claude response
	const claudeSession = claudeSessions.get(runId);
	if (claudeSession) {
		claudeCancel(claudeSession);
		claudeClose(claudeSession);
		claudeSessions.delete(runId);
	}

	// Update status
	taskRunnerStore.updateStatus(runId, 'cancelled', 'Stopped by user');

	// Remove from active tasks (no notification for user-initiated cancellation)
	removeActiveTask(runId);

	return true;
}

/**
 * Resume a paused run
 */
export function resumeRun(runId: string, message?: string): boolean {
	const run = taskRunnerStore.get(runId);
	if (!run || run.status !== 'paused') return false;

	// If there's a message, send it
	if (message) {
		return sendMessage(runId, message);
	}

	// Otherwise just resume
	taskRunnerStore.setAwaitingInput(runId, false);
	taskRunnerStore.updateStatus(runId, 'running');

	// Update active task store
	updateActiveTask(runId, { awaitingUserInput: false, status: 'running' });

	// In epic mode, continue to next task
	if (run.epicSequence) {
		const project = getProjectById(run.projectId);
		if (project) {
			executeNextEpicTask(runId, project.path);
		}
	}

	return true;
}

/**
 * Get active runs for a project
 */
export function getActiveRuns(projectId: string): TaskRun[] {
	return taskRunnerStore.getForProject(projectId)
		.filter(run => run.status === 'running' || run.status === 'paused' || run.status === 'queued');
}

/**
 * Cleanup: close all sessions
 */
export function cleanup(): void {
	for (const [runId, session] of claudeSessions) {
		stopStatusPolling(runId);
		claudeClose(session);
	}
	claudeSessions.clear();
}
