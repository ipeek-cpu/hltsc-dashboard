/**
 * Type definitions for cmem (Persistent Memory) system
 *
 * cmem provides an append-only memory store for decisions, checkpoints, constraints,
 * and handoff notes that survive session compaction and provide consistent context
 * across multi-agent, multi-session development.
 *
 * Storage:
 * - Database: <project_root>/.beads/memory.db (SQLite, append-only)
 * - Scoping hierarchy: bead -> epic -> project
 * - Soft deletes only (deleted_at timestamp, no actual DELETE)
 *
 * Design Principles:
 * - Append-only: Normal operations never UPDATE or DELETE rows
 * - Scoped retrieval: Bead-specific first, then epic fallback, project constraints only at top
 * - Token-budgeted: Memory briefs respect context window limits
 */

// ============================================================================
// Memory Kind Definitions
// ============================================================================

/**
 * Types of memory entries
 *
 * Each kind has specific semantics for retrieval and display:
 * - decision: Architectural or implementation decisions with rationale
 * - checkpoint: Session state snapshots for continuity
 * - constraint: Hard rules that must always be followed
 * - next_step: Handoff notes for the next session/agent
 * - action_report: Quick action execution results
 * - ci_note: CI/CD related notes and observations
 */
export type MemoryKind =
	| 'decision'
	| 'checkpoint'
	| 'constraint'
	| 'next_step'
	| 'action_report'
	| 'ci_note';

/**
 * Array of all valid memory kinds for validation
 */
export const MEMORY_KINDS: readonly MemoryKind[] = [
	'decision',
	'checkpoint',
	'constraint',
	'next_step',
	'action_report',
	'ci_note'
] as const;

// ============================================================================
// Core Memory Entry Types
// ============================================================================

/**
 * A memory entry stored in the database
 *
 * Entries are scoped to beads, epics, or projects. At least one of beadId or epicId
 * should be set for proper scoping. Project-level entries (no bead/epic) are only
 * valid for constraints.
 */
export interface MemoryEntry {
	/** Unique identifier (UUID v4) */
	id: string;

	/** Project ID this entry belongs to (always required) */
	projectId: string;

	/** Bead ID for bead-scoped entries (preferred scope) */
	beadId?: string;

	/** Epic ID for epic-scoped entries (fallback scope) */
	epicId?: string;

	/** Dashboard session ID for traceability */
	sessionId?: string;

	/** Claude chat ID within the session */
	chatId?: string;

	/** Name of the agent that created this entry */
	agentName?: string;

	/** Type of memory entry */
	kind: MemoryKind;

	/** Brief title describing the entry */
	title: string;

	/** Primary content (markdown supported) */
	content: string;

	/** JSON data for structured metadata */
	data?: Record<string, unknown>;

	/** Links to intent anchor paths (e.g., ["lifecycle.execute"]) */
	intentAnchors?: string[];

	/** Relevance score for ranking (0.0-1.0, default 1.0) */
	relevanceScore: number;

	/** ISO 8601 timestamp when this entry expires (null = never) */
	expiresAt?: string;

	/** ISO 8601 timestamp when this entry was soft-deleted (null = active) */
	deletedAt?: string;

	/** ISO 8601 timestamp when this entry was created */
	createdAt: string;
}

/**
 * Input for creating a new memory entry
 *
 * Excludes auto-generated fields (id, createdAt, deletedAt, relevanceScore default)
 */
export interface CreateMemoryEntry {
	/** Project ID (required) */
	projectId: string;

	/** Bead ID for bead-scoped entries (preferred) */
	beadId?: string;

	/** Epic ID for epic-scoped entries (fallback) */
	epicId?: string;

	/** Dashboard session ID */
	sessionId?: string;

	/** Claude chat ID within the session */
	chatId?: string;

	/** Name of the creating agent */
	agentName?: string;

	/** Type of memory entry */
	kind: MemoryKind;

	/** Brief title (required) */
	title: string;

	/** Primary content (required) */
	content: string;

