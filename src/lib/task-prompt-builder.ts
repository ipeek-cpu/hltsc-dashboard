/**
 * Task Prompt Builder - Constructs context-aware prompts for Claude to work on tasks
 */
import type { Issue, IssueWithDetails, TaskRunMode } from './types';

interface TaskPromptParams {
	issue: IssueWithDetails;
	mode: TaskRunMode;
	agentPrompt?: string;
	epicContext?: {
		epicId: string;
		epicTitle: string;
		completedTasks: Issue[];
		remainingTasks: Issue[];
		currentTaskIndex: number;
		totalTasks: number;
	};
}

/**
 * Get human-readable priority label
 */
function getPriorityLabel(priority: number): string {
	switch (priority) {
		case 0: return 'Critical';
		case 1: return 'High';
		case 2: return 'Medium';
		case 3: return 'Low';
		case 4: return 'Backlog';
		default: return 'Unknown';
	}
}

/**
 * Get human-readable issue type label
 */
function getTypeLabel(issueType: string): string {
	return issueType.charAt(0).toUpperCase() + issueType.slice(1);
}

/**
 * Format an issue as a compact reference
 */
function formatIssueRef(issue: Issue): string {
	return `- ${issue.id}: ${issue.title} (${issue.status})`;
}

/**
 * Build the task context section
 */
function buildTaskContext(issue: IssueWithDetails): string {
	const lines: string[] = [];

	lines.push('<task-context>');
	lines.push(`**Task ID:** ${issue.id}`);
	lines.push(`**Title:** ${issue.title}`);
	lines.push(`**Type:** ${getTypeLabel(issue.issue_type)}`);
	lines.push(`**Priority:** ${getPriorityLabel(issue.priority)}`);
	lines.push(`**Status:** ${issue.status}`);

	if (issue.assignee) {
		lines.push(`**Assignee:** ${issue.assignee}`);
	}

	lines.push('');
	lines.push('**Description:**');
	lines.push(issue.description || '_No description provided_');

	// Add blockers if any
	if (issue.blockers && issue.blockers.length > 0) {
		lines.push('');
		lines.push('**Blocked By (dependencies that must be completed first):**');
		for (const blocker of issue.blockers) {
			lines.push(formatIssueRef(blocker));
		}
	}

	// Add blocked issues if any
	if (issue.blocked_by && issue.blocked_by.length > 0) {
		lines.push('');
		lines.push('**This task blocks:**');
		for (const blocked of issue.blocked_by) {
			lines.push(formatIssueRef(blocked));
		}
	}

	// Add parent epic if exists
	if (issue.parent) {
		lines.push('');
		lines.push(`**Parent Epic:** ${issue.parent.id} - ${issue.parent.title}`);
	}

	// Add child tasks if this is an epic
	if (issue.children && issue.children.length > 0) {
		lines.push('');
		lines.push('**Child Tasks:**');
		for (const child of issue.children) {
			lines.push(formatIssueRef(child));
		}
	}

	lines.push('</task-context>');

	return lines.join('\n');
}

/**
 * Build the epic context section (when working through an epic)
 */
function buildEpicContext(epicContext: TaskPromptParams['epicContext']): string {
	if (!epicContext) return '';

	const lines: string[] = [];

	lines.push('<epic-context>');
	lines.push(`This task is part of the epic "${epicContext.epicTitle}" (${epicContext.epicId}).`);
	lines.push(`Progress: Task ${epicContext.currentTaskIndex + 1} of ${epicContext.totalTasks}`);

	if (epicContext.completedTasks.length > 0) {
		lines.push('');
		lines.push('**Completed tasks in this epic:**');
		for (const task of epicContext.completedTasks) {
			lines.push(`- ${task.id}: ${task.title}`);
		}
	}

	if (epicContext.remainingTasks.length > 0) {
		lines.push('');
		lines.push('**Remaining tasks after this one:**');
		for (const task of epicContext.remainingTasks) {
			lines.push(`- ${task.id}: ${task.title}`);
		}
	}

	lines.push('</epic-context>');

	return lines.join('\n');
}

/**
 * Build autonomous mode instructions
 */
