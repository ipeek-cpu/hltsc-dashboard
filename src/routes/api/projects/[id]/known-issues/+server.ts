/**
 * Known issues API - CRUD operations for known issues
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	getAllKnownIssues,
	getActiveKnownIssues,
	createKnownIssue,
	updateKnownIssue,
	resolveKnownIssue,
	deleteKnownIssue
} from '$lib/session-context';
import type { KnownIssueType } from '$lib/session-context-types';

/**
 * GET /api/projects/[id]/known-issues
 * Get all known issues for a project
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const activeOnly = url.searchParams.get('active') === 'true';

		const issues = activeOnly
			? getActiveKnownIssues(project.path)
			: getAllKnownIssues(project.path);

		const activeCount = getActiveKnownIssues(project.path).length;

		return json({
			issues,
			activeCount,
			total: getAllKnownIssues(project.path).length
		});
	} catch (err) {
		console.error('Error loading known issues:', err);
		throw error(500, 'Failed to load known issues');
	}
};

/**
 * POST /api/projects/[id]/known-issues
 * Create a new known issue
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { type, title, description } = body;

		if (!type || !title) {
			throw error(400, 'type and title are required');
		}

		const validTypes: KnownIssueType[] = ['ci_failure', 'blocker', 'bug', 'note'];
		if (!validTypes.includes(type)) {
			throw error(400, `type must be one of: ${validTypes.join(', ')}`);
		}

		const issue = createKnownIssue(project.path, {
			type,
			title,
			description
		});

		return json({
			success: true,
			issue
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error creating known issue:', err);
		throw error(500, 'Failed to create known issue');
	}
};

/**
 * PATCH /api/projects/[id]/known-issues
 * Update a known issue (requires id in body)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { id, resolve, ...updates } = body;

		if (!id) {
			throw error(400, 'id is required');
		}

		let issue;

		if (resolve) {
			// Mark as resolved
			issue = resolveKnownIssue(project.path, id);
		} else {
			// Regular update
			issue = updateKnownIssue(project.path, id, updates);
		}

		if (!issue) {
			throw error(404, 'Known issue not found');
		}

		return json({
			success: true,
			issue
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error updating known issue:', err);
		throw error(500, 'Failed to update known issue');
	}
};

/**
 * DELETE /api/projects/[id]/known-issues
 * Delete a known issue (requires id in body)
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();
		const { id } = body;

		if (!id) {
			throw error(400, 'id is required');
		}

		const deleted = deleteKnownIssue(project.path, id);

		if (!deleted) {
			throw error(404, 'Known issue not found');
		}

		return json({
			success: true,
			deleted: id
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Error deleting known issue:', err);
		throw error(500, 'Failed to delete known issue');
	}
};