	/** JSON data for structured metadata */
	data?: Record<string, unknown>;

	/** Links to intent anchor paths */
	intentAnchors?: string[];

	/** Custom relevance score (default: 1.0) */
	relevanceScore?: number;

	/** Expiration timestamp (ISO 8601) */
	expiresAt?: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query for scoped memory retrieval
 *
 * The scoping hierarchy is: bead -> epic -> project (constraints only)
 */
export interface ScopedMemoryQuery {
	/** Project ID (required) */
	projectId: string;

	/** Bead ID for bead-scoped retrieval */
	beadId?: string;

	/** Epic ID for epic-scoped retrieval */
	epicId?: string;

	/** Filter by specific memory kinds */
	kinds?: MemoryKind[];

	/** Include expired entries (default: false) */
	includeExpired?: boolean;

	/** Maximum entries per category (default: 50) */
	limit?: number;
}

/**
 * Result of scoped memory retrieval
 *
 * Returns memories organized by scope level for flexible display and injection.
 */
export interface ScopedMemoryResult {
	/** Entries directly scoped to the bead */
	beadMemories: MemoryEntry[];

	/** Entries scoped to the epic (excludes bead-specific) */
	epicMemories: MemoryEntry[];

	/** Project-level constraints only (no general soup) */
	projectConstraints: MemoryEntry[];

	/** All active (non-expired) constraints from any scope */
	activeConstraints: MemoryEntry[];
}

/**
 * Query for text-based memory search
 */
export interface MemorySearchQuery {
	/** Project ID (required) */
	projectId: string;

	/** Search query text */
	query: string;

	/** Limit to specific bead scope */
	beadId?: string;

	/** Limit to specific epic scope */
	epicId?: string;

	/** Filter by specific memory kinds */
	kinds?: MemoryKind[];

	/** Include expired entries (default: false) */
	includeExpired?: boolean;

	/** Maximum results (default: 20, max: 100) */
	limit?: number;
}

// ============================================================================
// Ranking Types
// ============================================================================

/**
 * Memory entry with computed ranking information
 *
 * Used when ranking memories for display or injection into context.
 */
export interface RankedMemory extends MemoryEntry {
	/** Final computed score for ranking */
	computedScore: number;

	/** Breakdown of scoring factors for debugging/display */
	scoreBreakdown: {
		/** Score from stored relevanceScore (weight: 0.4) */
		baseRelevance: number;

		/** Score from recency (1.0 for today, decays over 30 days, weight: 0.3) */
		recencyBoost: number;

		/** Score from scope proximity (1.0 = exact bead, 0.7 = epic, 0.3 = project, weight: 0.2) */
		scopeProximity: number;

		/** Score boost for kind (constraints +0.3, decisions +0.2, weight: 0.1) */
		kindBoost: number;
	};
}

/**
 * Context for ranking memories
 */
export interface MemoryRankingContext {
	/** Current bead ID for proximity scoring */
	beadId?: string;

	/** Current epic ID for proximity scoring */
	epicId?: string;

	/** Kinds to prioritize in ranking */
	kinds?: MemoryKind[];
}

// ============================================================================
// Token Budgeting Types
// ============================================================================

/**
 * Memory brief for injection into Claude sessions
 *
 * Contains pre-formatted text and metadata for context window management.
 */
export interface MemoryBrief {
	/** Formatted markdown text ready for injection */
	text: string;

	/** Estimated token count (conservative: chars * 0.25) */
	tokenEstimate: number;

	/** Number of entries included in the brief */
	includedCount: number;

	/** Number of entries truncated due to token budget */
	truncatedCount: number;
}

/**
 * Options for building a memory brief
 */
export interface MemoryBriefOptions {
	/** Maximum tokens to allow (default: 2000) */
	maxTokens?: number;

	/** Prioritize constraints first (default: true) */
	prioritizeConstraints?: boolean;

