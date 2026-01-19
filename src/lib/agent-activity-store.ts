/**
 * Agent Activity Store
 * In-memory store for real-time agent activity events with query methods
 */

import type {
	AgentActivityEvent,
	AgentActivityFilter,
	AgentActivityType,
	AgentStatus
} from './agent-activity-types';

// Maximum events to keep in memory
const MAX_EVENTS = 1000;

// Event storage
const events: AgentActivityEvent[] = [];

// Listeners for real-time updates
type ActivityListener = (event: AgentActivityEvent) => void;
const listeners = new Set<ActivityListener>();

// Agent status tracking
const agentStatuses = new Map<string, AgentStatus>();

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
	return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Add a new activity event
 */
export function addActivityEvent(
	event: Omit<AgentActivityEvent, 'id' | 'timestamp'>
): AgentActivityEvent {
	const fullEvent: AgentActivityEvent = {
		...event,
		id: generateEventId(),
		timestamp: new Date()
	};

	events.unshift(fullEvent);

	// Trim to max size
	if (events.length > MAX_EVENTS) {
		events.length = MAX_EVENTS;
	}

	// Update agent status
	updateAgentStatus(fullEvent);

	// Notify listeners
	for (const listener of listeners) {
		try {
			listener(fullEvent);
		} catch (e) {
			console.error('[ActivityStore] Listener error:', e);
		}
	}

	return fullEvent;
}

/**
 * Update agent status based on activity
 */
function updateAgentStatus(event: AgentActivityEvent): void {
	const key = `${event.projectId}:${event.agentId}`;

	let status: AgentStatus['status'] = 'working';

	switch (event.type) {
		case 'completed':
		case 'failed':
			status = 'idle';
			break;
		case 'awaiting_input':
			status = 'awaiting_input';
			break;
		case 'blocked':
			status = 'error';
			break;
		default:
			status = 'working';
	}

	agentStatuses.set(key, {
		agentId: event.agentId,
		agentName: event.agentName || event.agentId,
		projectId: event.projectId,
		status,
		currentIssueId: event.issueId,
		currentIssueTitle: event.issueTitle,
		lastActivityAt: event.timestamp,
		runId: event.runId
	});
}

/**
 * Query events with filters
 */
export function queryEvents(filter: AgentActivityFilter = {}): AgentActivityEvent[] {
	let result = events;

	if (filter.projectId) {
		result = result.filter((e) => e.projectId === filter.projectId);
	}

	if (filter.issueId) {
		result = result.filter((e) => e.issueId === filter.issueId);
	}

	if (filter.agentId) {
		result = result.filter((e) => e.agentId === filter.agentId);
	}

	if (filter.runId) {
		result = result.filter((e) => e.runId === filter.runId);
	}

	if (filter.types && filter.types.length > 0) {
		result = result.filter((e) => filter.types!.includes(e.type));
	}

	if (filter.since) {
		result = result.filter((e) => e.timestamp >= filter.since!);
	}

	if (filter.limit && filter.limit > 0) {
		result = result.slice(0, filter.limit);
	}

	return result;
}

/**
 * Get events for a specific project
 */
export function getProjectEvents(
	projectId: string,
	limit = 50
): AgentActivityEvent[] {
	return queryEvents({ projectId, limit });
}

/**
 * Get events for a specific issue
 */
export function getIssueEvents(
	projectId: string,
	issueId: string,
	limit = 50
): AgentActivityEvent[] {
	return queryEvents({ projectId, issueId, limit });
}

/**
 * Get events for a specific run
 */
export function getRunEvents(runId: string, limit = 100): AgentActivityEvent[] {
	return queryEvents({ runId, limit });
}

/**
 * Get recent events of specific types
 */
export function getRecentEventsByType(
	types: AgentActivityType[],
	limit = 20
): AgentActivityEvent[] {
	return queryEvents({ types, limit });
}

/**
 * Get agent status
 */
export function getAgentStatus(
	projectId: string,
	agentId: string
): AgentStatus | undefined {
	const key = `${projectId}:${agentId}`;
	return agentStatuses.get(key);
}

/**
 * Get all active agents for a project
 */
export function getActiveAgents(projectId: string): AgentStatus[] {
	const result: AgentStatus[] = [];

	for (const [key, status] of agentStatuses) {
		if (key.startsWith(`${projectId}:`) && status.status !== 'idle') {
			result.push(status);
		}
	}

	return result;
}

/**
 * Get all agent statuses for a project
 */
export function getProjectAgentStatuses(projectId: string): AgentStatus[] {
	const result: AgentStatus[] = [];

	for (const [key, status] of agentStatuses) {
		if (key.startsWith(`${projectId}:`)) {
			result.push(status);
		}
	}

	return result;
}

/**
 * Subscribe to activity events
 */
export function subscribeToActivity(listener: ActivityListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * Clear all events (for testing)
 */
export function clearAllEvents(): void {
	events.length = 0;
	agentStatuses.clear();
}

/**
 * Get event count
 */
export function getEventCount(): number {
	return events.length;
}

/**
 * Emit an activity event (convenience function used by task runner)
 */
export function emitActivity(
	type: AgentActivityType,
	projectId: string,
	agentId: string,
	data: Partial<Omit<AgentActivityEvent, 'id' | 'timestamp' | 'type' | 'projectId' | 'agentId'>> = {}
): AgentActivityEvent {
	return addActivityEvent({
		type,
		projectId,
		agentId,
		...data
	});
}
