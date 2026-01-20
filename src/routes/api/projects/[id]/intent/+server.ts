import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import { getProjectById } from '$lib/dashboard-db';
import { loadProjectIntent, reindexIntent, hasIntentFile, computeFileHash } from '$lib/intent/cache';
import { parseIntentDocument, extractAnchorsWithLineNumbers } from '$lib/intent/parser';
import { INTENT_FILENAME } from '$lib/intent/types';
import type {
	IntentGetResponse,
	IntentPutRequest,
	IntentPutResponse,
	IntentErrorResponse
} from '$lib/intent/types';

/**
 * GET /api/projects/[id]/intent
 *
 * Returns the project intent with anchors and cache status.
 * The PROJECT_INTENT.md file must exist in the project root.
 */
export const GET: RequestHandler = async ({ params }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json(
			{ error: 'intent_not_found', message: 'Project not found' } as IntentErrorResponse,
			{ status: 404 }
		);
	}

	const projectPath = project.path;

	// Check if intent file exists
	if (!hasIntentFile(projectPath)) {
		return json(
			{ error: 'intent_not_found', message: 'PROJECT_INTENT.md not found' } as IntentErrorResponse,
			{ status: 404 }
		);
	}

	try {
		const result = await loadProjectIntent(projectPath, params.id);
		if (!result) {
			return json(
				{
					error: 'parse_error',
					message: 'Failed to parse intent document'
				} as IntentErrorResponse,
				{ status: 500 }
			);
		}

		const { intent, anchors, fromCache } = result;

		// Get the file hash for cache info
		const intentPath = join(projectPath, INTENT_FILENAME);
		const content = await readFile(intentPath, 'utf-8');
		const fileHash = computeFileHash(content);

		const response: IntentGetResponse = {
			intent: {
				metadata: {
					version: intent.version,
					createdAt: intent.createdAt,
					updatedAt: intent.updatedAt
				},
				sections: intent.sections,
				anchors
			},
			cache: {
				indexedAt: new Date().toISOString(),
				fileHash,
				isStale: !fromCache
			}
		};

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: 'parse_error', message } as IntentErrorResponse,
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/projects/[id]/intent
 *
 * Update the intent document. Validates the content before saving
 * and updates the cache.
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const project = getProjectById(params.id);

	if (!project) {
		return json(
			{ error: 'intent_not_found', message: 'Project not found' } as IntentErrorResponse,
			{ status: 404 }
		);
	}

	const projectPath = project.path;

	try {
		const body = (await request.json()) as IntentPutRequest;

		if (!body.content) {
			return json(
				{ error: 'invalid_intent', message: 'content is required' } as IntentErrorResponse,
				{ status: 400 }
			);
		}

		// Parse to validate the document structure
		const parseResult = parseIntentDocument(body.content);

		// Write file first (even with warnings - warnings are non-fatal)
		const intentPath = join(projectPath, INTENT_FILENAME);
		await writeFile(intentPath, body.content, 'utf-8');

		// Reindex cache to update with new content
		const indexed = await reindexIntent(projectPath, params.id);

		// Re-extract anchors with line numbers for the response
		const anchors = extractAnchorsWithLineNumbers(body.content);
		const fileHash = indexed?.hash || computeFileHash(body.content);

		const response: IntentPutResponse = {
			success: true,
			intent: {
				metadata: {
					version: parseResult.intent.version,
					createdAt: parseResult.intent.createdAt,
					updatedAt: parseResult.intent.updatedAt
				},
				sections: parseResult.intent.sections,
				anchors
			},
			cache: {
				indexedAt: new Date().toISOString(),
				fileHash,
				isStale: false
			}
		};

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';

		// Distinguish between write errors and parse errors
		if (message.includes('ENOENT') || message.includes('EACCES') || message.includes('EPERM')) {
			return json(
				{ error: 'write_error', message } as IntentErrorResponse,
				{ status: 500 }
			);
		}

		return json(
			{ error: 'parse_error', message } as IntentErrorResponse,
			{ status: 500 }
		);
	}
};
