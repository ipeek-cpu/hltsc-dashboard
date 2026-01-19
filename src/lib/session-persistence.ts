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
// Session CRUD Operations
// ============================================================================

/**
 * Create a new session
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
