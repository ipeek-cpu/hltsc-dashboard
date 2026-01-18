import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { sessionStore } from '$lib/session-store';
import { getOrCreateClaudeProcess } from '$lib/chat-manager';
import { parseFrontmatter } from '$lib/agents';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RequestHandler } from './$types';

// Debug logging for production
const LOG_FILE = path.join(os.homedir(), '.beads-dashboard', 'chat-api.log');

function logDebug(message: string): void {
	try {
		const timestamp = new Date().toISOString();
		const logLine = `[${timestamp}] ${message}\n`;
		fs.appendFileSync(LOG_FILE, logLine);
	} catch {
		// Ignore log errors
	}
}

logDebug('chat/+server.ts module loaded');

/**
 * GET - List all chat sessions for a project
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const sessions = sessionStore.getForProject(params.id);

	return json({
		sessions: sessions.map(s => ({
			id: s.id,
			agentFilename: s.agentFilename,
			agentName: s.agentName,
			createdAt: s.createdAt,
			lastActivity: s.lastActivity,
			messageCount: s.messageHistory.length
		}))
	});
};

/**
 * POST - Create a new chat session
 * Body: { agentFilename?: string, model?: 'opus' | 'sonnet' | 'haiku', mode?: 'agent' | 'plan' | 'ask' }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	logDebug(`POST /api/projects/${params.id}/chat called`);

	try {
		const project = getProjectById(params.id);
		logDebug(`Project lookup result: ${project ? project.name : 'null'}`);

		if (!project) {
			logDebug('Project not found, returning 404');
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const body = await request.json().catch(() => ({}));
		const { agentFilename, model = 'opus', mode = 'agent' } = body as {
			agentFilename?: string;
			model?: 'opus' | 'sonnet' | 'haiku';
			mode?: 'agent' | 'plan' | 'ask';
		};
		logDebug(`Request body: agentFilename=${agentFilename}, model=${model}, mode=${mode}`);

		let agentName: string | undefined;
		let agentPrompt: string | undefined;

		// If agent specified, load its content
		if (agentFilename) {
			const agentPath = path.join(project.path, '.claude', 'agents', agentFilename);
			if (fs.existsSync(agentPath)) {
				try {
					const rawContent = fs.readFileSync(agentPath, 'utf-8');
					const { frontmatter, content } = parseFrontmatter(rawContent);
					agentName = frontmatter.name;
					agentPrompt = rawContent; // Use full content as prompt
				} catch (err) {
					logDebug(`Error reading agent file: ${err}`);
					console.error('Error reading agent file:', err);
				}
			}
		}

		logDebug('Creating session in sessionStore');
		const session = sessionStore.create(params.id, agentFilename, agentName);
		logDebug(`Session created: ${session.id}`);

		// Store agent prompt in session for later use
		if (agentPrompt) {
			sessionStore.update(session.id, {
				// @ts-expect-error - extending session with agentPrompt
				agentPrompt
			});
		}

		// Start the Claude process immediately so it's ready when user sends first message
		logDebug(`Calling getOrCreateClaudeProcess for session: ${session.id}`);
		console.log('[Chat API] Starting Claude process for session:', session.id, 'model:', model, 'mode:', mode);
		const claudeProcess = getOrCreateClaudeProcess(session.id, params.id, agentPrompt, model, mode);
		logDebug(`getOrCreateClaudeProcess returned: ${claudeProcess ? 'session object' : 'null'}`);

		if (!claudeProcess) {
			// Clean up the session if Claude couldn't start
			logDebug('Claude process is null, cleaning up session and returning 500');
			sessionStore.delete(session.id);
			return json({ error: 'Failed to start Claude process' }, { status: 500 });
		}

		logDebug('Returning success response');
		return json({
			sessionId: session.id,
			agentFilename: session.agentFilename,
			agentName: session.agentName,
			createdAt: session.createdAt
		});
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : '';
		logDebug(`EXCEPTION in POST handler: ${errorMsg}`);
		logDebug(`Stack trace: ${errorStack}`);
		console.error('[Chat API] Exception:', err);
		return json({ error: 'Internal error', details: errorMsg }, { status: 500 });
	}
};

/**
 * DELETE - Cleanup old sessions
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const cleaned = sessionStore.cleanup();

	return json({ cleaned });
};
