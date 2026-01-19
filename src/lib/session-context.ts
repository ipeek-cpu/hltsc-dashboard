/**
 * Session context persistence - stores session summaries, known issues, and carryover context
 * Data is stored as JSON files in .claude/sessions/
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
	SessionContext,
	SessionContextStore,
	KnownIssue,
	KnownIssueType,
	KnownIssueStatus
} from './session-context-types';
import { DEFAULT_SESSION_CONTEXT_STORE } from './session-context-types';

const CLAUDE_DIR = '.claude';
const SESSIONS_DIR = 'sessions';
const STORE_FILE = 'context-store.json';

/**
 * Get the session context directory path for a project
 */
export function getSessionContextDir(projectPath: string): string {
	return path.join(projectPath, CLAUDE_DIR, SESSIONS_DIR);
}

/**
 * Get the context store file path
 */
export function getStoreFilePath(projectPath: string): string {
	return path.join(getSessionContextDir(projectPath), STORE_FILE);
}

/**
 * Ensure the sessions directory exists
 */
export function ensureSessionContextDir(projectPath: string): string {
	const sessionsDir = getSessionContextDir(projectPath);
	const claudeDir = path.join(projectPath, CLAUDE_DIR);

	if (!fs.existsSync(claudeDir)) {
		fs.mkdirSync(claudeDir, { recursive: true });
	}

	if (!fs.existsSync(sessionsDir)) {
		fs.mkdirSync(sessionsDir, { recursive: true });
	}

	return sessionsDir;
}

/**
 * Load the session context store from disk
 */
export function loadSessionContextStore(projectPath: string): SessionContextStore {
	const storePath = getStoreFilePath(projectPath);

	if (!fs.existsSync(storePath)) {
		return { ...DEFAULT_SESSION_CONTEXT_STORE };
	}

	try {
		const content = fs.readFileSync(storePath, 'utf-8');
		const store = JSON.parse(content) as SessionContextStore;
		return {
			...DEFAULT_SESSION_CONTEXT_STORE,
			...store
		};
	} catch (err) {
		console.error('Error loading session context store:', err);
		return { ...DEFAULT_SESSION_CONTEXT_STORE };
	}
}

/**
 * Save the session context store to disk
 */