	/** Include score breakdown in output (default: false) */
	includeScoreBreakdown?: boolean;
}

// ============================================================================
// Action Execution Types
// ============================================================================

/**
 * Record of a Quick Action execution
 *
 * Persisted as an action_report memory entry with structured data.
 */
export interface ActionExecutionRecord {
	/** Unique action ID */
	actionId: string;

	/** Display label for the action */
	label: string;

	/** Original command template */
	command: string;

	/** Command with all variables resolved */
	resolvedCommand: string;

	/** Working directory where command was executed */
	workingDirectory: string;

	/** Profile that was used for execution */
	profileUsed: string;

	/** Environment variables (sanitized - secrets redacted) */
	environment: Record<string, string>;

	/** ISO 8601 timestamp when execution started */
	startedAt: string;

	/** ISO 8601 timestamp when execution completed */
	completedAt: string;

	/** Execution duration in milliseconds */
	durationMs: number;

	/** Process exit code */
	exitCode: number;

	/** Standard output content */
	stdout: string;

	/** Standard error content */
	stderr: string;

	/** Bead context (if available) */
	beadId?: string;

	/** Dashboard session ID (required) */
	sessionId: string;

	/** Claude chat ID (required) */
	chatId: string;

	/** Tracking for "Send to Claude" feature */
	sentToChat?: {
		/** How the result was sent */
		method: 'insert' | 'copy';

		/** ISO 8601 timestamp when sent */
		sentAt: string;
	};
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Response from GET /api/projects/[id]/memory
 */
export interface MemoryListResponse {
	/** List of memory entries */
	memories: MemoryEntry[];

	/** Pagination information */
	pagination: {
		/** Total entries matching the query */
		total: number;

		/** Entries returned in this response */
		returned: number;

		/** Whether more entries exist */
		hasMore: boolean;
	};
}

/**
 * Response from POST /api/projects/[id]/memory
 */
export interface MemoryCreateResponse {
	/** ID of the created entry */
	id: string;

	/** ISO 8601 timestamp when created */
	createdAt: string;
}

/**
 * Response from GET /api/projects/[id]/memory/scoped
 */
export interface ScopedMemoryResponse extends ScopedMemoryResult {
	/** Pre-built memory brief for injection */
	brief: MemoryBrief;
}

/**
 * Response from DELETE /api/projects/[id]/memory/[memId]
 */
export interface MemoryDeleteResponse {
	/** Operation success status */
	success: boolean;

	/** ISO 8601 timestamp when soft-deleted */
	deletedAt: string;
}

/**
 * Query parameters for memory list endpoint
 */
export interface MemoryListQueryParams {
	/** Filter by bead ID */
	beadId?: string;

	/** Filter by epic ID */
	epicId?: string;

	/** Comma-separated list of kinds to filter */
	kinds?: string;

	/** Maximum results (default: 50, max: 100) */
	limit?: number;

	/** Include expired entries */
	includeExpired?: boolean;
}

/**
 * Query parameters for scoped memory endpoint
 */
export interface ScopedMemoryQueryParams {
	/** Bead ID (required) */
	beadId: string;

	/** Override epic lookup */
	epicId?: string;

	/** Token budget for brief (default: 2000) */
	maxTokens?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for memory operations
 */
export type MemoryErrorCode =
	| 'DB_NOT_FOUND'
	| 'DB_CONNECTION_FAILED'
	| 'INVALID_ENTRY'
	| 'ENTRY_NOT_FOUND'
	| 'SCOPE_VIOLATION'
	| 'QUERY_FAILED'
	| 'MISSING_PATH'
	| 'CREATE_FAILED';

/**
 * Error response for memory API
 */
export interface MemoryApiError {
	/** Error code for programmatic handling */
	error: MemoryErrorCode;

	/** Human-readable error message */
	message: string;

	/** Additional error details */
	details?: Record<string, unknown>;
}

/**
 * Validation error details for invalid entries
 */
export interface MemoryValidationError extends MemoryApiError {
	error: 'INVALID_ENTRY';

