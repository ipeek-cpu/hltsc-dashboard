/**
 * Memory MCP Server Registration API
 *
 * Manages registration of the beads-memory MCP server for a project.
 * The server provides read_memory, write_memory, and search_memory tools
 * to Claude Code sessions.
 *
 * POST - Register the memory MCP server (if memory.db exists)
 * DELETE - Unregister the memory MCP server
 * GET - Check registration status
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectById } from '$lib/dashboard-db';
import {
	ensureMemoryMcpServer,
	removeMemoryMcpServer,
	readProjectMcpConfig
} from '$lib/mcp-config';
import { memoryDbExists } from '$lib/memory/db';

/**
 * GET - Check if the memory MCP server is registered
 *
 * Query params:
 * - projectPath: Optional. If not provided, uses the project's stored path
 *
 * Response:
 * - registered: boolean - Whether the server is registered
 * - memoryDbExists: boolean - Whether memory.db exists for this project
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const project = getProjectById(params.id);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const projectPath = url.searchParams.get('projectPath') || project.path;

		// Check if memory.db exists
		const hasMemoryDb = memoryDbExists(projectPath);

		// Check if MCP server is registered
		const config = readProjectMcpConfig(projectPath);
		const registered = 'beads-memory' in config;

		return json({
			registered,
			memoryDbExists: hasMemoryDb,
			serverConfig: registered ? config['beads-memory'] : null
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to check MCP status' },
			{ status: 500 }
		);
	}
};

/**
 * POST - Register the memory MCP server
 *
 * Query params:
 * - projectPath: Optional. If not provided, uses the project's stored path
 *
 * Response:
 * - success: boolean
 * - registered: boolean - Whether registration was successful
 * - message: string - Descriptive message
 */
export const POST: RequestHandler = async ({ params, url }) => {
	try {
		const project = getProjectById(params.id);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const projectPath = url.searchParams.get('projectPath') || project.path;

		const registered = ensureMemoryMcpServer(projectPath, params.id);

		return json({
			success: true,
			registered,
			message: registered ? 'MCP server registered' : 'No memory.db found - server not registered'
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to register MCP server' },
			{ status: 500 }
		);
	}
};

/**
 * DELETE - Unregister the memory MCP server
 *
 * Query params:
 * - projectPath: Optional. If not provided, uses the project's stored path
 *
 * Response:
 * - success: boolean - Whether the server was removed
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const project = getProjectById(params.id);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const projectPath = url.searchParams.get('projectPath') || project.path;

		const removed = removeMemoryMcpServer(projectPath);

		return json({
			success: removed,
			message: removed
				? 'MCP server unregistered'
				: 'MCP server was not registered'
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to unregister MCP server' },
			{ status: 500 }
		);
	}
};
