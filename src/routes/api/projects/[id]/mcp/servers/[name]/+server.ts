/**
 * Individual Project MCP Server API
 * Manages a specific MCP server in <project>/.mcp.json
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import {
	readProjectMcpConfig,
	writeProjectMcpServer,
	deleteProjectMcpServer,
	validateMcpConfig,
	maskEnvValue
} from '$lib/mcp-config';
import type { McpServerConfig } from '$lib/types';

/**
 * GET - Get a specific project MCP server
 */
export async function GET({ params }: RequestEvent) {
	try {
		const project = getProjectById(params.id as string);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const servers = readProjectMcpConfig(project.path);
		const name = params.name as string;

		if (!(name in servers)) {
			return json({ error: `Server "${name}" not found in project` }, { status: 404 });
		}

		const config = servers[name];
		const maskedConfig: McpServerConfig = {
			...config,
			env: config.env
				? Object.fromEntries(
						Object.entries(config.env).map(([key, value]) => [key, maskEnvValue(key, value)])
					)
				: undefined
		};

		return json({
			name,
			config: maskedConfig
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to get MCP server' },
			{ status: 500 }
		);
	}
}

/**
 * PUT - Update a project MCP server
 * Body: { config: McpServerConfig }
 */
export async function PUT({ params, request }: RequestEvent) {
	try {
		const project = getProjectById(params.id as string);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const name = params.name as string;
		const body = await request.json();
		const { config } = body as { config: McpServerConfig };

		if (!config || typeof config !== 'object') {
			return json({ error: 'Server config is required' }, { status: 400 });
		}

		// Validate config
		const validation = validateMcpConfig(config);
		if (!validation.valid) {
			return json({ error: 'Invalid config', details: validation.errors }, { status: 400 });
		}

		writeProjectMcpServer(project.path, name, config);

		return json({
			success: true,
			name,
			message: `MCP server "${name}" updated`
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to update MCP server' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE - Remove a project MCP server
 */
export async function DELETE({ params }: RequestEvent) {
	try {
		const project = getProjectById(params.id as string);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const name = params.name as string;
		const deleted = deleteProjectMcpServer(project.path, name);

		if (!deleted) {
			return json({ error: `Server "${name}" not found in project` }, { status: 404 });
		}

		return json({
			success: true,
			name,
			message: `MCP server "${name}" deleted from project`
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to delete MCP server' },
			{ status: 500 }
		);
	}
}
