/**
 * Session Persistence Layer
 *
 * Handles reading and writing sessions to disk.
 * Storage format: .beads/sessions/{id}/meta.json + messages.jsonl
 */

import { mkdir, readFile, writeFile, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
	Session,
	SessionStatus,
	SessionMeta,
	SessionMessage,
	SessionSummary,
	SessionMetrics
} from './session-context-types';
import { DEFAULT_SESSION_METRICS } from './session-context-types';
import { createMemoryEntry } from './memory/db';
import type { CreateMemoryEntry } from './memory/types';
import { DEFAULT_RETENTION_DAYS } from './memory/types';
import { getScopedMemories, rankMemories, buildMemoryBrief } from './memory/retrieval';
import { getParentIssue } from './project-db';

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the sessions directory for a project
 */
export function getSessionsDir(projectPath: string): string {
	return join(projectPath, '.beads', 'sessions');
}

/**
 * Get the directory for a specific session
 */
export function getSessionDir(projectPath: string, sessionId: string): string {
	return join(getSessionsDir(projectPath), sessionId);
}

/**
 * Get the meta.json path for a session
 */
export function getSessionMetaPath(projectPath: string, sessionId: string): string {
	return join(getSessionDir(projectPath, sessionId), 'meta.json');
}

/**
 * Get the messages.jsonl path for a session
 */
export function getSessionMessagesPath(projectPath: string, sessionId: string): string {
	return join(getSessionDir(projectPath, sessionId), 'messages.jsonl');
}

// ============================================================================
// Memory Brief Helpers
// ============================================================================

/**
 * Get the parent epic ID for a bead
 * Queries beads.db to find parent-child relationship
 *
 * @param projectPath - Path to the project root
 * @param beadId - ID of the bead to find the epic for
 * @returns The epic ID if the bead has an epic parent, undefined otherwise
 */
function getEpicIdForBead(projectPath: string, beadId: string): string | undefined {
	try {
		const parent = getParentIssue(projectPath, beadId);
		// Return the parent ID only if the parent is an epic
		if (parent && parent.issue_type === 'epic') {
			return parent.id;
		}
		return undefined;
	} catch (error) {
		// Log but don't fail - database might not be available
		console.error('Failed to get epic for bead:', error);
		return undefined;
	}
}

/**
 * Generate a memory brief for a bead-scoped session
 * Retrieves and ranks relevant memories, then builds a token-budgeted brief
 *
 * @param projectPath - Path to the project root
 * @param projectId - Project ID
 * @param beadId - Bead ID to scope the memories to
 * @param maxTokens - Maximum token budget for the brief (default: 2000)
 * @returns Memory brief text and token estimate, or undefined if no memories
 */
function generateMemoryBrief(
	projectPath: string,
	projectId: string,
	beadId: string,
	maxTokens: number = 2000
): { text: string; tokenEstimate: number } | undefined {
	try {
		const epicId = getEpicIdForBead(projectPath, beadId);

		const scoped = getScopedMemories(projectPath, {
			projectId,
			beadId,
			epicId
		});

		// Combine all memories for ranking
		const allMemories = [
			...scoped.beadMemories,
			...scoped.epicMemories,
			...scoped.activeConstraints
		];

		// Skip if no memories found
		if (allMemories.length === 0) {
			return undefined;
		}

		// Rank memories by relevance to current context
		const ranked = rankMemories(allMemories, {
			beadId,
			epicId
		});

		// Build token-budgeted brief
		const brief = buildMemoryBrief(ranked, { maxTokens });

		// Only return if we have actual content
		if (brief.includedCount === 0) {
			return undefined;
		}

		return {
			text: brief.text,
			tokenEstimate: brief.tokenEstimate
		};
	} catch (error) {
		// Log but don't fail - memory retrieval failure shouldn't break session creation
		console.error('Failed to generate memory brief:', error);
		return undefined;
	}
}

// ============================================================================
// Session CRUD Operations
// ============================================================================

/**
 * Create a new session
 * For bead-scoped sessions, automatically generates a memory brief
 */