export function saveSessionContextStore(
	projectPath: string,
	store: SessionContextStore
): void {
	ensureSessionContextDir(projectPath);
	const storePath = getStoreFilePath(projectPath);

	store.lastUpdated = new Date().toISOString();
	fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

// ============================================
// Session Context Operations
// ============================================

/**
 * Create a new session context
 */
export function createSessionContext(
	projectPath: string,
	data: Partial<SessionContext> = {}
): SessionContext {
	const store = loadSessionContextStore(projectPath);

	const session: SessionContext = {
		id: randomUUID(),
		projectId: path.basename(projectPath),
		createdAt: new Date().toISOString(),
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalCostUsd: 0,
		durationMs: 0,
		knownIssues: [],
		...data
	};

	store.sessions.unshift(session); // Add at beginning (most recent first)
	saveSessionContextStore(projectPath, store);

	return session;
}

/**
 * Get a session context by ID
 */
export function getSessionContext(
	projectPath: string,
	sessionId: string
): SessionContext | null {
	const store = loadSessionContextStore(projectPath);
	return store.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Get all session contexts for a project
 */
export function getAllSessionContexts(projectPath: string): SessionContext[] {
	const store = loadSessionContextStore(projectPath);
	return store.sessions;
}

/**
 * Get recent session contexts (last N)
 */
export function getRecentSessionContexts(
	projectPath: string,
	limit: number = 10
): SessionContext[] {
	const store = loadSessionContextStore(projectPath);
	return store.sessions.slice(0, limit);
}

/**
 * Update a session context
 */
export function updateSessionContext(
	projectPath: string,
	sessionId: string,
	updates: Partial<SessionContext>
): SessionContext | null {
	const store = loadSessionContextStore(projectPath);
	const index = store.sessions.findIndex((s) => s.id === sessionId);

	if (index === -1) {
		return null;
	}

	store.sessions[index] = {
		...store.sessions[index],
		...updates
	};

	saveSessionContextStore(projectPath, store);
	return store.sessions[index];
}

/**
 * End a session (set endedAt and update metrics)
 */
export function endSessionContext(
	projectPath: string,
	sessionId: string,
	metrics: {
		totalInputTokens?: number;
		totalOutputTokens?: number;
		totalCostUsd?: number;
		durationMs?: number;
		summary?: string;
		keyDecisions?: string[];
		nextSteps?: string[];
	}
): SessionContext | null {
	return updateSessionContext(projectPath, sessionId, {
		endedAt: new Date().toISOString(),
		...metrics
	});
}

/**
 * Delete a session context
 */
export function deleteSessionContext(
	projectPath: string,
	sessionId: string
): boolean {
	const store = loadSessionContextStore(projectPath);
	const index = store.sessions.findIndex((s) => s.id === sessionId);

	if (index === -1) {
		return false;
	}

	store.sessions.splice(index, 1);
	saveSessionContextStore(projectPath, store);
	return true;
}

/**
 * Get the most recent session context
 */
export function getMostRecentSession(projectPath: string): SessionContext | null {
	const store = loadSessionContextStore(projectPath);
	return store.sessions[0] || null;
}

/**
 * Get session context summary for injection into new sessions
 */
export function getSessionContextForInjection(projectPath: string): string {
	const store = loadSessionContextStore(projectPath);

	// Get active known issues
	const activeIssues = store.knownIssues.filter((i) => i.status === 'active');

	// Get most recent session with summary/next steps
	const recentSession = store.sessions.find((s) => s.summary || s.nextSteps?.length);

	let context = '';

	if (activeIssues.length > 0) {
		context += `## Known Issues (Do Not Fix Unless Instructed)\n\n`;
		for (const issue of activeIssues) {
			const typeLabel = issue.type === 'ci_failure' ? 'CI' :
				issue.type === 'blocker' ? 'Blocker' :
				issue.type === 'bug' ? 'Bug' : 'Note';
			context += `- [${typeLabel}] ${issue.title}`;
			if (issue.description) {
				context += ` - ${issue.description}`;
			}
			context += '\n';
		}
		context += '\n';
	}

	if (recentSession?.summary) {
		context += `## Previous Session Summary\n\n${recentSession.summary}\n\n`;
	}

	if (recentSession?.nextSteps && recentSession.nextSteps.length > 0) {
		context += `## Next Steps from Last Session\n\n`;
		recentSession.nextSteps.forEach((step, i) => {
			context += `${i + 1}. ${step}\n`;
		});
		context += '\n';
	}

	return context.trim();
}

// ============================================
// Known Issues Operations
// ============================================

/**
 * Create a new known issue
 */
export function createKnownIssue(
	projectPath: string,
	data: {
		type: KnownIssueType;
		title: string;
		description?: string;
	}
): KnownIssue {
	const store = loadSessionContextStore(projectPath);

	const issue: KnownIssue = {
		id: randomUUID(),
		type: data.type,
		title: data.title,
		description: data.description || '',
		status: 'active',
		createdAt: new Date().toISOString()
	};

	store.knownIssues.unshift(issue);
	saveSessionContextStore(projectPath, store);

	return issue;
}

/**
 * Get a known issue by ID
 */
export function getKnownIssue(
	projectPath: string,
	issueId: string
): KnownIssue | null {
	const store = loadSessionContextStore(projectPath);
	return store.knownIssues.find((i) => i.id === issueId) || null;
}

/**
 * Get all known issues
 */
export function getAllKnownIssues(projectPath: string): KnownIssue[] {
	const store = loadSessionContextStore(projectPath);
	return store.knownIssues;
}

/**
 * Get active known issues
 */
export function getActiveKnownIssues(projectPath: string): KnownIssue[] {
	const store = loadSessionContextStore(projectPath);
	return store.knownIssues.filter((i) => i.status === 'active');
}

/**
 * Update a known issue
 */
export function updateKnownIssue(
	projectPath: string,
	issueId: string,
	updates: Partial<KnownIssue>
): KnownIssue | null {
	const store = loadSessionContextStore(projectPath);
	const index = store.knownIssues.findIndex((i) => i.id === issueId);

	if (index === -1) {
		return null;
	}

	store.knownIssues[index] = {
		...store.knownIssues[index],
		...updates
	};

	saveSessionContextStore(projectPath, store);
	return store.knownIssues[index];
}

/**
 * Mark a known issue as resolved
 */
export function resolveKnownIssue(
	projectPath: string,
	issueId: string
): KnownIssue | null {
	return updateKnownIssue(projectPath, issueId, {
		status: 'resolved',
		resolvedAt: new Date().toISOString()
	});
}

/**
 * Delete a known issue
 */
export function deleteKnownIssue(
	projectPath: string,
	issueId: string
): boolean {
	const store = loadSessionContextStore(projectPath);
	const index = store.knownIssues.findIndex((i) => i.id === issueId);

	if (index === -1) {
		return false;
	}

	store.knownIssues.splice(index, 1);
	saveSessionContextStore(projectPath, store);
	return true;
}

/**
 * Check if session context directory exists
 */
export function hasSessionContextDir(projectPath: string): boolean {
	return fs.existsSync(getSessionContextDir(projectPath));
}
