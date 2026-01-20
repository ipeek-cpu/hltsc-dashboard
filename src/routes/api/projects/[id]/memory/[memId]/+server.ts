/**
 * Single Memory Entry API Endpoints
 *
 * GET /api/projects/[id]/memory/[memId] - Get a specific memory entry
 * DELETE /api/projects/[id]/memory/[memId] - Soft-delete a memory entry
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getMemoryEntry,
	softDeleteMemoryEntry,
	memoryDbExists
} from '$lib/memory/db';
import type { MemoryApiError, MemoryDeleteResponse } from '$lib/memory/types';

/**
 * GET /api/projects/[id]/memory/[memId]
 * Get a specific memory entry by ID
 *
 * Query params:
 * - projectPath: Required. Path to the project root
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = url.searchParams.get('projectPath');

	if (!projectPath) {
		return json(
			{ error: 'MISSING_PATH', message: 'projectPath query parameter is required' } as MemoryApiError,
			{ status: 400 }
		);
	}

	if (!memoryDbExists(projectPath)) {
		return json(
			{ error: 'ENTRY_NOT_FOUND', message: 'Memory entry not found' } as MemoryApiError,
			{ status: 404 }
		);
	}

	try {
		const entry = getMemoryEntry(projectPath, params.memId);

		if (!entry) {
			return json(
				{ error: 'ENTRY_NOT_FOUND', message: 'Memory entry not found' } as MemoryApiError,
				{ status: 404 }
			);
		}

		// Don't return soft-deleted entries via this endpoint
		if (entry.deletedAt) {
			return json(
				{ error: 'ENTRY_NOT_FOUND', message: 'Memory entry not found' } as MemoryApiError,
				{ status: 404 }
			);
		}

		return json(entry);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: 'QUERY_FAILED', message } as MemoryApiError,
			{ status: 500 }
		);
	}
};

/**
 * DELETE /api/projects/[id]/memory/[memId]
 * Soft-delete a memory entry (sets deleted_at timestamp)
 *
 * Query params:
 * - projectPath: Required. Path to the project root
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const projectPath = url.searchParams.get('projectPath');

	if (!projectPath) {
		return json(
			{ error: 'MISSING_PATH', message: 'projectPath query parameter is required' } as MemoryApiError,
			{ status: 400 }
		);
	}

	if (!memoryDbExists(projectPath)) {
		return json(
			{ error: 'ENTRY_NOT_FOUND', message: 'Memory entry not found' } as MemoryApiError,
			{ status: 404 }
		);
	}

	try {
		const deleted = softDeleteMemoryEntry(projectPath, params.memId);

		if (!deleted) {
			return json(
				{ error: 'ENTRY_NOT_FOUND', message: 'Memory entry not found' } as MemoryApiError,
				{ status: 404 }
			);
		}

		const response: MemoryDeleteResponse = {
			success: true,
			deletedAt: new Date().toISOString()
		};

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: 'QUERY_FAILED', message } as MemoryApiError,
			{ status: 500 }
		);
	}
};