export async function createSession(
	projectPath: string,
	options: {
		projectId: string;
		beadId?: string;
		agentId?: string;
		agentName?: string;
		title?: string;
	}
): Promise<Session> {
	const now = new Date().toISOString();
	const session: Session = {
		id: randomUUID(),
		projectId: options.projectId,
		beadId: options.beadId,
		agentId: options.agentId,
		agentName: options.agentName,
		status: 'draft',
		createdAt: now,
		lastActivityAt: now,
		title: options.title,
		metrics: { ...DEFAULT_SESSION_METRICS }
	};

	// Generate memory brief for bead-scoped sessions
	if (options.beadId) {
		const memoryBrief = generateMemoryBrief(
			projectPath,
			options.projectId,
			options.beadId
		);
		if (memoryBrief) {
			session.memoryBrief = memoryBrief.text;
			session.memoryBriefTokens = memoryBrief.tokenEstimate;
		}
	}

	await saveSession(projectPath, session);
	return session;
}

/**
 * Save a session to disk
 */
export async function saveSession(projectPath: string, session: Session): Promise<void> {
	const sessionDir = getSessionDir(projectPath, session.id);

	// Ensure directory exists
	await mkdir(sessionDir, { recursive: true });

	// Write meta.json
	const metaPath = getSessionMetaPath(projectPath, session.id);
	await writeFile(metaPath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Load a session from disk
 */
export async function loadSession(projectPath: string, sessionId: string): Promise<Session | null> {
	const metaPath = getSessionMetaPath(projectPath, sessionId);

	if (!existsSync(metaPath)) {
		return null;
	}

	try {
		const content = await readFile(metaPath, 'utf-8');
		return JSON.parse(content) as Session;
	} catch (error) {
		console.error(`Failed to load session ${sessionId}:`, error);
		return null;
	}
}

/**
 * Delete a session from disk
 */
export async function deleteSession(projectPath: string, sessionId: string): Promise<boolean> {
	const sessionDir = getSessionDir(projectPath, sessionId);

	if (!existsSync(sessionDir)) {
		return false;
	}

	try {
		await rm(sessionDir, { recursive: true });
		return true;
	} catch (error) {
		console.error(`Failed to delete session ${sessionId}:`, error);
		return false;
	}
}

/**
 * List all sessions for a project
 */
export async function listSessions(projectPath: string): Promise<SessionSummary[]> {
	const sessionsDir = getSessionsDir(projectPath);

	if (!existsSync(sessionsDir)) {
		return [];
	}

	try {
		const entries = await readdir(sessionsDir, { withFileTypes: true });
		const summaries: SessionSummary[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const session = await loadSession(projectPath, entry.name);
			if (session) {
				summaries.push({
					id: session.id,
					projectId: session.projectId,
					status: session.status,
					title: session.title,
					agentName: session.agentName,
					beadId: session.beadId,
					createdAt: session.createdAt,
					lastActivityAt: session.lastActivityAt,
					messageCount: session.metrics.messageCount
				});
			}
		}

		// Sort by last activity, most recent first
		return summaries.sort((a, b) =>
			new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
		);
	} catch (error) {
		console.error('Failed to list sessions:', error);
		return [];
	}
}

/**
 * List sessions for a specific project ID
 */
export async function listProjectSessions(
	projectPath: string,
	projectId: string
): Promise<SessionSummary[]> {
	const all = await listSessions(projectPath);
	return all.filter(s => s.projectId === projectId);
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Append a message to a session's messages.jsonl
 */
export async function appendMessage(
	projectPath: string,
	sessionId: string,
	message: Omit<SessionMessage, 'id' | 'sessionId' | 'timestamp'>
): Promise<SessionMessage> {
	const fullMessage: SessionMessage = {
		...message,
		id: randomUUID(),
		sessionId,
		timestamp: new Date().toISOString()
	};

	const messagesPath = getSessionMessagesPath(projectPath, sessionId);
	const line = JSON.stringify(fullMessage) + '\n';

	// Append to file (create if doesn't exist)
	const sessionDir = getSessionDir(projectPath, sessionId);
	await mkdir(sessionDir, { recursive: true });

	// Read existing content and append
	let existingContent = '';
	if (existsSync(messagesPath)) {
		existingContent = await readFile(messagesPath, 'utf-8');
	}
	await writeFile(messagesPath, existingContent + line, 'utf-8');

	// Update session metrics and lastActivityAt
	const session = await loadSession(projectPath, sessionId);
	if (session) {
		session.lastActivityAt = fullMessage.timestamp;
		session.metrics.messageCount++;

		// Update token counts if present
		if (fullMessage.inputTokens) {
			session.metrics.totalInputTokens += fullMessage.inputTokens;
		}
		if (fullMessage.outputTokens) {
			session.metrics.totalOutputTokens += fullMessage.outputTokens;
		}
		if (fullMessage.costUsd) {
			session.metrics.totalCostUsd += fullMessage.costUsd;
		}
		if (fullMessage.toolCalls) {
			session.metrics.toolCallCount += fullMessage.toolCalls.length;
		}

		// If first message, mark session as active
		if (session.status === 'draft') {
			session.status = 'active';
			session.startedAt = fullMessage.timestamp;
		}

		await saveSession(projectPath, session);
	}

	return fullMessage;
}

/**
 * Load all messages for a session
 */
export async function loadMessages(
	projectPath: string,
	sessionId: string
): Promise<SessionMessage[]> {
	const messagesPath = getSessionMessagesPath(projectPath, sessionId);

	if (!existsSync(messagesPath)) {
		return [];
	}

	try {
		const content = await readFile(messagesPath, 'utf-8');
		const lines = content.trim().split('\n').filter(Boolean);
		return lines.map(line => JSON.parse(line) as SessionMessage);
	} catch (error) {
		console.error(`Failed to load messages for session ${sessionId}:`, error);
		return [];
	}
}

/**
 * Load recent messages (last N)
 */
export async function loadRecentMessages(
	projectPath: string,
	sessionId: string,
	limit: number = 50
): Promise<SessionMessage[]> {
	const all = await loadMessages(projectPath, sessionId);
	return all.slice(-limit);
}

// ============================================================================
// Session State Transitions
// ============================================================================

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
	draft: ['active', 'closed'],      // Can start or abandon
	active: ['paused', 'closed'],     // Can pause or complete
	paused: ['active', 'closed'],     // Can resume or close
	closed: []                        // Terminal state
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
	return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition a session to a new status
 */
export async function transitionSession(
	projectPath: string,
	sessionId: string,
	newStatus: SessionStatus
): Promise<Session | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	if (!isValidTransition(session.status, newStatus)) {
		throw new Error(
			`Invalid session transition from '${session.status}' to '${newStatus}'`
		);
	}

	const now = new Date().toISOString();
	session.status = newStatus;
	session.lastActivityAt = now;

	// Set appropriate timestamp
	switch (newStatus) {
		case 'active':
			if (!session.startedAt) {
				session.startedAt = now;
			}
			session.pausedAt = undefined;
			break;
		case 'paused':
			session.pausedAt = now;
			break;
		case 'closed':
			session.closedAt = now;
			break;
	}

	await saveSession(projectPath, session);
	return session;
}

/**
 * Pause a session
 */
export async function pauseSession(
	projectPath: string,
	sessionId: string
): Promise<Session | null> {
	return transitionSession(projectPath, sessionId, 'paused');
}

/**
 * Resume a paused session
 */
export async function resumeSession(
	projectPath: string,
	sessionId: string
): Promise<Session | null> {
	return transitionSession(projectPath, sessionId, 'active');
}

/**
 * Close a session
 * Auto-captures a checkpoint before closing if the session has a beadId and messages
 */
export async function closeSession(
	projectPath: string,
	sessionId: string,
	summary?: string
): Promise<Session | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	// Auto-capture checkpoint before closing (if scoped and has messages)
	if (session.beadId && session.metrics.messageCount > 0) {
		await captureSessionCheckpoint(projectPath, sessionId, {
			trigger: 'session_end',
			summary
		});
	}

	if (summary) {
		session.summary = summary;
	}

	await saveSession(projectPath, session);
	return transitionSession(projectPath, sessionId, 'closed');
}

// ============================================================================
// Session Utilities
// ============================================================================

/**
 * Update session title
 */
export async function updateSessionTitle(
	projectPath: string,
	sessionId: string,
	title: string
): Promise<Session | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	session.title = title;
	session.lastActivityAt = new Date().toISOString();
	await saveSession(projectPath, session);
	return session;
}

