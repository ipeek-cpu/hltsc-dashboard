/**
 * Agent Activity Types
 * Defines event types for real-time agent activity monitoring
 */

export type AgentActivityType =
	| 'claimed'
	| 'file_read'
	| 'file_edit'
	| 'file_write'
	| 'command_run'
	| 'commit'
	| 'completed'
	| 'failed'
	| 'blocked'
	| 'awaiting_input'
	| 'message'
	| 'tool_use'
	| 'tool_result';

export interface AgentActivityEvent {
	id: string;
	timestamp: Date;
	type: AgentActivityType;
	projectId: string;
	issueId?: string;
	issueTitle?: string;
	agentId: string;
	agentName?: string;
	runId?: string;

	// Type-specific data
	content?: string; // For messages, errors, etc.
	filePath?: string; // For file operations
	command?: string; // For command_run
	commitHash?: string; // For commit
	branchName?: string; // For claimed
	toolName?: string; // For tool_use/tool_result
	toolInput?: Record<string, unknown>;
	toolResult?: unknown;
	exitCode?: number; // For command_run
	success?: boolean; // For completed
}

export interface AgentActivityFilter {
	projectId?: string;
	issueId?: string;
	agentId?: string;
	runId?: string;
	types?: AgentActivityType[];
	since?: Date;
	limit?: number;
}

export interface AgentStatus {
	agentId: string;
	agentName: string;
	projectId: string;
	status: 'idle' | 'working' | 'awaiting_input' | 'error';
	currentIssueId?: string;
	currentIssueTitle?: string;
	lastActivityAt?: Date;
	runId?: string;
}

/**
 * Format an activity event for display
 */
export function formatActivityEvent(event: AgentActivityEvent): string {
	const time = event.timestamp.toLocaleTimeString();
	const agent = event.agentName || event.agentId;

	switch (event.type) {
		case 'claimed':
			return `${time} - ${agent} claimed "${event.issueTitle}" on branch ${event.branchName}`;
		case 'file_read':
			return `${time} - ${agent} read ${event.filePath}`;
		case 'file_edit':
			return `${time} - ${agent} edited ${event.filePath}`;
		case 'file_write':
			return `${time} - ${agent} wrote ${event.filePath}`;
		case 'command_run':
			return `${time} - ${agent} ran: ${event.command}${event.exitCode !== undefined ? ` (exit: ${event.exitCode})` : ''}`;
		case 'commit':
			return `${time} - ${agent} committed ${event.commitHash?.slice(0, 7)}`;
		case 'completed':
			return `${time} - ${agent} completed "${event.issueTitle}"`;
		case 'failed':
			return `${time} - ${agent} failed on "${event.issueTitle}": ${event.content}`;
		case 'blocked':
			return `${time} - ${agent} blocked on "${event.issueTitle}": ${event.content}`;
		case 'awaiting_input':
			return `${time} - ${agent} awaiting input for "${event.issueTitle}"`;
		case 'message':
			return `${time} - ${agent}: ${event.content}`;
		case 'tool_use':
			return `${time} - ${agent} using tool: ${event.toolName}`;
		case 'tool_result':
			return `${time} - ${agent} tool result: ${event.toolName}`;
		default:
			return `${time} - ${agent}: ${event.type}`;
	}
}

/**
 * Get icon name for activity type
 */
export function getActivityIcon(type: AgentActivityType): string {
	switch (type) {
		case 'claimed':
			return 'git-branch';
		case 'file_read':
			return 'file';
		case 'file_edit':
		case 'file_write':
			return 'edit';
		case 'command_run':
			return 'terminal';
		case 'commit':
			return 'git-commit';
		case 'completed':
			return 'check-circle';
		case 'failed':
			return 'x-circle';
		case 'blocked':
			return 'alert-circle';
		case 'awaiting_input':
			return 'help-circle';
		case 'message':
			return 'message-circle';
		case 'tool_use':
			return 'tool';
		case 'tool_result':
			return 'check';
		default:
			return 'activity';
	}
}

/**
 * Get color for activity type
 */
export function getActivityColor(type: AgentActivityType): string {
	switch (type) {
		case 'claimed':
			return '#3b82f6'; // blue
		case 'file_read':
			return '#6b7280'; // gray
		case 'file_edit':
		case 'file_write':
			return '#f59e0b'; // amber
		case 'command_run':
			return '#8b5cf6'; // purple
		case 'commit':
			return '#10b981'; // green
		case 'completed':
			return '#22c55e'; // green
		case 'failed':
			return '#ef4444'; // red
		case 'blocked':
			return '#f97316'; // orange
		case 'awaiting_input':
			return '#eab308'; // yellow
		case 'message':
			return '#6b7280'; // gray
		case 'tool_use':
			return '#6366f1'; // indigo
		case 'tool_result':
			return '#14b8a6'; // teal
		default:
			return '#6b7280'; // gray
	}
}
