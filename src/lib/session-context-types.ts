/**
 * Type definitions for session context persistence
 */

export type KnownIssueType = 'ci_failure' | 'blocker' | 'bug' | 'note';
export type KnownIssueStatus = 'active' | 'resolved';

export interface KnownIssue {
	id: string;
	type: KnownIssueType;
	title: string;
	description: string;
	status: KnownIssueStatus;
	createdAt: string;
	resolvedAt?: string;
}

export interface SessionContext {
	id: string;
	projectId: string;
	sessionId?: string; // Chat session ID (optional)
	createdAt: string;
	endedAt?: string;

	// Metrics (from Claude output)
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	durationMs: number;

	// Summaries
	summary?: string; // AI-generated or manual
	keyDecisions?: string[]; // Important choices made

	// Context Carryover
	knownIssues: string[]; // IDs of known issues at time of session
	nextSteps?: string[]; // What to do next session
}

export interface SessionContextStore {
	sessions: SessionContext[];
	knownIssues: KnownIssue[];
	lastUpdated: string;
}

// Default empty store
export const DEFAULT_SESSION_CONTEXT_STORE: SessionContextStore = {
	sessions: [],
	knownIssues: [],
	lastUpdated: new Date().toISOString()
};
