/**
 * Session context API - CRUD operations for session contexts
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	loadSessionContextStore,
	createSessionContext,
	getAllSessionContexts,
	getRecentSessionContexts,
	getMostRecentSession,
	getSessionContextForInjection,
	hasSessionContextDir
} from '$lib/session-context';

/**
 * GET /api/projects/[id]/sessions
 * Get all session contexts for a project
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const limit = url.searchParams.get('limit');
		const forInjection = url.searchParams.get('forInjection') === 'true';

		// If requesting context for injection, return formatted string
		if (forInjection) {
			const contextString = getSessionContextForInjection(project.path);
			return json({
				context: contextString
			});
		}

		// Get sessions with optional limit
		const sessions = limit
			? getRecentSessionContexts(project.path, parseInt(limit, 10))
			: getAllSessionContexts(project.path);

		// Get most recent session for summary
		const mostRecent = getMostRecentSession(project.path);

		return json({
			sessions,
			mostRecent,
			hasSessionContextDir: hasSessionContextDir(project.path),
			total: sessions.length
		});
	} catch (err) {
		console.error('Error loading sessions:', err);
		throw error(500, 'Failed to load sessions');
	}
};

/**
 * POST /api/projects/[id]/sessions
 * Create a new session context
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { sessionId, summary, keyDecisions, nextSteps } = body;

		const session = createSessionContext(project.path, {
			sessionId,
			summary,
			keyDecisions,
			nextSteps
		});

		return json({
			success: true,
			session
		});
	} catch (err) {
		console.error('Error creating session:', err);
		throw error(500, 'Failed to create session');
	}
};