/**
 * Update session summary
 */
export async function updateSessionSummary(
	projectPath: string,
	sessionId: string,
	summary: string
): Promise<Session | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	session.summary = summary;
	session.lastActivityAt = new Date().toISOString();
	await saveSession(projectPath, session);
	return session;
}

/**
 * Add tags to a session
 */
export async function addSessionTags(
	projectPath: string,
	sessionId: string,
	tags: string[]
): Promise<Session | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	const existingTags = new Set(session.tags || []);
	tags.forEach(tag => existingTags.add(tag));
	session.tags = Array.from(existingTags);
	session.lastActivityAt = new Date().toISOString();

	await saveSession(projectPath, session);
	return session;
}

/**
 * Get active session for a project (if any)
 */
export async function getActiveSession(
	projectPath: string,
	projectId: string
): Promise<Session | null> {
	const summaries = await listProjectSessions(projectPath, projectId);
	const active = summaries.find(s => s.status === 'active');

	if (active) {
		return loadSession(projectPath, active.id);
	}

	return null;
}

// ============================================================================
// Session Checkpoint Capture
// ============================================================================

/**
 * Checkpoint trigger types
 */
export type CheckpointTrigger = 'session_end' | 'compaction' | 'manual';

/**
 * Build a checkpoint summary from recent messages
 * Used when no explicit summary is provided
 */
