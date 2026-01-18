/**
 * Global MCP Server Configuration API
 * Manages MCP servers in ~/.claude.json
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import {
	readGlobalMcpConfig,
	writeGlobalMcpServer,
	validateMcpConfig,
	maskEnvValue
} from '$lib/mcp-config';
import type { McpServerConfig } from '$lib/types';

/**
 * GET - List all global MCP servers
 */
export async function GET() {
	try {
		const servers = readGlobalMcpConfig();

		// Mask sensitive env values in response
		const maskedServers: Record<string, McpServerConfig> = {};
		for (const [name, config] of Object.entries(servers)) {
			maskedServers[name] = {
				...config,
				env: config.env
					? Object.fromEntries(
							Object.entries(config.env).map(([key, value]) => [key, maskEnvValue(key, value)])
						)
					: undefined
			};
		}

		return json({
			servers: maskedServers,
			count: Object.keys(servers).length
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to read MCP config' },
			{ status: 500 }
		);
	}
};

/**
 * POST - Add a new global MCP server
 * Body: { name: string, config: McpServerConfig }
 */
export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { name, config } = body as { name: string; config: McpServerConfig };

		if (!name || typeof name !== 'string') {
			return json({ error: 'Server name is required' }, { status: 400 });
		}

		if (!config || typeof config !== 'object') {
			return json({ error: 'Server config is required' }, { status: 400 });
		}

		// Validate config
		const validation = validateMcpConfig(config);
		if (!validation.valid) {
			return json({ error: 'Invalid config', details: validation.errors }, { status: 400 });
		}

		// Check if server already exists
		const existing = readGlobalMcpConfig();
		if (name in existing) {
			return json({ error: `Server "${name}" already exists` }, { status: 409 });
		}

		writeGlobalMcpServer(name, config);

		return json({
			success: true,
			name,
			message: `MCP server "${name}" added to global config`
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to add MCP server' },
			{ status: 500 }
		);
	}
};
