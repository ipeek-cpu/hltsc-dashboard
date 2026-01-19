/**
 * Session context detail API - Get/Update/Delete a specific session
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	getSessionContext,
	updateSessionContext,
	endSessionContext,
	deleteSessionContext
} from '$lib/session-context';

/**
 * GET /api/projects/[id]/sessions/[sessionId]
 * Get a specific session context
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id: projectId, sessionId } = params;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const session = getSessionContext(project.path, sessionId);

		if (!session) {
			throw error(404, 'Session not found');
		}

		return json({
			session
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error loading session:', err);
		throw error(500, 'Failed to load session');
	}
};

/**
 * PATCH /api/projects/[id]/sessions/[sessionId]
 * Update a session context
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id: projectId, sessionId } = params;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { endSession, ...updates } = body;

		let session;

		if (endSession) {
			// End the session with metrics
			session = endSessionContext(project.path, sessionId, updates);
		} else {
			// Regular update
			session = updateSessionContext(project.path, sessionId, updates);
		}

		if (!session) {
			throw error(404, 'Session not found');
		}

		return json({
			success: true,
			session
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error updating session:', err);
		throw error(500, 'Failed to update session');
	}
};

/**
 * DELETE /api/projects/[id]/sessions/[sessionId]
 * Delete a session context
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const { id: projectId, sessionId } = params;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const deleted = deleteSessionContext(project.path, sessionId);

		if (!deleted) {
			throw error(404, 'Session not found');
		}

		return json({
			success: true,
			deleted: sessionId
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error deleting session:', err);
		throw error(500, 'Failed to delete session');
	}
};