	/** Field-level validation errors */
	details: {
		/** Error message for kind field */
		kind?: string;

		/** Error message for title field */
		title?: string;

		/** Error message for content field */
		content?: string;

		/** Error message for beadId field */
		beadId?: string;

		/** Error message for projectId field */
		projectId?: string;
	};
}

// ============================================================================
// MCP Types
// ============================================================================

/**
 * Parameters for read_memory MCP tool
 */
export interface McpReadMemoryParams {
	/** Project ID (required) */
	projectId: string;

	/** Bead ID for scoped retrieval (recommended) */
	beadId?: string;

	/** Epic ID for broader scope */
	epicId?: string;

	/** Filter by memory kind */
	kinds?: MemoryKind[];

	/** Max entries to return (default: 20, max: 100) */
	limit?: number;
}

/**
 * Parameters for write_memory MCP tool
 */
export interface McpWriteMemoryParams {
	/** Project ID (required) */
	projectId: string;

	/** Bead ID (preferred) */
	beadId?: string;

	/** Epic ID (fallback scope) */
	epicId?: string;

	/** Type of memory (required) */
	kind: MemoryKind;

	/** Brief title (required) */
	title: string;

	/** Full content (required) */
	content: string;

	/** Links to intent anchor paths */
	intentAnchors?: string[];
}

/**
 * Parameters for search_memory MCP tool
 */
export interface McpSearchMemoryParams {
	/** Project ID (required) */
	projectId: string;

	/** Search query (required) */
	query: string;

	/** Limit to bead scope */
	beadId?: string;

	/** Filter by memory kinds */
	kinds?: MemoryKind[];

	/** Max results (default: 20) */
	limit?: number;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Raw database row for memory_entries table
 *
 * Matches the SQLite schema with snake_case column names.
 */
export interface MemoryEntryRow {
	id: string;
	project_id: string;
	bead_id: string | null;
	epic_id: string | null;
	session_id: string | null;
	chat_id: string | null;
	agent_name: string | null;
	kind: string;
	title: string;
	content: string;
	data: string | null;
	intent_anchors: string | null;
	relevance_score: number;
	expires_at: string | null;
	deleted_at: string | null;
	created_at: string;
}

// ============================================================================
// Cleanup Types
// ============================================================================

/**
 * Result of memory cleanup operation
 */
export interface MemoryCleanupResult {
	/** Number of entries hard-deleted */
	purgedCount: number;

	/** Number of entries soft-deleted (expired) */
	softDeletedCount: number;
}

/**
 * Default retention periods by memory kind (in days)
 */
export const DEFAULT_RETENTION_DAYS: Record<MemoryKind, number | null> = {
	constraint: null, // Never expires
	decision: 90,
	checkpoint: 30,
	next_step: 7,
	action_report: 14,
	ci_note: 30
} as const;

// ============================================================================
// Constants
// ============================================================================

/**
 * Default relevance score for new entries
 */
export const DEFAULT_RELEVANCE_SCORE = 1.0;

/**
 * Minimum relevance score
 */
export const MIN_RELEVANCE_SCORE = 0.0;

/**
 * Maximum relevance score
 */
export const MAX_RELEVANCE_SCORE = 1.0;

/**
 * Default token budget for memory briefs
 */
export const DEFAULT_MEMORY_BRIEF_TOKENS = 2000;

/**
 * Token estimation factor (chars to tokens)
 */
export const TOKENS_PER_CHAR = 0.25;

/**
 * Default limit for memory queries
 */
export const DEFAULT_MEMORY_LIMIT = 50;

/**
 * Maximum limit for memory queries
 */
export const MAX_MEMORY_LIMIT = 100;

/**
 * Number of days for recency decay in ranking
 */
export const RECENCY_DECAY_DAYS = 30;

/**
 * Days to keep soft-deleted entries before hard delete
 */
export const SOFT_DELETE_RETENTION_DAYS = 30;

/**
 * Schema version for memory database
 */
export const MEMORY_SCHEMA_VERSION = 1;