function buildCheckpointSummary(messages: SessionMessage[]): string {
	// Get the last user and assistant messages
	const userMessages = messages.filter(m => m.role === 'user');
	const assistantMessages = messages.filter(m => m.role === 'assistant');

	const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
	const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]?.content || '';

	// Truncate to 500 chars each
	const truncatedUser = lastUserMsg.slice(0, 500) + (lastUserMsg.length > 500 ? '...' : '');
	const truncatedAssistant = lastAssistantMsg.slice(0, 500) + (lastAssistantMsg.length > 500 ? '...' : '');

	return `### Last Exchange

**User:** ${truncatedUser}

**Assistant:** ${truncatedAssistant}`;
}

/**
 * Build the full checkpoint content with metadata
 */
function buildCheckpointContent(
	session: Session,
	trigger: CheckpointTrigger,
	lastExchangeSummary: string
): string {
	const durationDisplay = session.metrics.durationMs > 0
		? `${Math.round(session.metrics.durationMs / 1000)}s`
		: 'N/A';

	return `## Session Checkpoint

**Trigger:** ${trigger}
**Session:** ${session.id}
**Bead:** ${session.beadId || 'N/A'}
**Duration:** ${durationDisplay}
**Messages:** ${session.metrics.messageCount}

${lastExchangeSummary}`;
}

/**
 * Capture a checkpoint from the current session
 * Creates a memory entry with kind='checkpoint'
 *
 * @param projectPath - Path to the project root
 * @param sessionId - ID of the session to checkpoint
 * @param options - Checkpoint options
 * @returns The ID of the created memory entry, or null if unable to create
 */
export async function captureSessionCheckpoint(
	projectPath: string,
	sessionId: string,
	options?: {
		trigger: CheckpointTrigger;
		summary?: string;
	}
): Promise<string | null> {
	const session = await loadSession(projectPath, sessionId);
	if (!session) {
		return null;
	}

	// Only create checkpoint if session has a beadId (scoped session)
	if (!session.beadId) {
		return null;
	}

	// Only create if session has messages
	if (session.metrics.messageCount === 0) {
		return null;
	}

	const trigger = options?.trigger || 'manual';

	// Load recent messages to build summary
	const recentMessages = await loadRecentMessages(projectPath, sessionId, 10);

	// Build summary: use provided summary or auto-generate from messages
	let lastExchangeSummary: string;
	if (options?.summary) {
		lastExchangeSummary = `### Summary\n\n${options.summary}`;
	} else {
		lastExchangeSummary = buildCheckpointSummary(recentMessages);
	}

	// Build the full checkpoint content
	const content = buildCheckpointContent(session, trigger, lastExchangeSummary);

	// Calculate expiration (30 days from now for checkpoints)
	const retentionDays = DEFAULT_RETENTION_DAYS.checkpoint ?? 30;
	const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

	// Create the memory entry
	try {
		const memoryEntry: CreateMemoryEntry = {
			projectId: session.projectId,
			beadId: session.beadId,
			sessionId: session.id,
			agentName: session.agentName,
			kind: 'checkpoint',
			title: `Session checkpoint (${trigger})`,
			content,
			data: {
				trigger,
				messageCount: session.metrics.messageCount,
				durationMs: session.metrics.durationMs,
				totalInputTokens: session.metrics.totalInputTokens,
				totalOutputTokens: session.metrics.totalOutputTokens,
				toolCallCount: session.metrics.toolCallCount
			},
			expiresAt
		};

		const entryId = createMemoryEntry(projectPath, memoryEntry);
		return entryId;
	} catch (error) {
		// Log but don't throw - checkpoint failure shouldn't break session close
		console.error('Failed to capture session checkpoint:', error);
		return null;
	}
}
