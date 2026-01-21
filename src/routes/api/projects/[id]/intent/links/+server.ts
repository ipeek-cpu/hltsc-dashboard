import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { getProjectById } from '$lib/dashboard-db';
import type { IntentLink } from '$lib/intent/types';
import {
	loadIntentLinks,
	addIntentLink,
	removeIntentLink
} from '$lib/intent/links';

/**
 * GET /api/projects/[id]/intent/links
 *
 * Returns intent links for a project, optionally filtered by beadId.
 *
 * Query params:
 * - beadId: Filter links to only those for a specific bead
 *
 * Returns array of links with anchor and previewText for UI display.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;
	const beadId = url.searchParams.get('beadId');

	try {
		const data = await loadIntentLinks(projectPath);

		// Filter by beadId if provided
		let links: IntentLink[] = data.links;
		if (beadId) {
			links = links.filter((link) => link.beadId === beadId);
		}

		// Map to UI format with preview text
		const uiLinks = links.map((link) => ({
			anchor: link.anchor,
			relevance: link.relevance,
			previewText: link.note || undefined,
			addedBy: link.addedBy,
			addedAt: link.addedAt
		}));

		return json({ links: uiLinks });
	} catch (e) {
		// If file is malformed, return empty links
		console.error('Error reading intent-links.json:', e);
		return json({ links: [] });
	}
};

/**
 * POST /api/projects/[id]/intent/links
 *
 * Create a new intent link.
 *
 * Request body:
 * - beadId: string (required)
 * - anchor: string (required)
 * - relevance?: 'primary' | 'related' (default: 'primary')
 * - addedBy?: 'user' | 'agent' (default: 'user')
 * - note?: string
 *
 * Returns the created link.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;

	try {
		const body = await request.json();

		if (!body.beadId || !body.anchor) {
			return json({ error: 'beadId and anchor are required' }, { status: 400 });
		}

		const link = await addIntentLink(projectPath, {
			beadId: body.beadId,
			anchor: body.anchor,
			relevance: body.relevance || 'primary',
			addedBy: body.addedBy || 'user',
			note: body.note
		});

		return json(link, { status: 201 });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		// Check for duplicate link error
		if (message.includes('already exists')) {
			return json({ error: message }, { status: 409 });
		}
		return json({ error: message }, { status: 400 });
	}
};

/**
 * DELETE /api/projects/[id]/intent/links
 *
 * Remove an intent link.
 *
 * Query params:
 * - beadId: string (required)
 * - anchor: string (required)
 *
 * Returns success status.
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	const projectPath = project.path;
	const beadId = url.searchParams.get('beadId');
	const anchor = url.searchParams.get('anchor');

	if (!beadId || !anchor) {
		return json({ error: 'beadId and anchor are required' }, { status: 400 });
	}

	try {
		const removed = await removeIntentLink(projectPath, beadId, anchor);
		return json({ success: removed });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
};
