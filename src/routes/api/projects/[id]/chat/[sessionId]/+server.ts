import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { sessionStore } from '$lib/session-store';
import {
	getOrCreateClaudeProcess,
	sendMessageToProcess,
	closeClaudeSession
} from '$lib/chat-manager';
import type { RequestHandler } from './$types';

/**
 * GET - Get session details and message history
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const session = sessionStore.get(params.sessionId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({
		id: session.id,
		projectId: session.projectId,
		agentFilename: session.agentFilename,
		agentName: session.agentName,
		createdAt: session.createdAt,
		lastActivity: session.lastActivity,
		messages: session.messageHistory
	});
};

/**
 * POST - Send a message to the chat session
 * Body: { message: string }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const session = sessionStore.get(params.sessionId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const body = await request.json().catch(() => ({}));
	const { message } = body as { message?: string };

	if (!message || typeof message !== 'string') {
		return json({ error: 'Message is required' }, { status: 400 });
	}

	// Add user message to history
	sessionStore.addMessage(params.sessionId, {
		role: 'user',
		content: message
	});

	// Get or create Claude process for this session
	// @ts-expect-error - agentPrompt is dynamically added
	const agentPrompt = session.agentPrompt as string | undefined;
	const claudeProcess = getOrCreateClaudeProcess(params.sessionId, params.id, agentPrompt);

	if (!claudeProcess) {
		return json({ error: 'Failed to create Claude process' }, { status: 500 });
	}

	// Add assistant message placeholder (will be updated by streaming)
	sessionStore.addMessage(params.sessionId, {
		role: 'assistant',
		content: '',
		isStreaming: true
	});

	// Send message to Claude
	sendMessageToProcess(params.sessionId, message);

	return json({ success: true });
};

/**
 * DELETE - Close the session and cleanup
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const session = sessionStore.get(params.sessionId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	// Close Claude process if exists
	closeClaudeSession(params.sessionId);

	// Delete session
	sessionStore.delete(params.sessionId);

	return json({ success: true });
};
