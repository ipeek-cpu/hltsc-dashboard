/**
 * Project MCP Server Configuration API
 * Manages MCP servers in <project>/.mcp.json
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { getProjectById } from '$lib/dashboard-db';
import {
	readProjectMcpConfig,
	writeProjectMcpServer,
	getMergedMcpServers,
	validateMcpConfig,
	maskEnvValue,
	projectHasMcpConfig
} from '$lib/mcp-config';
import type { McpServerConfig } from '$lib/types';

/**
 * GET - List project MCP servers (and optionally merged with global)
 * Query params: merged (boolean) - include global servers
 */
export async function GET({ params, url }: RequestEvent) {
	try {
		const project = getProjectById(params.id as string);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		const merged = url.searchParams.get('merged') === 'true';

		if (merged) {
			// Return all servers with scope information
			const servers = getMergedMcpServers(project.path);
			return json({
				servers: servers.map((s) => ({
					...s,
					config: {
						...s.config,
						env: s.config.env
							? Object.fromEntries(
									Object.entries(s.config.env).map(([key, value]) => [key, maskEnvValue(key, value)])
								)
							: undefined
					}
				})),
				count: servers.length,
				hasProjectConfig: projectHasMcpConfig(project.path)
			});
		}

		// Return only project servers
		const servers = readProjectMcpConfig(project.path);

		// Mask sensitive env values
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
			count: Object.keys(servers).length,
			hasProjectConfig: projectHasMcpConfig(project.path)
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to read MCP config' },
			{ status: 500 }
		);
	}
}

/**
 * POST - Add a new project-level MCP server
 * Body: { name: string, config: McpServerConfig }
 */
export async function POST({ params, request }: RequestEvent) {
	try {
		const project = getProjectById(params.id as string);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

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

		// Check if server already exists in project
		const existing = readProjectMcpConfig(project.path);
		if (name in existing) {
			return json({ error: `Server "${name}" already exists in this project` }, { status: 409 });
		}

		writeProjectMcpServer(project.path, name, config);

		return json({
			success: true,
			name,
			message: `MCP server "${name}" added to project`
		});
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to add MCP server' },
			{ status: 500 }
		);
	}
}
