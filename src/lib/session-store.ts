import { randomUUID } from 'crypto';
import type { ClaudeSession } from './claude-cli';

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	toolCalls?: ToolCall[];
	isStreaming?: boolean;
}

export interface ToolCall {
	name: string;
	input: Record<string, unknown>;
	result?: unknown;
	error?: string;
	startedAt?: Date;
	completedAt?: Date;
}

export interface ChatSession {
	id: string;
	projectId: string;
	agentFilename?: string;  // null = general assistant
	agentName?: string;
	createdAt: Date;
	lastActivity: Date;
	messageHistory: ChatMessage[];
	claudeSession?: ClaudeSession;
}

// In-memory session store
const sessions = new Map<string, ChatSession>();

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Create a new chat session
 */
export function createSession(projectId: string, agentFilename?: string, agentName?: string): ChatSession {
	const session: ChatSession = {
		id: randomUUID(),
		projectId,
		agentFilename,
		agentName,
		createdAt: new Date(),
		lastActivity: new Date(),
		messageHistory: []
	};

	sessions.set(session.id, session);
	return session;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): ChatSession | undefined {
	const session = sessions.get(sessionId);
	if (session) {
		session.lastActivity = new Date();
	}
	return session;
}

/**
 * Get all sessions for a project
 */
export function getProjectSessions(projectId: string): ChatSession[] {
	return Array.from(sessions.values())
		.filter(s => s.projectId === projectId)
		.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}

/**
 * Update a session
 */
export function updateSession(sessionId: string, updates: Partial<ChatSession>): ChatSession | undefined {
	const session = sessions.get(sessionId);
	if (session) {
		Object.assign(session, updates);
		session.lastActivity = new Date();
		return session;
	}
	return undefined;
}

/**
 * Add a message to a session
 */
export function addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage | undefined {
	const session = sessions.get(sessionId);
	if (session) {
		const fullMessage: ChatMessage = {
			...message,
			id: randomUUID(),
			timestamp: new Date()
		};
		session.messageHistory.push(fullMessage);
		session.lastActivity = new Date();
		return fullMessage;
	}
	return undefined;
}

/**
 * Update the last message (for streaming)
 */
export function updateLastMessage(sessionId: string, updates: Partial<ChatMessage>): ChatMessage | undefined {
	const session = sessions.get(sessionId);
	if (session && session.messageHistory.length > 0) {
		const lastMessage = session.messageHistory[session.messageHistory.length - 1];
		Object.assign(lastMessage, updates);
		session.lastActivity = new Date();
		return lastMessage;
	}
	return undefined;
}

/**
 * Append content to the last message (for streaming)
 */
export function appendToLastMessage(sessionId: string, content: string): ChatMessage | undefined {
	const session = sessions.get(sessionId);
	if (session && session.messageHistory.length > 0) {
		const lastMessage = session.messageHistory[session.messageHistory.length - 1];
		lastMessage.content += content;
		session.lastActivity = new Date();
		return lastMessage;
	}
	return undefined;
}

/**
 * Add a tool call to the last message
 */
export function addToolCallToLastMessage(sessionId: string, toolCall: ToolCall): ChatMessage | undefined {
	const session = sessions.get(sessionId);
	if (session && session.messageHistory.length > 0) {
		const lastMessage = session.messageHistory[session.messageHistory.length - 1];
		if (!lastMessage.toolCalls) {
			lastMessage.toolCalls = [];
		}
		lastMessage.toolCalls.push(toolCall);
		session.lastActivity = new Date();
		return lastMessage;
	}
	return undefined;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
	return sessions.delete(sessionId);
}

/**
 * Cleanup stale sessions
 */
export function cleanupStaleSessions(): number {
	const now = Date.now();
	let cleaned = 0;

	for (const [id, session] of sessions) {
		if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
			sessions.delete(id);
			cleaned++;
		}
	}

	return cleaned;
}

/**
 * Get session count
 */
export function getSessionCount(): number {
	return sessions.size;
}

// Export session store as object for convenience
export const sessionStore = {
	create: createSession,
	get: getSession,
	getForProject: getProjectSessions,
	update: updateSession,
	addMessage,
	updateLastMessage,
	appendToLastMessage,
	addToolCallToLastMessage,
	delete: deleteSession,
	cleanup: cleanupStaleSessions,
	count: getSessionCount
};
