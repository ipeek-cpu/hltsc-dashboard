import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { getProjectById } from '$lib/dashboard-db';
import { reindexIntent, hasIntentFile } from '$lib/intent/cache';
import type { IntentErrorResponse } from '$lib/intent/types';

/**
 * POST /api/projects/[id]/intent/reindex
 *
 * Force re-parse and cache update for the PROJECT_INTENT.md file.
 * Useful when you want to ensure the cache is fresh, or after
 * editing the intent file externally.
 */
export const POST: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json(
			{ error: 'intent_not_found', message: 'Project not found' } as IntentErrorResponse,
			{ status: 404 }
		);
	}

	const projectPath = project.path;

	if (!hasIntentFile(projectPath)) {
		return json(
			{ error: 'intent_not_found', message: 'PROJECT_INTENT.md not found' } as IntentErrorResponse,
			{ status: 404 }
		);
	}

	try {
		const result = await reindexIntent(projectPath, params.id);
		if (!result) {
			return json(
				{ error: 'parse_error', message: 'Failed to reindex intent' } as IntentErrorResponse,
				{ status: 500 }
			);
		}

		// Count sections with explicit anchors
		const anchorCount = countAnchorsInSections(result.intent.sections);

		return json({
			success: true,
			hash: result.hash,
			anchorCount,
			sectionCount: countAllSections(result.intent.sections)
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: 'parse_error', message } as IntentErrorResponse,
			{ status: 500 }
		);
	}
};

/**
 * Count total anchors in sections recursively
 */
function countAnchorsInSections(
	sections: { anchor?: string; children: { anchor?: string; children: unknown[] }[] }[]
): number {
	let count = 0;
	for (const section of sections) {
		if (section.anchor) {
			count++;
		}
		count += countAnchorsInSections(
			section.children as { anchor?: string; children: { anchor?: string; children: unknown[] }[] }[]
		);
	}
	return count;
}

/**
 * Count total sections recursively
 */
function countAllSections(
	sections: { children: unknown[] }[]
): number {
	let count = sections.length;
	for (const section of sections) {
		count += countAllSections(section.children as { children: unknown[] }[]);
	}
	return count;
}
