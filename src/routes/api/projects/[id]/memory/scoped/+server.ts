/**
 * Scoped Memory Retrieval Endpoint
 *
 * GET /api/projects/[id]/memory/scoped
 * Returns hierarchical scoped memories for a bead with a pre-built memory brief.
 *
 * Query params:
 * - projectPath: Required. Path to the project root
 * - beadId: Required. Bead ID for scoped retrieval
 * - epicId: Optional. Override epic ID lookup
 * - maxTokens: Optional. Token budget for brief (default: 2000)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getScopedMemories, buildMemoryBrief, rankMemories } from '$lib/memory/retrieval';
import { memoryDbExists } from '$lib/memory/db';
import type { ScopedMemoryResponse, MemoryApiError } from '$lib/memory/types';

// GET /api/projects/[id]/memory/scoped
// Get hierarchical scoped memories for a bead
export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const projectPath = url.searchParams.get('projectPath');
	const beadId = url.searchParams.get('beadId');

	if (!projectPath) {
		return json(
			{ error: 'MISSING_PATH', message: 'projectPath required' } as MemoryApiError,
			{ status: 400 }
		);
	}

	if (!beadId) {
		return json(
			{ error: 'INVALID_ENTRY', message: 'beadId required for scoped retrieval' } as MemoryApiError,
			{ status: 400 }
		);
	}

	if (!memoryDbExists(projectPath)) {
		// Return empty scoped result if no memory db
		return json({
			beadMemories: [],
			epicMemories: [],
			projectConstraints: [],
			activeConstraints: [],
			brief: { text: '', tokenEstimate: 0, includedCount: 0, truncatedCount: 0 }
		} as ScopedMemoryResponse);
	}

	try {
		const epicId = url.searchParams.get('epicId') || undefined;
		const maxTokens = parseInt(url.searchParams.get('maxTokens') || '2000', 10);

		const scoped = getScopedMemories(projectPath, {
			projectId,
			beadId,
			epicId
		});

		// Build ranked memories for brief
		const allMemories = [
			...scoped.beadMemories,
			...scoped.epicMemories,
			...scoped.activeConstraints
		];

		const ranked = rankMemories(allMemories, { beadId, epicId });
		const brief = buildMemoryBrief(ranked, { maxTokens });

		const response: ScopedMemoryResponse = {
			beadMemories: scoped.beadMemories,
			epicMemories: scoped.epicMemories,
			projectConstraints: scoped.projectConstraints,
			activeConstraints: scoped.activeConstraints,
			brief
		};

		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: 'QUERY_FAILED', message } as MemoryApiError, { status: 500 });
	}
};
