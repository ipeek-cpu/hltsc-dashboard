import { json } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import { sessionStore } from '$lib/session-store';
import { cancelSessionResponse } from '$lib/chat-manager';
import type { RequestHandler } from './$types';

/**
 * POST - Cancel the current streaming response
 */
export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const session = sessionStore.get(params.sessionId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	// Cancel the response
	cancelSessionResponse(params.sessionId);

	// Mark last message as no longer streaming
	sessionStore.updateLastMessage(params.sessionId, { isStreaming: false });

	return json({ success: true });
};
