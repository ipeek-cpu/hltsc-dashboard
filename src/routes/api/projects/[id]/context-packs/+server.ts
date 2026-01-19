/**
 * Context Packs API
 *
 * POST /api/projects/[id]/context-packs - Generate a new context pack
 * GET /api/projects/[id]/context-packs - List context packs for project
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	createContextPackGenerator,
	generateQuickContext,
	packToSummary
} from '$lib/context-pack-generator';
import type { ContextPackRequest } from '$lib/context-pack-types';
import { packToMarkdown } from '$lib/context-pack-types';

// In-memory cache for generated packs (could be persisted to disk later)
const contextPackCache = new Map<string, any>();

/**
 * POST - Generate a new context pack
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectId = params.id;

	// Get project info
	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	try {
		const body = await request.json();

		// Validate request
		if (!body.entryPoint) {
			throw error(400, 'entryPoint is required');
		}

		const packRequest: ContextPackRequest = {
			name: body.name || `Context: ${body.entryPoint.slice(0, 50)}`,
			entryPoint: body.entryPoint,
			entryPointType: body.entryPointType || 'query',
			description: body.description,
			config: body.config
		};

		// Generate the pack
		const generator = await createContextPackGenerator(project.path, projectId);
		const pack = await generator.generate(packRequest);

		// Cache it
		contextPackCache.set(pack.id, pack);

		// Also cache by project for listing
		const projectPacks = contextPackCache.get(`project:${projectId}`) || [];
		projectPacks.push(packToSummary(pack));
		contextPackCache.set(`project:${projectId}`, projectPacks);

		return json({
			success: true,
			pack: {
				id: pack.id,
				name: pack.name,
				description: pack.description,
				generationMethod: pack.generationMethod,
				fileCount: pack.files.length,
				symbolCount: pack.symbols.length,
				totalTokens: pack.totalTokens,
				createdAt: pack.createdAt,
				metadata: pack.metadata
			}
		});
	} catch (err) {
		console.error('Context pack generation error:', err);
		throw error(500, err instanceof Error ? err.message : 'Generation failed');
	}
};

/**
 * GET - List context packs or get a specific pack
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const packId = url.searchParams.get('packId');
	const format = url.searchParams.get('format') || 'json';

	// Get project info
	const project = getProjectById(projectId);
	if (!project) {
		throw error(404, 'Project not found');
	}

	// If packId provided, return that specific pack
	if (packId) {
		const pack = contextPackCache.get(packId);
		if (!pack) {
			throw error(404, 'Context pack not found');
		}

		if (format === 'markdown') {
			return new Response(packToMarkdown(pack), {
				headers: { 'Content-Type': 'text/markdown' }
			});
		}

		return json({ pack });
	}

	// Otherwise list all packs for project
	const projectPacks = contextPackCache.get(`project:${projectId}`) || [];
	return json({ packs: projectPacks });
};
