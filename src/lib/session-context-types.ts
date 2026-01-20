/**
 * Type definitions for session context persistence
 *
 * Sessions are first-class objects that capture the full context of work.
 * They provide continuity across interruptions and are persisted to disk.
 *
 * Storage format: .beads/sessions/{id}/meta.json + messages.jsonl
 */

// ============================================================================
// Session Core Types
// ============================================================================

/**
 * Session lifecycle states
 * - draft: Session created but not yet started (no messages)
 * - active: Session is actively being used
 * - paused: Session intentionally paused (can be resumed)
 * - closed: Session completed (read-only, archived)
 */
export type SessionStatus = 'draft' | 'active' | 'paused' | 'closed';

/**
 * Core Session interface - first-class object representing a work session
 */
export interface Session {
	id: string;
	projectId: string;

	// Optional linkages
	beadId?: string;       // Associated bead/issue being worked on
	agentId?: string;      // Agent filename (e.g., 'planner.md')
	agentName?: string;    // Human-readable agent name

	// Status and lifecycle
	status: SessionStatus;

	// Timestamps (ISO 8601 strings for JSON serialization)
	createdAt: string;
	startedAt?: string;    // When first message was sent
	pausedAt?: string;     // When paused (if paused)
	closedAt?: string;     // When closed (if closed)
	lastActivityAt: string;

	// Optional metadata
	title?: string;        // User-provided or auto-generated title
	summary?: string;      // AI-generated summary of session
	tags?: string[];       // User-defined tags for organization

	// Metrics (accumulated during session)
	metrics: SessionMetrics;

	// Memory context (generated at session creation for bead-scoped sessions)
	/** Pre-generated memory brief for session start */
	memoryBrief?: string;

	/** Token estimate for the memory brief */
	memoryBriefTokens?: number;
}

/**
 * Session metrics for tracking usage and performance
 */
export interface SessionMetrics {
	messageCount: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	durationMs: number;         // Total active time (excluding pauses)
	toolCallCount: number;
}

/**
 * Default metrics for new sessions
 */
export const DEFAULT_SESSION_METRICS: SessionMetrics = {
	messageCount: 0,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	totalCostUsd: 0,
	durationMs: 0,
	toolCallCount: 0
};

// ============================================================================
// Message Types (for messages.jsonl)
// ============================================================================

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Tool call within a message
 */
export interface SessionToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
	result?: unknown;
	error?: string;
	startedAt: string;
	completedAt?: string;
}

/**
 * Session message - stored in messages.jsonl
 */
export interface SessionMessage {
	id: string;
	sessionId: string;
	role: MessageRole;
	content: string;
	timestamp: string;

	// Tool calls (for assistant messages)
	toolCalls?: SessionToolCall[];

	// Usage stats (for assistant messages)
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Session metadata stored in meta.json
 * Separating meta from messages allows quick session listing
 */
export interface SessionMeta extends Session {
	// meta.json stores the full Session object
	// Messages are stored separately in messages.jsonl
}

/**
 * Summary of a session for list views (lighter weight than full Session)
 */
export interface SessionSummary {
	id: string;
	projectId: string;
	status: SessionStatus;
	title?: string;
	agentName?: string;
	beadId?: string;
	createdAt: string;
	lastActivityAt: string;
	messageCount: number;
}

// ============================================================================
// Known Issues Types (existing)
// ============================================================================

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
