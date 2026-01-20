import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

import { getProjectById } from '$lib/dashboard-db';
import type { IntentLinksFile, IntentLink } from '$lib/intent/types';
import { DEFAULT_INTENT_LINKS_FILE } from '$lib/intent/types';

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

	const linksPath = join(projectPath, '.beads', 'intent-links.json');

	if (!existsSync(linksPath)) {
		return json({ links: [] });
	}

	try {
		const content = await readFile(linksPath, 'utf-8');
		const data: IntentLinksFile = JSON.parse(content);

		// Validate schema
		if (!Array.isArray(data.links)) {
			return json({ links: [] });
		}

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
