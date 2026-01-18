/**
 * Individual Global MCP Server API
 * Manages a specific MCP server in ~/.claude.json
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import {
	readGlobalMcpConfig,
	writeGlobalMcpServer,
	deleteGlobalMcpServer,
	validateMcpConfig,
	maskEnvValue
} from '$lib/mcp-config';
import type { McpServerConfig } from '$lib/types';

/**
 * GET - Get a specific global MCP server
 */
export async function GET({ params }: RequestEvent) {
	try {
		const name = params.name as string;
		const servers = readGlobalMcpConfig();

		if (!(name in servers)) {
			return json({ error: `Server "${name}" not found` }, { status: 404 });
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
 * PUT - Update a global MCP server
 * Body: { config: McpServerConfig }
 */
export async function PUT({ params, request }: RequestEvent) {
	try {
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

		writeGlobalMcpServer(name, config);

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
 * DELETE - Remove a global MCP server
 */
export async function DELETE({ params }: RequestEvent) {
	try {
		const name = params.name as string;
		const deleted = deleteGlobalMcpServer(name);

		if (!deleted) {
			return json({ error: `Server "${name}" not found` }, { status: 404 });
		}

		return json({
			success: true,
			name,
			message: `MCP server "${name}" deleted`
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to delete MCP server' },
			{ status: 500 }
		);
	}
}