function buildAutonomousInstructions(issue: IssueWithDetails): string {
	const lines: string[] = [];

	lines.push('<instructions>');
	lines.push('Work on this task autonomously. Your goal is to complete the task as described.');
	lines.push('');
	lines.push('**When you have completed the task:**');
	lines.push(`1. Update the issue status by running: bd update ${issue.id} --status=closed`);
	lines.push('2. Then respond with: "TASK_COMPLETED: {brief summary of what was done}"');
	lines.push('');
	lines.push('**If you encounter a blocker that requires human input:**');
	lines.push('Respond with: "AWAITING_INPUT: {description of what you need}"');
	lines.push('');
	lines.push('**If the task cannot be completed:**');
	lines.push('Respond with: "TASK_BLOCKED: {reason}"');
	lines.push('</instructions>');

	return lines.join('\n');
}

/**
 * Build guided mode instructions
 */
function buildGuidedInstructions(issue: IssueWithDetails): string {
	const lines: string[] = [];

	lines.push('<instructions>');
	lines.push('You are working on this task in guided mode. The user will direct your work.');
	lines.push('');
	lines.push('**Guidelines:**');
	lines.push('- Explain your approach before making changes');
	lines.push('- Ask for confirmation on significant decisions');
	lines.push('- Report progress regularly');
	lines.push('- Use the beads CLI (bd) to update task status when instructed');
	lines.push('');
	lines.push('**When the user confirms the task is complete:**');
	lines.push(`Update the status: bd update ${issue.id} --status=closed`);
	lines.push('</instructions>');

	return lines.join('\n');
}

/**
 * Build the complete prompt for a task
 */
export function buildTaskPrompt(params: TaskPromptParams): string {
	const { issue, mode, agentPrompt, epicContext } = params;

	const sections: string[] = [];

	// Add agent context if provided
	if (agentPrompt) {
		sections.push('<agent-profile>');
		sections.push(agentPrompt);
		sections.push('</agent-profile>');
		sections.push('');
	}

	// Add task context
	sections.push(buildTaskContext(issue));
	sections.push('');

	// Add epic context if applicable
	if (epicContext) {
		sections.push(buildEpicContext(epicContext));
		sections.push('');
	}

	// Add mode-specific instructions
	if (mode === 'autonomous') {
		sections.push(buildAutonomousInstructions(issue));
	} else {
		sections.push(buildGuidedInstructions(issue));
	}

	sections.push('');
	sections.push('Begin working on this task now.');

	return sections.join('\n');
}

/**
 * Build a prompt for continuing work after a pause
 */
export function buildResumePrompt(issue: IssueWithDetails, previousContext?: string): string {
	const lines: string[] = [];

	lines.push('<resume-context>');
	lines.push(`Resuming work on task ${issue.id}: ${issue.title}`);

	if (previousContext) {
		lines.push('');
		lines.push('Previous context:');
		lines.push(previousContext);
	}

	lines.push('</resume-context>');
	lines.push('');
	lines.push('Continue working on this task. Pick up where you left off.');

	return lines.join('\n');
}

/**
 * Build a simple message prompt (for guided mode user messages)
 */
export function buildMessagePrompt(message: string, taskContext?: { id: string; title: string }): string {
	if (taskContext) {
		return `[Working on ${taskContext.id}: ${taskContext.title}]\n\n${message}`;
	}
	return message;
}

/**
 * Completion signal patterns for detection
 */
export const COMPLETION_SIGNALS = {
	COMPLETED: /TASK_COMPLETED:\s*(.+)/i,
	AWAITING_INPUT: /AWAITING_INPUT:\s*(.+)/i,
	BLOCKED: /TASK_BLOCKED:\s*(.+)/i
} as const;

/**
 * Detect completion signals in Claude's response
 */
export function detectCompletionSignal(
	text: string
): { type: 'completed' | 'awaiting_input' | 'blocked' | null; message?: string } {
	for (const [signalType, pattern] of Object.entries(COMPLETION_SIGNALS)) {
		const match = text.match(pattern);
		if (match) {
			const type = signalType.toLowerCase().replace('_', '_') as 'completed' | 'awaiting_input' | 'blocked';
			return { type, message: match[1].trim() };
		}
	}

	return { type: null };
}
