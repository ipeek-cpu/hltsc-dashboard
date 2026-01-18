/**
 * Chat session manager - handles Claude processes and SSE broadcasts
 * Separated from endpoints to avoid invalid export errors in SvelteKit
 */
import {
	createClaudeSession,
	sendMessage as claudeSend,
	cancelResponse as claudeCancel,
	closeSession as claudeClose,
	type ClaudeSession,
	type ClaudeOutputChunk,
	type ClaudeModel,
	type ChatMode
} from '$lib/claude-cli';
import { sessionStore } from '$lib/session-store';
import { getProjectById } from '$lib/dashboard-db';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Debug logging for production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'chat-manager.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

logDebug('chat-manager.ts module loaded');

// Store for active Claude processes per session
const claudeProcesses = new Map<string, ClaudeSession>();

// Store for SSE controllers per session (to push updates)
const sseControllers = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Get or create a Claude process for a session
 */
export function getOrCreateClaudeProcess(
	sessionId: string,
	projectId: string,
	agentPrompt?: string,
	model: ClaudeModel = 'opus',
	mode: ChatMode = 'agent'
): ClaudeSession | null {
	logDebug(`getOrCreateClaudeProcess called: sessionId=${sessionId}, projectId=${projectId}, model=${model}, mode=${mode}`);

	const existingProcess = claudeProcesses.get(sessionId);
	if (existingProcess) {
		logDebug('Returning existing process');
		return existingProcess;
	}

	const project = getProjectById(projectId);
	logDebug(`Project lookup: ${project ? project.name : 'null'}`);
	if (!project) {
		logDebug('Project not found, returning null');
		return null;
	}

	// Create new Claude session
	logDebug(`Creating new Claude session for path: ${project.path}`);
	const claudeProcess = createClaudeSession({
		projectPath: project.path,
		agentPrompt,
		model,
		mode,
		onData: (chunk: ClaudeOutputChunk) => {
			handleClaudeOutput(sessionId, chunk);
		},
		onError: (error: Error) => {
			logDebug(`Claude session error: ${error.message}`);
			broadcastToSession(sessionId, {
				type: 'error',
				content: error.message
			});
		},
		onClose: (code: number) => {
			logDebug(`Claude session closed with code: ${code}`);
			claudeProcesses.delete(sessionId);
			broadcastToSession(sessionId, {
				type: 'system',
				content: `Session ended (code: ${code})`
			});
		}
	});

	logDebug(`createClaudeSession returned: ${claudeProcess ? 'session object' : 'null'}`);

	// createClaudeSession can return null if Claude CLI is not configured
	if (!claudeProcess) {
		logDebug('Claude process is null, returning null');
		return null;
	}

	claudeProcesses.set(sessionId, claudeProcess);
	logDebug('Claude process stored and returning');
	return claudeProcess;
}

/**
 * Send a message to a Claude process
 */
export function sendMessageToProcess(sessionId: string, message: string): boolean {
	const claudeProcess = claudeProcesses.get(sessionId);
	if (!claudeProcess) return false;

	claudeSend(
		claudeProcess,
		message,
		// onData callback - handle streaming chunks
		(chunk: ClaudeOutputChunk) => {
			handleClaudeOutput(sessionId, chunk);
		},
		// onError callback
		(error: Error) => {
			broadcastToSession(sessionId, {
				type: 'error',
				content: error.message
			});
		},
		// onClose callback
		(code: number) => {
			broadcastToSession(sessionId, {
				type: 'system',
				content: `Response complete (exit code: ${code})`
			});
		}
	);
	return true;
}

/**
 * Cancel current response for a session
 */
export function cancelSessionResponse(sessionId: string): void {
	const claudeProcess = claudeProcesses.get(sessionId);
	if (claudeProcess) {
		claudeCancel(claudeProcess);
	}
}

/**
 * Close a Claude session
 */
export function closeClaudeSession(sessionId: string): void {
	const claudeProcess = claudeProcesses.get(sessionId);
	if (claudeProcess) {
		claudeClose(claudeProcess);
		claudeProcesses.delete(sessionId);
	}
}

/**
 * Handle output chunks from Claude and broadcast to SSE clients
 */
function handleClaudeOutput(sessionId: string, chunk: ClaudeOutputChunk) {
	switch (chunk.type) {
		case 'text':
			// Append to last message
			sessionStore.appendToLastMessage(sessionId, chunk.content || '');
			break;

		case 'tool_use':
			// Add tool call to last message
			sessionStore.addToolCallToLastMessage(sessionId, {
				name: chunk.toolName || 'unknown',
				input: chunk.toolInput || {}
			});
			break;

		case 'tool_result':
			// Update last tool call with result
			const session = sessionStore.get(sessionId);
			if (session && session.messageHistory.length > 0) {
				const lastMsg = session.messageHistory[session.messageHistory.length - 1];
				if (lastMsg.toolCalls && lastMsg.toolCalls.length > 0) {
					lastMsg.toolCalls[lastMsg.toolCalls.length - 1].result = chunk.toolResult;
				}
			}
			break;

		case 'done':
			// Mark message as no longer streaming
			sessionStore.updateLastMessage(sessionId, { isStreaming: false });
			break;

		case 'error':
			// Update message with error
			sessionStore.appendToLastMessage(sessionId, `\n\nError: ${chunk.content}`);
			sessionStore.updateLastMessage(sessionId, { isStreaming: false });
			break;

		case 'auth_expired':
			// Auth expired - stop streaming and notify UI
			sessionStore.updateLastMessage(sessionId, { isStreaming: false });
			// Clear the session since auth is invalid
			claudeProcesses.delete(sessionId);
			break;

		case 'status':
			// Status updates are just for display, no session storage needed
			break;

		case 'system':
			// System messages are just for display
			break;
	}

	// Broadcast to all SSE clients for this session
	broadcastToSession(sessionId, chunk);
}

/**
 * Broadcast a chunk to all SSE clients watching a session
 */
export function broadcastToSession(sessionId: string, chunk: ClaudeOutputChunk | { type: string; content?: string }) {
	const controllers = sseControllers.get(sessionId);
	if (!controllers) return;

	const encoder = new TextEncoder();
	const data = `data: ${JSON.stringify(chunk)}\n\n`;

	for (const controller of controllers) {
		try {
			controller.enqueue(encoder.encode(data));
		} catch {
			// Controller might be closed
			controllers.delete(controller);
		}
	}
}

/**
 * Register an SSE controller for a session
 */
export function registerSSEController(sessionId: string, controller: ReadableStreamDefaultController) {
	if (!sseControllers.has(sessionId)) {
		sseControllers.set(sessionId, new Set());
	}
	sseControllers.get(sessionId)!.add(controller);
}

/**
 * Unregister an SSE controller
 */
export function unregisterSSEController(sessionId: string, controller: ReadableStreamDefaultController) {
	const controllers = sseControllers.get(sessionId);
	if (controllers) {
		controllers.delete(controller);
		if (controllers.size === 0) {
			sseControllers.delete(sessionId);
		}
	}
}
