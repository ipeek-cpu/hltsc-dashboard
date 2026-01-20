/**
 * Memory API Endpoints
 *
 * GET /api/projects/[id]/memory - List memory entries with filters
 * POST /api/projects/[id]/memory - Create a new memory entry
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createMemoryEntry,
	listMemoryEntries,
	memoryDbExists,
	initMemoryDb
} from '$lib/memory/db';
import type {
	MemoryKind,
	MemoryListResponse,
	MemoryCreateResponse,
	MemoryApiError
} from '$lib/memory/types';
import { MEMORY_KINDS } from '$lib/memory/types';

/**
 * GET /api/projects/[id]/memory
 * List memory entries with optional filters
 *
 * Query params:
 * - projectPath: Required. Path to the project root
 * - beadId: Filter by bead ID
 * - epicId: Filter by epic ID
 * - kinds: Comma-separated list of memory kinds to filter
 * - limit: Maximum number of entries (default: 50, max: 100)
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const projectPath = url.searchParams.get('projectPath');

	if (!projectPath) {
		return json(
			{ error: 'MISSING_PATH', message: 'projectPath query parameter is required' } as MemoryApiError,
			{ status: 400 }
		);
	}

	// If database doesn't exist, return empty list (not an error)
	if (!memoryDbExists(projectPath)) {
		const response: MemoryListResponse = {
			memories: [],
			pagination: {
				total: 0,
				returned: 0,
				hasMore: false
			}
		};
		return json(response);
	}

	try {
		// Parse filter parameters
		const beadId = url.searchParams.get('beadId') || undefined;
		const epicId = url.searchParams.get('epicId') || undefined;
		const kindsParam = url.searchParams.get('kinds');
		const kinds = kindsParam
			? (kindsParam
					.split(',')
					.filter((k) => MEMORY_KINDS.includes(k as MemoryKind)) as MemoryKind[])
			: undefined;
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

		const entries = listMemoryEntries(projectPath, {
			projectId,
			beadId,
			epicId,
			kinds,
			limit: limit + 1, // Fetch one extra to check hasMore
			includeDeleted: false
		});

		// Check if there are more entries
		const hasMore = entries.length > limit;
		const returnedEntries = hasMore ? entries.slice(0, limit) : entries;

		const response: MemoryListResponse = {
			memories: returnedEntries,
			pagination: {
				total: returnedEntries.length,
				returned: returnedEntries.length,
				hasMore
			}
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

/**
 * POST /api/projects/[id]/memory
 * Create a new memory entry
 *
 * Query params:
 * - projectPath: Required. Path to the project root
 *
 * Body:
 * - kind: Required. One of: decision, checkpoint, constraint, next_step, action_report, ci_note
 * - title: Required. Brief title for the entry
 * - content: Required. Primary content (markdown supported)
 * - beadId: Optional. Bead ID for bead-scoped entries
 * - epicId: Optional. Epic ID for epic-scoped entries
 * - sessionId: Optional. Dashboard session ID
 * - chatId: Optional. Claude chat ID
 * - agentName: Optional. Name of the creating agent
 * - data: Optional. JSON metadata
 * - intentAnchors: Optional. Links to intent anchor paths
 * - expiresAt: Optional. ISO 8601 expiration timestamp
 */
export const POST: RequestHandler = async ({ params, request, url }) => {
	const projectId = params.id;
	const projectPath = url.searchParams.get('projectPath');

	if (!projectPath) {
		return json(
			{ error: 'MISSING_PATH', message: 'projectPath query parameter is required' } as MemoryApiError,
			{ status: 400 }
		);
	}

	try {
		const body = await request.json();

		// Validate required fields
		if (!body.kind || !MEMORY_KINDS.includes(body.kind)) {
			return json(
				{
					error: 'INVALID_ENTRY',
					message: 'Invalid or missing kind',
					details: { validKinds: [...MEMORY_KINDS] }
				} as MemoryApiError,
				{ status: 400 }
			);
		}

		if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
			return json(
				{ error: 'INVALID_ENTRY', message: 'title is required and must be a non-empty string' } as MemoryApiError,
				{ status: 400 }
			);
		}

		if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
			return json(
				{ error: 'INVALID_ENTRY', message: 'content is required and must be a non-empty string' } as MemoryApiError,
				{ status: 400 }
			);
		}

		// Initialize DB if it doesn't exist
		if (!memoryDbExists(projectPath)) {
			initMemoryDb(projectPath);
		}

		const id = createMemoryEntry(projectPath, {
			projectId,
			beadId: body.beadId,
			epicId: body.epicId,
			sessionId: body.sessionId,
			chatId: body.chatId,
			agentName: body.agentName,
			kind: body.kind,
			title: body.title.trim(),
			content: body.content.trim(),
			data: body.data,
			intentAnchors: body.intentAnchors,
			expiresAt: body.expiresAt
		});

		const response: MemoryCreateResponse = {
			id,
			createdAt: new Date().toISOString()
		};

		return json(response, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: 'CREATE_FAILED', message } as MemoryApiError,
			{ status: 500 }
		);
	}
};
